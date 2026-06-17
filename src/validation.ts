/**
 * Color graph validation and topological sort.
 *
 * `validateColorDefs` rejects bad references (missing / shadow-referencing /
 * base/contrast/lightness mismatches) and detects cycles before the
 * resolver runs. `topoSort` orders defs so each color is processed after
 * its base / bg / fg / target dependencies.
 */

import { isAbsoluteTone } from './hc-pair';
import { isMixDef, isShadowDef } from './shadow';
import type { ColorMap, RegularColorDef, ResolvedColor } from './types';

export function validateColorDefs(
  defs: ColorMap,
  externalBases?: Map<string, ResolvedColor>,
): void {
  const localNames = new Set(Object.keys(defs));
  const allNames = new Set([
    ...localNames,
    ...(externalBases ? externalBases.keys() : []),
  ]);

  for (const [name, def] of Object.entries(defs)) {
    if (isShadowDef(def)) {
      if (!allNames.has(def.bg)) {
        throw new Error(
          `glaze: shadow "${name}" references non-existent bg "${def.bg}".`,
        );
      }
      if (localNames.has(def.bg) && isShadowDef(defs[def.bg])) {
        throw new Error(
          `glaze: shadow "${name}" bg "${def.bg}" references another shadow color.`,
        );
      }
      if (def.fg !== undefined) {
        if (!allNames.has(def.fg)) {
          throw new Error(
            `glaze: shadow "${name}" references non-existent fg "${def.fg}".`,
          );
        }
        if (localNames.has(def.fg) && isShadowDef(defs[def.fg])) {
          throw new Error(
            `glaze: shadow "${name}" fg "${def.fg}" references another shadow color.`,
          );
        }
      }
      continue;
    }

    if (isMixDef(def)) {
      if (!allNames.has(def.base)) {
        throw new Error(
          `glaze: mix "${name}" references non-existent base "${def.base}".`,
        );
      }
      if (!allNames.has(def.target)) {
        throw new Error(
          `glaze: mix "${name}" references non-existent target "${def.target}".`,
        );
      }
      if (localNames.has(def.base) && isShadowDef(defs[def.base])) {
        throw new Error(
          `glaze: mix "${name}" base "${def.base}" references a shadow color.`,
        );
      }
      if (localNames.has(def.target) && isShadowDef(defs[def.target])) {
        throw new Error(
          `glaze: mix "${name}" target "${def.target}" references a shadow color.`,
        );
      }
      continue;
    }

    const regDef = def as RegularColorDef;

    if (regDef.contrast !== undefined && !regDef.base) {
      throw new Error(`glaze: color "${name}" has "contrast" without "base".`);
    }

    if (
      regDef.tone !== undefined &&
      !isAbsoluteTone(regDef.tone) &&
      !regDef.base
    ) {
      throw new Error(
        `glaze: color "${name}" has relative "tone" without "base".`,
      );
    }

    if (regDef.base && !allNames.has(regDef.base)) {
      throw new Error(
        `glaze: color "${name}" references non-existent base "${regDef.base}".`,
      );
    }

    if (
      regDef.base &&
      localNames.has(regDef.base) &&
      isShadowDef(defs[regDef.base])
    ) {
      throw new Error(
        `glaze: color "${name}" base "${regDef.base}" references a shadow color.`,
      );
    }

    if (!isAbsoluteTone(regDef.tone) && regDef.base === undefined) {
      throw new Error(
        `glaze: color "${name}" must have either absolute "tone" (root) or "base" (dependent).`,
      );
    }

    if (regDef.contrast !== undefined && regDef.opacity !== undefined) {
      console.warn(
        `glaze: color "${name}" has both "contrast" and "opacity". Opacity makes perceived tone unpredictable.`,
      );
    }
  }

  // Check for circular references (follows base, bg, fg edges).
  // External bases are leaves (no outgoing edges in `defs`), so they can't
  // form a cycle and we short-circuit there.
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(name: string): void {
    if (!localNames.has(name)) return;
    if (inStack.has(name)) {
      throw new Error(
        `glaze: circular base reference detected involving "${name}".`,
      );
    }
    if (visited.has(name)) return;

    inStack.add(name);
    const def = defs[name];
    if (isShadowDef(def)) {
      dfs(def.bg);
      if (def.fg) dfs(def.fg);
    } else if (isMixDef(def)) {
      dfs(def.base);
      dfs(def.target);
    } else {
      const regDef = def as RegularColorDef;
      if (regDef.base) {
        dfs(regDef.base);
      }
    }
    inStack.delete(name);
    visited.add(name);
  }

  for (const name of localNames) {
    dfs(name);
  }
}

export function topoSort(defs: ColorMap): string[] {
  const result: string[] = [];
  const visited = new Set<string>();

  function visit(name: string): void {
    if (visited.has(name)) return;
    visited.add(name);

    const def = defs[name];
    // External base references (not in `defs`) are leaves — they're already
    // pre-seeded into `ctx.resolved` and don't participate in the local sort.
    if (def === undefined) return;
    if (isShadowDef(def)) {
      visit(def.bg);
      if (def.fg) visit(def.fg);
    } else if (isMixDef(def)) {
      visit(def.base);
      visit(def.target);
    } else {
      const regDef = def as RegularColorDef;
      if (regDef.base) {
        visit(regDef.base);
      }
    }

    result.push(name);
  }

  for (const name of Object.keys(defs)) {
    visit(name);
  }

  return result;
}
