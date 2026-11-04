/**
 * Palette demos for the exporting page: build a real `glaze.palette()` from
 * plain props, run its exporters, and print the source that produced it.
 *
 * Themes are declared in order. A theme is either a root theme (`hue`,
 * `saturation`, `colors`), a child of an earlier one (`extends` — built with
 * `theme.extend()`), or an alias that reuses an earlier entry's instance
 * (`alias` — the same theme under a second palette name).
 */

import { glaze, literal, themeSource } from '../glaze-docs';
import type { ColorMap, GlazePalette, GlazeTheme } from '../../../src/index.ts';

export interface PaletteThemeSpec {
  hue?: number;
  saturation?: number;
  colors?: ColorMap;
  /** Build this theme as `<extends>.extend({ hue, saturation, colors })`. */
  extends?: string;
  /** Reuse an earlier entry's theme instance under this palette name. */
  alias?: string;
}

/** One export call: the options passed to `palette.tokens()`. */
export interface PrefixCall {
  prefix?: boolean | Record<string, string>;
  primary?: string | false;
}

export interface PaletteDemoProps {
  themes: Record<string, PaletteThemeSpec>;
  /** Palette-level `primary` (`glaze.palette(themes, { primary })`). */
  primary?: string;
  calls: PrefixCall[];
}

function varName(name: string): string {
  const camel = name.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
  return `${camel}Theme`;
}

/** The theme instance each palette entry points to (aliases resolved). */
function instanceName(
  themes: Record<string, PaletteThemeSpec>,
  name: string,
): string {
  const spec = themes[name];
  return spec?.alias ? instanceName(themes, spec.alias) : name;
}

export function buildPalette(props: PaletteDemoProps): GlazePalette {
  const built: Record<string, GlazeTheme> = {};
  for (const [name, spec] of Object.entries(props.themes)) {
    if (spec.alias) {
      const target = built[spec.alias];
      if (!target)
        throw new Error(`docs: unknown alias target "${spec.alias}".`);
      built[name] = target;
    } else if (spec.extends) {
      const parent = built[spec.extends];
      if (!parent) throw new Error(`docs: unknown parent "${spec.extends}".`);
      built[name] = parent.extend({
        hue: spec.hue,
        saturation: spec.saturation,
        colors: spec.colors,
      });
    } else {
      const theme = glaze(spec.hue ?? 0, spec.saturation ?? 0);
      if (spec.colors) theme.colors(spec.colors);
      built[name] = theme;
    }
  }
  return glaze.palette(
    built,
    props.primary === undefined ? undefined : { primary: props.primary },
  );
}

/** `tokens(...)` call text for a panel heading or the source listing. */
export function callText(call: PrefixCall): string {
  const entries = Object.entries(call).filter(([, v]) => v !== undefined);
  return entries.length === 0
    ? 'tokens()'
    : `tokens(${literal(Object.fromEntries(entries))})`;
}

/** The TypeScript source behind a palette demo. */
export function paletteSource(props: PaletteDemoProps): string {
  const blocks: string[] = ["import { glaze } from '@tenphi/glaze';"];
  for (const [name, spec] of Object.entries(props.themes)) {
    if (spec.alias) continue;
    if (spec.extends) {
      const fields = Object.entries({
        hue: spec.hue,
        saturation: spec.saturation,
        colors: spec.colors,
      }).filter(([, v]) => v !== undefined);
      const head = `const ${varName(name)} = ${varName(spec.extends)}.extend(`;
      const flat = `${head}${literal(Object.fromEntries(fields))});`;
      blocks.push(
        flat.length <= 80 && !flat.includes('\n')
          ? flat
          : `${head}{\n${fields
              .map(([k, v]) => `  ${k}: ${literal(v, 1)},`)
              .join('\n')}\n});`,
      );
    } else {
      blocks.push(
        themeSource(
          {
            hue: spec.hue ?? 0,
            saturation: spec.saturation,
            colors: spec.colors ?? {},
          },
          varName(name),
        ),
      );
    }
  }

  const entries = Object.entries(props.themes).map(([name, spec]) => {
    const key = /^[A-Za-z_$][\w$]*$/.test(name) ? name : `'${name}'`;
    const value = varName(instanceName(props.themes, name));
    return `  ${key}: ${value},${spec.alias ? ' // alias: same instance' : ''}`;
  });
  const options =
    props.primary === undefined ? '' : `, { primary: '${props.primary}' }`;
  blocks.push(
    `const palette = glaze.palette(\n  {\n${entries
      .map((line) => `  ${line}`)
      .join('\n')}\n  }${options},\n);`,
  );
  blocks.push(
    props.calls.map((call) => `palette.${callText(call)};`).join('\n'),
  );
  return blocks.join('\n\n');
}
