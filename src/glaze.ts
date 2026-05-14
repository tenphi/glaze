/**
 * Glaze — OKHSL-based color theme generator.
 *
 * Public API entry. Wires `glaze()` and its attached static methods to
 * the focused modules in this folder:
 * - `theme.ts` — single-theme factory
 * - `palette.ts` — multi-theme composition
 * - `color-token.ts` — standalone single-color tokens (`glaze.color`)
 * - `shadow.ts` — standalone shadow factory (`glaze.shadow`)
 * - `formatters.ts` — variant → string (`glaze.format`)
 * - `config.ts` — global config singleton
 */

import { parseHex, srgbToOkhsl } from './okhsl-color-math';
import {
  configure as configureImpl,
  resetConfig as resetConfigImpl,
  snapshotConfig,
} from './config';
import {
  colorFromExport,
  createColorToken,
  createColorTokenFromValue,
  extractOkhslFromValue,
  isStructuredColorInput,
} from './color-token';
import { formatVariant } from './formatters';
import { computeShadow, resolveShadowTuning } from './shadow';
import { createPalette } from './palette';
import { createTheme } from './theme';
import type {
  GlazeColorFormat,
  GlazeColorInput,
  GlazeColorOverrides,
  GlazeColorScaling,
  GlazeColorToken,
  GlazeColorTokenExport,
  GlazeColorValue,
  GlazeConfig,
  GlazeConfigResolved,
  GlazePalette,
  GlazePaletteOptions,
  GlazeShadowInput,
  GlazeTheme,
  GlazeThemeExport,
  ResolvedColorVariant,
} from './types';

type PaletteInput = Record<string, GlazeTheme>;

/**
 * Create a single-hue glaze theme.
 *
 * @example
 * ```ts
 * const primary = glaze({ hue: 280, saturation: 80 });
 * // or shorthand:
 * const primary = glaze(280, 80);
 * ```
 */
export function glaze(
  hueOrOptions: number | { hue: number; saturation: number },
  saturation?: number,
): GlazeTheme {
  if (typeof hueOrOptions === 'number') {
    return createTheme(hueOrOptions, saturation ?? 100);
  }
  return createTheme(hueOrOptions.hue, hueOrOptions.saturation);
}

/** Configure global glaze settings. */
glaze.configure = function configure(config: GlazeConfig): void {
  configureImpl(config);
};

/** Compose multiple themes into a palette. */
glaze.palette = function palette(
  themes: PaletteInput,
  options?: GlazePaletteOptions,
): GlazePalette {
  return createPalette(themes, options);
};

/** Create a theme from a serialized export. */
glaze.from = function from(data: GlazeThemeExport): GlazeTheme {
  return createTheme(data.hue, data.saturation, data.colors);
};

/**
 * Create a standalone single-color token.
 *
 * Two overloads:
 * - `glaze.color(input, scaling?)` — structured form:
 *   `{ hue, saturation, lightness, ... }` plus an optional per-call
 *   lightness-window override.
 * - `glaze.color(value, overrides?, scaling?)` — value-shorthand: a hex
 *   string (3/6/8 digits), one of the CSS color functions Glaze itself
 *   emits (`rgb()`, `hsl()`, `okhsl()`, `oklch()`), an `OkhslColor`
 *   object `{ h, s, l }` (0–1 ranges), or an `[r, g, b]` (0–255) tuple.
 *
 * Defaults: every input form defaults to `mode: 'auto'` so colors
 * automatically adapt between light and dark like an ordinary theme
 * color. The scaling snapshot taken at create time differs by input
 * form:
 * - String value-shorthand: `{ lightLightness: false, darkLightness:
 *   [globalConfig.darkLightness[0], 100] }`. Light preserves the input
 *   exactly; dark Möbius-inverts up to 100, so `glaze.color('#000')`
 *   renders as `#fff` in dark mode (and `glaze.color('#fff')` falls to
 *   the dark `lo` floor).
 * - `OkhslColor` object / RGB-tuple / structured value-shorthand:
 *   `{ lightLightness: globalConfig.lightLightness, darkLightness:
 *   globalConfig.darkLightness }` — both windows come straight from
 *   `globalConfig`, so the resulting token behaves like a theme color.
 *
 * Pass `{ mode: 'fixed' }` to opt back into the legacy linear, non-
 * inverting mapping, or `{ mode: 'static' }` to pin the same lightness
 * across every variant.
 *
 * Relative `lightness: '+N'` and `contrast: <ratio>` are anchored to
 * the literal seed (the value passed in) by default, pinned at
 * `mode: 'static'` across all four variants. Pass `overrides.base` (a
 * `GlazeColorToken`) to anchor `contrast` and relative `lightness`
 * against another color's resolved variant per scheme instead. Relative
 * `hue: '+N'` always anchors to the seed.
 *
 * Alpha components in `rgba()` / `hsla()` / slash-alpha syntax and
 * 8-digit hex are parsed but dropped with a `console.warn`.
 */
