/**
 * Palette factory.
 *
 * Composes multiple themes into a single token namespace with optional
 * theme-name prefixes and a "primary theme" that also surfaces an
 * unprefixed copy of its tokens. All seven export methods (`tokens` /
 * `tasty` / `json` / `css` / `dtcg` / `dtcgResolver` / `tailwind`) share a
 * `buildPaletteOutput` driver that handles validation, per-theme iteration,
 * prefix resolution, collision filtering, and primary duplication.
 *
 * Authoring round-trip: `palette.export()` / `createPaletteFromExport()`
 * (wired as `glaze.paletteFrom`).
 */

import type { ChannelCtx } from './channels';
import { getConfig } from './config';
import { assertAllPastel, assertNativeFormat } from './format-guard';
import {
  buildCssMap,
  buildDtcgMap,
  buildDtcgResolver,
  buildFlatTokenMap,
  buildJsonMap,
  buildTailwindLines,
  buildTokenMap,
  emitTailwindCss,
  resolveModes,
} from './formatters';
import {
  assertExportKind,
  assertExportVersion,
  GLAZE_EXPORT_VERSION,
} from './serialize';
import { createTheme } from './theme';
import type {
  ColorMap,
  GlazeCssOptions,
  GlazeCssResult,
  GlazeConfigOverride,
  GlazeDtcgOptions,
  GlazeDtcgResolverDocument,
  GlazeDtcgResolverOptions,
  GlazeDtcgResult,
  GlazeJsonOptions,
  GlazePalette,
  GlazePaletteExport,
  GlazePaletteExportOptions,
  GlazePaletteOptions,
  GlazeTailwindOptions,
  GlazeTheme,
  GlazeThemeExport,
  GlazeTokenOptions,
  ResolvedColor,
} from './types';
import type { GlazeTailwindLines } from './formatters';

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

function colorMapFromTheme(theme: GlazeTheme): ColorMap {
  const defs: ColorMap = {};
  for (const name of theme.list()) {
    const def = theme.color(name);
    if (def !== undefined) defs[name] = def;
  }
  return defs;
}

function channelCtxForTheme(
  theme: GlazeTheme,
  themeName: string,
  passPrefix: string,
  themedPrefix: string,
  splitHue: boolean | undefined,
  format: string,
  modes: ReturnType<typeof resolveModes>,
  filtered: Map<string, ResolvedColor>,
): ChannelCtx | undefined {
  if (!splitHue || format !== 'oklch') return undefined;
  assertAllPastel(filtered, modes);
  return {
    seedHue: theme.hue,
    baseName: themeName,
    // Hue var names always follow the themed prefix so the primary's
    // unprefixed alias references `--{themeName}-*-hue` rather than colliding
    // with other themes' base vars.
    prefix: themedPrefix,
    defs: colorMapFromTheme(theme),
    mode: 'theme',
    // Emit declarations only in the pass whose color-prop prefix matches the
    // themed prefix (the prefixed pass, or the single pass when prefix:false).
    emitDeclarations: passPrefix === themedPrefix,
  };
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
  buildOne: (
    resolved: Map<string, ResolvedColor>,
    prefix: string,
    pastel: boolean,
    themeName: string,
    theme: GlazeTheme,
  ) => T,
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
    merge(acc, buildOne(filtered, prefix, pastel, themeName, theme));

    if (themeName === effectivePrimary) {
      const primaryFiltered = filterCollisions(
        resolved,
        '',
        seen,
        themeName,
        true,
      );
      merge(acc, buildOne(primaryFiltered, '', pastel, themeName, theme));
    }
  }

  return acc;
}

function themeFromExportData(
  data: GlazeThemeExport,
  factory = 'glaze.themeFrom',
): GlazeTheme {
  assertExportKind(data, 'theme', factory);
  assertExportVersion(data, factory);
  if (typeof data.hue !== 'number' || typeof data.saturation !== 'number') {
    throw new Error(
      `${factory}: expected numeric "hue" and "saturation" fields.`,
    );
  }
  return createTheme(data.hue, data.saturation, data.colors, data.config);
}

