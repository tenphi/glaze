/**
 * Glaze — OKHST color theme generator.
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
  getConfig,
  resetConfig as resetConfigImpl,
  snapshotConfig,
} from './config';
import {
  colorFromExport,
  createColorToken,
  createColorTokenFromValue,
  extractOkhslFromValue,
} from './color-token';
import { formatVariant } from './formatters';
import { computeShadow, resolveShadowTuning } from './shadow';
import { okhslToOkhst } from './okhst';
import { createPalette } from './palette';
import { createTheme } from './theme';
import type {
  GlazeColorFormat,
  GlazeColorInput,
  GlazeColorToken,
  GlazeColorTokenExport,
  GlazeColorValue,
  GlazeConfig,
  GlazeConfigOverride,
  GlazeConfigResolved,
  GlazeFromInput,
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
 * An optional `config` override can be supplied to customize the resolve
 * behavior for this theme (tone windows, etc.). The
 * override is **merged over the live global config at resolve time** —
 * the theme still reacts to later `configure()` calls for fields it
 * didn't override.
 *
 * @example
 * ```ts
 * const primary = glaze(280, 80);
 * // or shorthand:
 * const primary = glaze({ hue: 280, saturation: 80 });
 * // with config override:
 * const raw = glaze(280, 80, { lightTone: false });
 * ```
 */
export function glaze(
  hueOrOptions: number | { hue: number; saturation: number },
  saturation?: number,
  config?: GlazeConfigOverride,
): GlazeTheme {
  if (typeof hueOrOptions === 'number') {
    return createTheme(hueOrOptions, saturation ?? 100, undefined, config);
  }
  return createTheme(
    hueOrOptions.hue,
    hueOrOptions.saturation,
    undefined,
    config,
  );
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
  return createTheme(data.hue, data.saturation, data.colors, data.config);
};

/**
 * Create a standalone single-color token.
 *
 * **arg1 — the color** (four accepted shapes, discriminated by structure):
 *
 * | Shape | Example | Notes |
 * |---|---|---|
 * | Bare string | `'#26fcb2'`, `'rgb(38 252 178)'` | Hex or CSS color function (incl. `okhst()`) |
 * | Value object | `{ h: 152, s: 0.95, l: 0.74 }` | OKHSL, OKHST (`{h,s,t}`), `{r,g,b}`, `{l,c,h}` |
 * | `{ from, ...overrides }` | `{ from: '#fff', base: bg, contrast: 'AA' }` | Value + color overrides |
 * | Structured | `{ hue: 152, saturation: 95, tone: 74 }` | Full theme-style token |
 *
 * **arg2 — config override** (optional, all shapes):
 * Overrides the resolve-relevant global config fields for this token.
 * Fields that are omitted fall through to the live global config at
 * create time (and are snapshotted). Pass `false` for a tone window
 * to disable clamping entirely.
 *
 * ```ts
 * // Bare string — no overrides
 * glaze.color('#26fcb2')
 *
 * // From form — value + color overrides
 * glaze.color({ from: '#fff', base: bg, contrast: 'AA' })
 *
 * // Structured form — full theme-style token
 * glaze.color({ hue: 152, saturation: 95, tone: 74 })
 *
 * // Config override on any form
 * glaze.color('#26fcb2', { darkTone: false, autoFlip: false })
 * glaze.color({ from: '#fff', base: bg })
 * ```
 *
 * Defaults: every form defaults to `mode: 'auto'`. Value-shorthand forms
 * (bare strings and value objects) preserve light tone exactly
 * (`lightTone: false` internally). Structured form snapshots both
 * tone windows from `globalConfig` at create time.
 *
 * Relative `tone: '+N'` and `contrast` anchor to the literal seed by
 * default; when `base` is set they anchor to the base's resolved variant
 * per scheme. Relative `hue: '+N'` always anchors to the seed, not the base.
 */
glaze.color = function color(
  input: GlazeFromInput | GlazeColorInput | GlazeColorValue,
  config?: GlazeConfigOverride,
): GlazeColorToken {
  if (typeof input === 'string') {
    return createColorTokenFromValue(input, undefined, config);
  }

  // Object inputs — discriminate by key presence
  const obj = input as object;

  if ('from' in obj) {
    const { from, ...overrides } = input as GlazeFromInput;
    return createColorTokenFromValue(from, overrides, config);
  }

  if ('hue' in obj) {
    return createColorToken(input as GlazeColorInput, config);
  }

  // Value-object: { h, s, l }, { r, g, b }, or { l, c, h }
  return createColorTokenFromValue(input as GlazeColorValue, undefined, config);
};

/**
 * Compute a shadow color from a bg/fg pair and intensity.
 *
 * Both `bg` and `fg` accept any `GlazeColorValue` form: hex (`#rgb` /
 * `#rrggbb` / `#rrggbbaa`), `rgb()` / `hsl()` / `okhsl()` / `oklch()`
 * strings, or `{ r, g, b }` / `{ h, s, l }` / `{ l, c, h }` objects.
 */
glaze.shadow = function shadow(input: GlazeShadowInput): ResolvedColorVariant {
  const bg = extractOkhslFromValue(input.bg as GlazeColorValue);
  const fg = input.fg
    ? extractOkhslFromValue(input.fg as GlazeColorValue)
    : undefined;
  const cfg = getConfig();
  const tuning = resolveShadowTuning(input.tuning, cfg.shadowTuning);
  const result = computeShadow(
    { ...bg, alpha: 1 },
    fg ? { ...fg, alpha: 1 } : undefined,
    input.intensity,
    tuning,
  );
  const { h, s, t } = okhslToOkhst({
    h: result.h,
    s: result.s,
    l: result.l,
  });
  return { h, s, t, alpha: result.alpha };
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
 * and the effective config snapshot. The reconstructed token is identical
 * in behavior to the original at the time of export.
 *
 * @example
 * ```ts
 * const text = glaze.color({ from: '#1a1a1a', contrast: 'AA' });
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