glaze.color = function color(
  input: GlazeColorInput | GlazeColorValue,
  arg2?: GlazeColorOverrides | GlazeColorScaling,
  arg3?: GlazeColorScaling,
): GlazeColorToken {
  if (isStructuredColorInput(input)) {
    return createColorToken(input, arg2 as GlazeColorScaling | undefined);
  }
  return createColorTokenFromValue(
    input,
    arg2 as GlazeColorOverrides | undefined,
    arg3,
  );
} as {
  (input: GlazeColorInput, scaling?: GlazeColorScaling): GlazeColorToken;
  (
    value: GlazeColorValue,
    overrides?: GlazeColorOverrides,
    scaling?: GlazeColorScaling,
  ): GlazeColorToken;
};

/**
 * Compute a shadow color from a bg/fg pair and intensity.
 *
 * Both `bg` and `fg` accept any `GlazeColorValue` form: hex (`#rgb` /
 * `#rrggbb` / `#rrggbbaa`), `rgb()` / `hsl()` / `okhsl()` / `oklch()`
 * strings, `OkhslColor` objects, or `[r, g, b]` (0–255) tuples.
 */
glaze.shadow = function shadow(input: GlazeShadowInput): ResolvedColorVariant {
  const bg = extractOkhslFromValue(input.bg as GlazeColorValue);
  const fg = input.fg
    ? extractOkhslFromValue(input.fg as GlazeColorValue)
    : undefined;
  const tuning = resolveShadowTuning(input.tuning);
  return computeShadow(
    { ...bg, alpha: 1 },
    fg ? { ...fg, alpha: 1 } : undefined,
    input.intensity,
    tuning,
  );
};

/** Format a resolved color variant as a CSS string. */
glaze.format = function format(
  variant: ResolvedColorVariant,
  colorFormat?: GlazeColorFormat,
): string {
  return formatVariant(variant, colorFormat);
};

/**
 * Create a theme from a hex color string.
 * Extracts hue and saturation from the color.
 */
glaze.fromHex = function fromHex(hex: string): GlazeTheme {
  const rgb = parseHex(hex);
  if (!rgb) {
    throw new Error(`glaze: invalid hex color "${hex}".`);
  }
  const [h, s] = srgbToOkhsl(rgb);
  return createTheme(h, s * 100);
};

/**
 * Create a theme from RGB values (0–255).
 * Extracts hue and saturation from the color.
 */
glaze.fromRgb = function fromRgb(r: number, g: number, b: number): GlazeTheme {
  const [h, s] = srgbToOkhsl([r / 255, g / 255, b / 255]);
  return createTheme(h, s * 100);
};

/**
 * Rehydrate a `glaze.color()` token from a `.export()` snapshot.
 *
 * The snapshot is a plain JSON-safe object containing the original
 * input value, overrides (with any `base` token recursively serialized),
 * and the captured scaling. The reconstructed token is identical in
 * behavior to the original at the time of export.
 *
 * @example
 * ```ts
 * const text = glaze.color('#1a1a1a', { contrast: 'AA' });
 * const data = text.export();           // JSON-safe
 * localStorage.setItem('text', JSON.stringify(data));
 * // ...later...
 * const restored = glaze.colorFrom(JSON.parse(localStorage.getItem('text')!));
 * ```
 */
glaze.colorFrom = function colorFrom(
  data: GlazeColorTokenExport,
): GlazeColorToken {
  return colorFromExport(data);
};

/** Get the current global configuration (for testing/debugging). */
glaze.getConfig = function getConfig(): GlazeConfigResolved {
  return snapshotConfig();
};

/** Reset global configuration to defaults. */
glaze.resetConfig = function resetConfig(): void {
  resetConfigImpl();
};