/**
 * Rebuild a palette from a `palette.export()` snapshot.
 */
export function createPaletteFromExport(
  data: GlazePaletteExport,
): GlazePalette {
  if (data === null || typeof data !== 'object') {
    throw new Error(
      `glaze.paletteFrom: expected an object from palette.export(), got ${data === null ? 'null' : typeof data}.`,
    );
  }
  assertExportKind(data, 'palette', 'glaze.paletteFrom');
  assertExportVersion(data, 'glaze.paletteFrom');
  if (data.themes === null || typeof data.themes !== 'object') {
    throw new Error(
      `glaze.paletteFrom: expected a "themes" object map of theme exports.`,
    );
  }

  const rebuilt: PaletteInput = {};
  for (const [name, themeExport] of Object.entries(data.themes)) {
    if (themeExport === null || typeof themeExport !== 'object') {
      throw new Error(
        `glaze.paletteFrom: theme "${name}" is not a valid theme export.`,
      );
    }
    rebuilt[name] = themeFromExportData(
      themeExport,
      `glaze.paletteFrom (theme "${name}")`,
    );
  }

  return createPalette(rebuilt, {
    primary: data.primary,
  });
}

/** Rebuild a theme from a `theme.export()` snapshot. */
export function createThemeFromExport(data: GlazeThemeExport): GlazeTheme {
  if (data === null || typeof data !== 'object') {
    throw new Error(
      `glaze.themeFrom: expected an object from theme.export(), got ${data === null ? 'null' : typeof data}.`,
    );
  }
  return themeFromExportData(data);
}

