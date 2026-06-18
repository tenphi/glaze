/**
 * Palette factory.
 *
 * Composes multiple themes into a single token namespace with optional
 * theme-name prefixes and a "primary theme" that also surfaces an
 * unprefixed copy of its tokens. All four export methods (`tokens` /
 * `tasty` / `json` / `css`) share a `buildPaletteOutput` driver that
 * handles validation, per-theme iteration, prefix resolution, collision
 * filtering, and primary duplication.
 */

import { getConfig } from './config';
import {
  buildCssMap,
  buildFlatTokenMap,
  buildJsonMap,
  buildTokenMap,
  resolveModes,
} from './formatters';
import type {
  GlazeCssOptions,
  GlazeCssResult,
  GlazeJsonOptions,
  GlazePalette,
  GlazePaletteExportOptions,
  GlazePaletteOptions,
  GlazeTheme,
  GlazeTokenOptions,
  ResolvedColor,
} from './types';

type PaletteInput = Record<string, GlazeTheme>;

function resolvePrefix(
  options: { prefix?: boolean | Record<string, string> } | undefined,
  themeName: string,
  defaultPrefix = false,
): string {
  const prefix = options?.prefix ?? defaultPrefix;
  if (prefix === true) {
    return `${themeName}-`;
  }
  if (typeof prefix === 'object' && prefix !== null) {
    return prefix[themeName] ?? `${themeName}-`;
  }
  return '';
}

function validatePrimaryTheme(
  primary: string | undefined,
  themes: PaletteInput,
): void {
  if (primary !== undefined && !(primary in themes)) {
    const available = Object.keys(themes).join(', ');
    throw new Error(
      `glaze: primary theme "${primary}" not found in palette. Available: ${available}.`,
    );
  }
}

/**
 * Resolve the effective primary for an export call.
 * `false` disables, a string overrides, `undefined` inherits from palette.
 */
function resolveEffectivePrimary(
  exportPrimary: string | false | undefined,
  palettePrimary: string | undefined,
): string | undefined {
  if (exportPrimary === false) return undefined;
  return exportPrimary ?? palettePrimary;
}

/**
 * Filter a resolved color map, skipping keys already in `seen`.
 * Warns on collision and keeps the first-written value (first-write-wins).
 * Returns a new map containing only non-colliding entries.
 */
function filterCollisions(
  resolved: Map<string, ResolvedColor>,
  prefix: string,
  seen: Map<string, string>,
  themeName: string,
  isPrimary?: boolean,
): Map<string, ResolvedColor> {
  const filtered = new Map<string, ResolvedColor>();
  const label = isPrimary ? `${themeName} (primary)` : themeName;

  for (const [name, color] of resolved) {
    const key = `${prefix}${name}`;
    if (seen.has(key)) {
      console.warn(
        `glaze: token "${key}" from theme "${label}" collides with theme "${seen.get(key)}" — skipping.`,
      );
      continue;
    }
    seen.set(key, label);
    filtered.set(name, color);
  }
  return filtered;
}

/**
 * Shared per-theme driver for `tokens` / `tasty` / `css`. `json` skips
 * this because it doesn't do collision filtering or primary duplication.
 */
function buildPaletteOutput<T, R>(
  themes: PaletteInput,
  paletteOptions: GlazePaletteOptions | undefined,
  options:
    | {
        prefix?: boolean | Record<string, string>;
        primary?: string | false;
      }
    | undefined,
  buildOne: (resolved: Map<string, ResolvedColor>, prefix: string, pastel: boolean) => T,
  merge: (acc: R, part: T) => void,
  empty: () => R,
): R {
  const effectivePrimary = resolveEffectivePrimary(
    options?.primary,
    paletteOptions?.primary,
  );
  if (options?.primary !== undefined) {
    validatePrimaryTheme(effectivePrimary, themes);
  }

  const acc = empty();
  const seen = new Map<string, string>();

  for (const [themeName, theme] of Object.entries(themes)) {
    const resolved = theme.resolve();
    const pastel = theme.getConfig().pastel;
    const prefix = resolvePrefix(options, themeName, true);
    const filtered = filterCollisions(resolved, prefix, seen, themeName);
    merge(acc, buildOne(filtered, prefix, pastel));

    if (themeName === effectivePrimary) {
      const primaryFiltered = filterCollisions(
        resolved,
        '',
        seen,
        themeName,
        true,
      );
      merge(acc, buildOne(primaryFiltered, '', pastel));
    }
  }

  return acc;
}

export function createPalette(
  themes: PaletteInput,
  paletteOptions?: GlazePaletteOptions,
): GlazePalette {
  validatePrimaryTheme(paletteOptions?.primary, themes);

  return {
    tokens(
      options?: GlazeJsonOptions & GlazePaletteExportOptions,
    ): Record<string, Record<string, string>> {
      const modes = resolveModes(options?.modes);
      return buildPaletteOutput<
        Record<string, Record<string, string>>,
        Record<string, Record<string, string>>
      >(
        themes,
        paletteOptions,
        options,
        (filtered, prefix, pastel) =>
          buildFlatTokenMap(filtered, prefix, modes, options?.format, pastel),
        (acc, part) => {
          for (const variant of Object.keys(part)) {
            if (!acc[variant]) {
              acc[variant] = {};
            }
            Object.assign(acc[variant], part[variant]);
          }
        },
        () => ({}),
      );
    },

    tasty(
      options?: GlazeTokenOptions & GlazePaletteExportOptions,
    ): Record<string, Record<string, string>> {
      const cfg = getConfig();
      const states = {
        dark: options?.states?.dark ?? cfg.states.dark,
        highContrast: options?.states?.highContrast ?? cfg.states.highContrast,
      };
      const modes = resolveModes(options?.modes);
      return buildPaletteOutput<
        Record<string, Record<string, string>>,
        Record<string, Record<string, string>>
      >(
        themes,
        paletteOptions,
        options,
        (filtered, prefix, pastel) =>
          buildTokenMap(filtered, prefix, states, modes, options?.format, pastel),
        (acc, part) => Object.assign(acc, part),
        () => ({}),
      );
    },

    json(
      options?: GlazeJsonOptions & {
        prefix?: boolean | Record<string, string>;
      },
    ): Record<string, Record<string, Record<string, string>>> {
      const modes = resolveModes(options?.modes);
      const result: Record<string, Record<string, Record<string, string>>> = {};

      for (const [themeName, theme] of Object.entries(themes)) {
        const resolved = theme.resolve();
        result[themeName] = buildJsonMap(resolved, modes, options?.format, theme.getConfig().pastel);
      }

      return result;
    },

    css(options?: GlazeCssOptions & GlazePaletteExportOptions): GlazeCssResult {
      const suffix = options?.suffix ?? '-color';
      const format = options?.format ?? 'rgb';

      const lines = buildPaletteOutput<
        GlazeCssResult,
        Record<keyof GlazeCssResult, string[]>
      >(
        themes,
        paletteOptions,
        options,
        (filtered, prefix, pastel) => buildCssMap(filtered, prefix, suffix, format, pastel),
        (acc, part) => {
          for (const key of [
            'light',
            'dark',
            'lightContrast',
            'darkContrast',
          ] as const) {
            if (part[key]) {
              acc[key].push(part[key]);
            }
          }
        },
        () => ({
          light: [],
          dark: [],
          lightContrast: [],
          darkContrast: [],
        }),
      );

      return {
        light: lines.light.join('\n'),
        dark: lines.dark.join('\n'),
        lightContrast: lines.lightContrast.join('\n'),
        darkContrast: lines.darkContrast.join('\n'),
      };
    },
  };
}