export function createPalette(
  themes: PaletteInput,
  paletteOptions?: GlazePaletteOptions,
): GlazePalette {
  validatePrimaryTheme(paletteOptions?.primary, themes);

  const buildDtcgResult = (
    options?: GlazeDtcgOptions & GlazePaletteExportOptions,
  ): GlazeDtcgResult => {
    const modes = resolveModes(options?.modes);
    const colorSpace = options?.colorSpace ?? 'srgb';
    return buildPaletteOutput<GlazeDtcgResult, GlazeDtcgResult>(
      themes,
      paletteOptions,
      options,
      (filtered, prefix, pastel, _themeName, _theme) =>
        buildDtcgMap(filtered, prefix, modes, colorSpace, pastel),
      (acc, part) => {
        Object.assign(acc.light, part.light);
        if (part.dark) {
          acc.dark = Object.assign(acc.dark ?? {}, part.dark);
        }
        if (part.lightContrast) {
          acc.lightContrast = Object.assign(
            acc.lightContrast ?? {},
            part.lightContrast,
          );
        }
        if (part.darkContrast) {
          acc.darkContrast = Object.assign(
            acc.darkContrast ?? {},
            part.darkContrast,
          );
        }
      },
      () => ({ light: {} }),
    );
  };

  return {
    list(): string[] {
      return Object.keys(themes);
    },

    get primary(): string | undefined {
      return paletteOptions?.primary;
    },

    theme(name: string): GlazeTheme | undefined {
      return themes[name];
    },

    themes(): Record<string, GlazeTheme> {
      return { ...themes };
    },

    export(override?: GlazeConfigOverride): GlazePaletteExport {
      const themesExport: Record<string, GlazeThemeExport> = {};
      for (const [name, theme] of Object.entries(themes)) {
        themesExport[name] = theme.export(override);
      }
      const out: GlazePaletteExport = {
        kind: 'palette',
        version: GLAZE_EXPORT_VERSION,
        themes: themesExport,
      };
      if (paletteOptions?.primary !== undefined) {
        out.primary = paletteOptions.primary;
      }
      return out;
    },

    tokens(
      options?: GlazeJsonOptions & GlazePaletteExportOptions,
    ): Record<string, Record<string, string>> {
      const format = options?.format ?? 'oklch';
      assertNativeFormat(format, 'tokens');
      const modes = resolveModes(options?.modes);
      return buildPaletteOutput<
        Record<string, Record<string, string>>,
        Record<string, Record<string, string>>
      >(
        themes,
        paletteOptions,
        options,
        (filtered, prefix, pastel) =>
          buildFlatTokenMap(filtered, prefix, modes, format, pastel),
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
      const format = options?.format ?? 'oklch';
      return buildPaletteOutput<
        Record<string, Record<string, string>>,
        Record<string, Record<string, string>>
      >(
        themes,
        paletteOptions,
        options,
        (filtered, prefix, pastel, themeName, theme) => {
          const themedPrefix = resolvePrefix(options, themeName, true);
          const channelCtx = channelCtxForTheme(
            theme,
            themeName,
            prefix,
            themedPrefix,
            options?.splitHue,
            format,
            modes,
            filtered,
          );
          return buildTokenMap(
            filtered,
            prefix,
            states,
            modes,
            format,
            pastel,
            channelCtx,
          );
        },
        (acc, part) => Object.assign(acc, part),
        () => ({}),
      );
    },

    json(
      options?: GlazeJsonOptions & {
        prefix?: boolean | Record<string, string>;
      },
    ): Record<string, Record<string, Record<string, string>>> {
      const format = options?.format ?? 'oklch';
      assertNativeFormat(format, 'json');
      const modes = resolveModes(options?.modes);
      const result: Record<string, Record<string, Record<string, string>>> = {};

      for (const [themeName, theme] of Object.entries(themes)) {
        const resolved = theme.resolve();
        result[themeName] = buildJsonMap(
          resolved,
          modes,
          format,
          theme.getConfig().pastel,
        );
      }

      return result;
    },

    css(options?: GlazeCssOptions & GlazePaletteExportOptions): GlazeCssResult {
      const suffix = options?.suffix ?? '-color';
      const format = options?.format ?? 'oklch';
      assertNativeFormat(format, 'css');
      const modes = resolveModes();

      const lines = buildPaletteOutput<
        GlazeCssResult,
        Record<keyof GlazeCssResult, string[]>
      >(
        themes,
        paletteOptions,
        options,
        (filtered, prefix, pastel, themeName, theme) => {
          const themedPrefix = resolvePrefix(options, themeName, true);
          const channelCtx = channelCtxForTheme(
            theme,
            themeName,
            prefix,
            themedPrefix,
            options?.splitHue,
            format,
            modes,
            filtered,
          );
          return buildCssMap(
            filtered,
            prefix,
            suffix,
            format,
            pastel,
            channelCtx,
          );
        },
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

    dtcg(
      options?: GlazeDtcgOptions & GlazePaletteExportOptions,
    ): GlazeDtcgResult {
      return buildDtcgResult(options);
    },

    dtcgResolver(
      options?: GlazeDtcgResolverOptions & GlazePaletteExportOptions,
    ): GlazeDtcgResolverDocument {
      return buildDtcgResolver(buildDtcgResult(options), options);
    },

    tailwind(
      options?: GlazeTailwindOptions & GlazePaletteExportOptions,
    ): string {
      const modes = resolveModes(options?.modes);
      const cssPrefix = options?.namespace ?? 'color-';
      const format = options?.format ?? 'oklch';
      assertNativeFormat(format, 'tailwind');
      const darkSelector = options?.darkSelector ?? '.dark';
      const highContrastSelector =
        options?.highContrastSelector ?? '.high-contrast';

      const lines = buildPaletteOutput<GlazeTailwindLines, GlazeTailwindLines>(
        themes,
        paletteOptions,
        options,
        (filtered, prefix, pastel, _themeName, _theme) =>
          buildTailwindLines(filtered, prefix, cssPrefix, format, pastel),
        (acc, part) => {
          for (const variant of [
            'light',
            'dark',
            'lightContrast',
            'darkContrast',
          ] as const) {
            acc[variant].push(...part[variant]);
          }
        },
        () => ({
          light: [],
          dark: [],
          lightContrast: [],
          darkContrast: [],
        }),
      );

      return emitTailwindCss(lines, modes, darkSelector, highContrastSelector);
    },
  };
}
