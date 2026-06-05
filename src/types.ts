/**
 * Glaze type definitions.
 */

import type { ContrastPreset } from './contrast-solver';

// ============================================================================
// Value types
// ============================================================================

/** A value or [normal, high-contrast] pair. */
export type HCPair<T> = T | [T, T];

export type MinContrast = number | ContrastPreset;

export type AdaptationMode = 'auto' | 'fixed' | 'static';

/** A signed relative offset string, e.g. '+20' or '-15.5'. */
export type RelativeValue = `+${number}` | `-${number}`;

/** Color format for output. */
export type GlazeColorFormat = 'okhsl' | 'rgb' | 'hsl' | 'oklch';

/**
 * Controls which scheme variants are generated in the export.
 * Light is always included (it's the default).
 */
export interface GlazeOutputModes {
  /** Include dark scheme variants. Default: true. */
  dark?: boolean;
  /** Include high-contrast variants (both light-HC and dark-HC). Default: false. */
  highContrast?: boolean;
}

// ============================================================================
// Color definitions
// ============================================================================

/** Hex color string for DX hints. Runtime validation in `parseHex()`. */
export type HexColor = `#${string}`;

/** Direct OKHSL color input. */
export interface OkhslColor {
  h: number;
  s: number;
  l: number;
}

/** sRGB components in 0–255 (value-shorthand object form). */
export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

/** OKLCh components matching CSS `oklch(L C H)` (L/C: 0–1, H: degrees). */
export interface OklchColor {
  l: number;
  c: number;
  h: number;
}

export interface RegularColorDef {
  /**
   * Lightness value (0–100).
   * - Number: absolute lightness.
   * - String ('+N' / '-N'): relative to base color's lightness (requires `base`).
   */
  lightness?: HCPair<number | RelativeValue>;
  /** Saturation factor applied to the seed saturation (0–1, default: 1). */
  saturation?: number;
  /**
   * Hue override for this color.
   * - Number: absolute hue (0–360).
   * - String ('+N' / '-N'): relative to the theme seed hue.
   */
  hue?: number | RelativeValue;

  /** Name of another color in the same theme (dependent color). */
  base?: string;
  /** WCAG contrast ratio floor against the base color. */
  contrast?: HCPair<MinContrast>;

  /** Adaptation mode. Default: 'auto'. */
  mode?: AdaptationMode;

  /**
   * Fixed opacity (0–1).
   * Output includes alpha in the CSS value.
   * Does not affect contrast resolution — a semi-transparent color
   * has no fixed perceived lightness, so `contrast` and `opacity`
   * should not be combined (a console.warn is emitted).
   */
  opacity?: number;

  /**
   * Whether this color is inherited by child themes created via `extend()`.
   * Default: true. Set to false to make this color local to the current theme.
   */
  inherit?: boolean;
}

/** Shadow tuning knobs. All values use the 0–1 scale (OKHSL). */
export interface ShadowTuning {
  /** Fraction of fg saturation kept in pigment (0-1). Default: 0.18. */
  saturationFactor?: number;
  /** Upper clamp on pigment saturation (0-1). Default: 0.25. */
  maxSaturation?: number;
  /** Multiplier for bg lightness → pigment lightness. Default: 0.25. */
  lightnessFactor?: number;
  /** [min, max] clamp for pigment lightness (0-1). Default: [0.05, 0.20]. */
  lightnessBounds?: [number, number];
  /**
   * Target minimum gap between pigment lightness and bg lightness (0-1).
   * Default: 0.05.
   */
  minGapTarget?: number;
  /** Max alpha (0-1). Reached at intensity=100 with max contrast. Default: 1.0. */
  alphaMax?: number;
  /**
   * Blend weight (0-1) pulling pigment hue toward bg hue.
   * 0 = pure fg hue, 1 = pure bg hue. Default: 0.2.
   */
  bgHueBlend?: number;
}

export interface ShadowColorDef {
  type: 'shadow';
  /**
   * Background color name — the surface the shadow sits on.
   * Must reference a non-shadow color in the same theme.
   */
  bg: string;
  /**
   * Foreground color name for tinting and intensity modulation.
   * Must reference a non-shadow color in the same theme.
   * Omit for achromatic shadow at full user-specified intensity.
   */
  fg?: string;
  /**
   * Shadow intensity, 0-100.
   * Supports [normal, highContrast] pair.
   */
  intensity: HCPair<number>;
  /** Override default tuning. Merged field-by-field with global `shadowTuning`. */
  tuning?: ShadowTuning;

  /**
   * Whether this color is inherited by child themes created via `extend()`.
   * Default: true. Set to false to make this color local to the current theme.
   */
  inherit?: boolean;
}

export interface MixColorDef {
  type: 'mix';
  /** Background/base color name — the "from" color. */
  base: string;
  /** Target color name — the "to" color to mix toward. */
  target: string;
  /**
   * Mix ratio 0–100 (0 = pure base, 100 = pure target).
   * In 'transparent' blend mode, this controls the opacity of the target.
   * Supports [normal, highContrast] pair.
   */
  value: HCPair<number>;
  /**
   * Blending mode. Default: 'opaque'.
   * - 'opaque': produces a solid color by interpolating base and target.
   * - 'transparent': produces the target color with alpha = value/100.
   */
  blend?: 'opaque' | 'transparent';
  /**
   * Interpolation color space for opaque blending. Default: 'okhsl'.
   * - 'okhsl': perceptually uniform, consistent with Glaze's internal model.
   * - 'srgb': linear sRGB interpolation, matches browser compositing.
   *
   * Ignored for 'transparent' blend (always composites in linear sRGB).
   */
  space?: 'okhsl' | 'srgb';
  /**
   * Minimum WCAG contrast between the base and the resulting color.
   * In 'opaque' mode, adjusts the mix ratio to meet contrast.
   * In 'transparent' mode, adjusts opacity to meet contrast against the composite.
   * Supports [normal, highContrast] pair.
   */
  contrast?: HCPair<MinContrast>;

  /**
   * Whether this color is inherited by child themes created via `extend()`.
   * Default: true. Set to false to make this color local to the current theme.
   */
  inherit?: boolean;
}

export type ColorDef = RegularColorDef | ShadowColorDef | MixColorDef;

export type ColorMap = Record<string, ColorDef>;

// ============================================================================
// Resolved internal types
// ============================================================================

/** Resolved color for a single scheme variant. */
export interface ResolvedColorVariant {
  /** OKHSL hue (0–360). */
  h: number;
  /** OKHSL saturation (0–1). */
  s: number;
  /** OKHSL lightness (0–1). */
  l: number;
  /** Opacity (0–1). Default: 1. */
  alpha: number;
}

/** Fully resolved color across all scheme variants. */
export interface ResolvedColor {
  name: string;
  light: ResolvedColorVariant;
  dark: ResolvedColorVariant;
  lightContrast: ResolvedColorVariant;
  darkContrast: ResolvedColorVariant;
  /** Adaptation mode. Present only for regular colors, omitted for shadows. */
  mode?: AdaptationMode;
}

// ============================================================================
// Configuration
// ============================================================================

export interface GlazeConfig {
  /** Light scheme lightness window [lo, hi]. Default: [10, 100]. */
  lightLightness?: [number, number];
  /** Dark scheme lightness window [lo, hi]. Default: [15, 95]. */
  darkLightness?: [number, number];
  /** Saturation reduction factor for dark scheme (0–1). Default: 0.1. */
  darkDesaturation?: number;
  /**
   * Möbius beta for dark auto-inversion (0–1).
   * Lower values expand subtle near-white distinctions in dark mode.
   * Set to 1 for linear (legacy) behavior. Default: 0.5.
   * Accepts [normal, highContrast] pair for separate HC tuning.
   */
  darkCurve?: HCPair<number>;
  /** State alias names for token export. */
  states?: {
    dark?: string;
    highContrast?: string;
  };
  /** Which scheme variants to include in exports. Default: both true. */
  modes?: GlazeOutputModes;
  /** Default tuning for all shadow colors. Per-color tuning merges field-by-field. */
  shadowTuning?: ShadowTuning;
  /**
   * Automatically flip lightness direction when contrast can't be met.
   *
   * When enabled (default `true`), the solver searches the requested
   * lightness direction first. If that direction can't reach the target,
   * it tries the opposite direction and uses it when it passes. If neither
   * side passes, the lightness is pinned to the requested-direction
   * extreme and a warning is emitted.
   *
   * Set to `false` for strict "no flip" behavior. The opposite
   * direction is never considered: if the requested direction can't
   * meet the target, the lightness is pinned to its extreme (never
   * falls back to the originally requested lightness).
   */
  autoFlip?: boolean;
}

export interface GlazeConfigResolved {
  lightLightness: [number, number];
  darkLightness: [number, number];
  darkDesaturation: number;
  darkCurve: HCPair<number>;
  states: {
    dark: string;
    highContrast: string;
  };
  modes: Required<GlazeOutputModes>;
  shadowTuning?: ShadowTuning;
  autoFlip: boolean;
}

// ============================================================================
// Serialization
// ============================================================================

/** Serialized theme configuration (no resolved values). */
export interface GlazeThemeExport {
  hue: number;
  saturation: number;
  colors: ColorMap;
}

// ============================================================================
// Standalone shadow
// ============================================================================

/** Input for `glaze.shadow()` standalone factory. */
export interface GlazeShadowInput {
  /**
   * Background color — accepts any `GlazeColorValue` form: hex
   * (`#rgb` / `#rrggbb` / `#rrggbbaa`), `rgb()` / `hsl()` / `okhsl()`
   * / `oklch()` strings, or literal objects (`{ r, g, b }`, `{ h, s, l }`,
   * `{ l, c, h }`). Alpha components are dropped with a warning.
   */
  bg: GlazeColorValue;
  /**
   * Foreground color for tinting + intensity modulation. Accepts the
   * same forms as `bg`.
   */
  fg?: GlazeColorValue;
  /** Intensity 0-100. */
  intensity: number;
  tuning?: ShadowTuning;
}

// ============================================================================
// Standalone color token
// ============================================================================

/** Input for the structured `glaze.color()` overload. */
export interface GlazeColorInput {
  hue: number;
  saturation: number;
  lightness: HCPair<number>;
  saturationFactor?: number;
  mode?: AdaptationMode;
  /**
   * Fixed opacity (0–1). Output includes alpha in the CSS value.
   * Combining with `contrast` is not recommended (perceived lightness
   * becomes unpredictable) — a `console.warn` is emitted in that case.
   */
  opacity?: number;
  /**
   * Optional dependency on another color. Same semantics as
   * `GlazeColorOverrides.base` — `contrast` and relative `lightness`
   * anchor to the base per scheme.
   */
  base?: GlazeColorToken | GlazeColorValue;
  /**
   * WCAG contrast floor against `base`. Requires `base` to be set.
   */
  contrast?: HCPair<MinContrast>;
  /**
   * Optional human-readable name for the token. Used in error and
   * warning messages (otherwise an internal name like `"value"` is
   * used). Does not affect output keys.
   */
  name?: string;
}

/**
 * Any single-color input form accepted by the value-shorthand
 * overload of `glaze.color()`.
 *
 * Strings cover hex (`#rgb` / `#rrggbb` / `#rrggbbaa`, alpha dropped
 * with a warning) and the four CSS color functions Glaze itself emits:
 * `rgb()`, `hsl()`, `okhsl()`, `oklch()` (alpha components also dropped
 * with a warning).
 *
 * Literal object forms:
 * - `{ h, s, l }` — OKHSL (h: 0–360, s/l: 0–1). Passing 0–100 for `s`/`l`
 *   throws with a hint to use the structured form.
 * - `{ r, g, b }` — sRGB 0–255.
 * - `{ l, c, h }` — OKLCh (L/C: 0–1, H: degrees), same as `oklch()` strings.
 */
export type GlazeColorValue =
  | string
  | OkhslColor
  | RgbColor
  | OklchColor;

/** Optional overrides for `glaze.color(value, overrides?)`. */
export interface GlazeColorOverrides {
  /**
   * Override hue. Number is absolute (0–360); `'+N'`/`'-N'` is relative
   * to the extracted (or overridden) seed hue — same semantics as
   * `RegularColorDef.hue`.
   */
  hue?: number | RelativeValue;
  /** Override seed saturation (0–100). Default: extracted from value. */
  saturation?: number;
  /**
   * Override lightness. Number is absolute (0–100); `'+N'`/`'-N'` is
   * relative to the literal seed (the value passed to `glaze.color()`).
   * Supports HCPair for high-contrast.
   */
  lightness?: HCPair<number | RelativeValue>;
  /** Saturation multiplier on the seed (0–1). Default: 1. */
  saturationFactor?: number;
  /**
   * Adaptation mode. Defaults to `'auto'` for every input form, so
   * colors automatically adapt between light and dark like an ordinary
   * theme color. All value-shorthand inputs (strings and literal objects)
   * preserve light lightness (`lightLightness: false`) and snapshot
   * `globalConfig.darkLightness` on the dark side. Only the structured
   * `{ hue, saturation, lightness }` form also snapshots
   * `globalConfig.lightLightness`.
   *
   * Pass `'fixed'` explicitly to opt back into the legacy linear, non-
   * inverting mapping; pass `'static'` to pin the same lightness
   * across every variant.
   */
  mode?: AdaptationMode;

  /**
   * WCAG contrast floor. By default solved against the literal seed
   * (the value itself); when `base` is set, solved against the base's
   * resolved variant per scheme. Same shape as `RegularColorDef.contrast`.
   */
  contrast?: HCPair<MinContrast>;

  /**
   * Optional dependency on another color. Accepts either a
   * `GlazeColorToken` (returned by another `glaze.color()`) or a raw
   * `GlazeColorValue` (hex / CSS strings / `{ r, g, b }` / `{ h, s, l }` / …),
   * which is automatically wrapped in `glaze.color(value)`.
   *
   * When set:
   * - `contrast` is solved against the base's resolved variant
   *   per-scheme (light / dark / lightContrast / darkContrast).
   * - Relative `lightness: '+N'` / `'-N'` is anchored to the base's
   *   lightness per-scheme (matches theme behavior for dependent colors).
   * - Relative `hue: '+N'` / `'-N'` still anchors to the seed (the
   *   value passed to `glaze.color()`), not the base.
   *
   * The base token's `.resolve()` is called lazily on first resolve and
   * its result is captured by reference; later mutations to the base's
   * defining call don't apply (matches existing token snapshot semantics).
   */
  base?: GlazeColorToken | GlazeColorValue;

  /**
   * Fixed opacity (0–1). Output includes alpha in the CSS value.
   * Combining with `contrast` is not recommended (perceived lightness
   * becomes unpredictable) — a `console.warn` is emitted in that case.
   */
  opacity?: number;

  /**
   * Optional human-readable name for the token. Used in error and
   * warning messages (otherwise an internal name like `"value"` is
   * used). Does not affect output keys.
   */
  name?: string;
}

/**
 * Per-call lightness-window overrides for `glaze.color()`. Mirrors
 * the field names from `GlazeConfig`.
 *
 * Defaults for `glaze.color()` vary by input form, and both fields are
 * snapshotted from `globalConfig` at color-creation time so later
 * `glaze.configure()` calls don't retroactively change already-created
 * tokens (and `token.export()` round-trips byte-for-byte):
 *
 * - **Value-shorthand** (hex / `rgb()` / `hsl()` / `okhsl()` / `oklch()`
 *   strings, `{ r, g, b }`, `{ h, s, l }`, `{ l, c, h }`):
 *   - `lightLightness: false` — preserve input exactly.
 *   - `darkLightness: globalConfig.darkLightness` — snapshotted at create time.
 *
 * - **Structured inputs** (`{ hue, saturation, lightness, ... }`):
 *   - `lightLightness: globalConfig.lightLightness` — theme light window.
 *   - `darkLightness: globalConfig.darkLightness` — theme dark window.
 *
 * Passing this object replaces both fields at once. To keep one
 * field's default while overriding the other, restate the default
 * explicitly.
 */
export interface GlazeColorScaling {
  /**
   * Light-mode lightness window. Snapshotted at create time: `false`
   * (preserve input) for value-shorthand inputs; plain
   * `globalConfig.lightLightness` for structured inputs only. Pass
   * `false` to preserve input lightness in light mode.
   */
  lightLightness?: false | [number, number];
  /**
   * Dark-mode lightness window. Snapshotted from `globalConfig` at
   * create time for value-shorthand and structured inputs. Pass `false`
   * to preserve input lightness in dark mode too.
   */
  darkLightness?: false | [number, number];
}

/** Options for `GlazeColorToken.css()`. */
export interface GlazeColorCssOptions {
  /**
   * Custom property base name (without leading `--`). Required.
   * Becomes the variable identifier in the output, e.g.
   * `name: 'brand'` → `--brand-color: …`.
   */
  name: string;
  /** Output color format. Default: 'rgb' (matches `theme.css` default). */
  format?: GlazeColorFormat;
  /**
   * Suffix appended to the name. Default: '-color' (matches
   * `theme.css` default).
   */
  suffix?: string;
}

/** Return type for `glaze.color()`. */
export interface GlazeColorToken {
  /** Resolve the color across all scheme variants. */
  resolve(): ResolvedColor;
  /** Export as a flat token map (no color name key). */
  token(options?: GlazeTokenOptions): Record<string, string>;
  /**
   * Export as a tasty style-to-state binding (no color name key).
   * Uses `#name` keys and state aliases (`''`, `@dark`, etc.).
   * @see https://tasty.style/docs
   */
  tasty(options?: GlazeTokenOptions): Record<string, string>;
  /** Export as a flat JSON map (no color name key). */
  json(options?: GlazeJsonOptions): Record<string, string>;
  /** Export as CSS custom property declarations grouped by scheme variant. */
  css(options: GlazeColorCssOptions): GlazeCssResult;
  /**
   * Serialize the token as a JSON-safe object. Captures the original
   * input value, overrides, and scaling so it can be rehydrated via
   * `glaze.colorFrom(...)`. `base` is recursively serialized.
   */
  export(): GlazeColorTokenExport;
}

/**
 * JSON-safe serialization of a `glaze.color()` token. Pass to
 * `glaze.colorFrom(...)` to rehydrate.
 */
export interface GlazeColorTokenExport {
  /**
   * Discriminator for the source overload that created the token.
   * - `'value'`: created via `glaze.color(value, overrides?, scaling?)`.
   * - `'structured'`: created via `glaze.color({ hue, saturation, ... }, scaling?)`.
   */
  form: 'value' | 'structured';
  /** Original input. For `form: 'value'` this is the raw `GlazeColorValue`; for `form: 'structured'` this is the structured input. */
  input: GlazeColorValue | GlazeColorInputExport;
  /**
   * Overrides recorded at creation time. `base` is recursively
   * serialized. Only present for `form: 'value'`.
   */
  overrides?: GlazeColorOverridesExport;
  /** Lightness scaling override, if any. */
  scaling?: GlazeColorScaling;
  /**
   * Auto-flip setting snapshotted at creation time from
   * `globalConfig.autoFlip`. Only present when it differs from the
   * global default (`true`). Rehydrated tokens use this value instead
   * of whatever is current in `globalConfig`.
   */
  autoFlip?: boolean;
}

/**
 * Serializable shape of a structured `glaze.color({...})` input.
 * Differs from `GlazeColorInput` only in that `base` is replaced by an
 * `export` instead of a token reference.
 */
export interface GlazeColorInputExport {
  hue: number;
  saturation: number;
  lightness: HCPair<number>;
  saturationFactor?: number;
  mode?: AdaptationMode;
  opacity?: number;
  base?: GlazeColorTokenExport | GlazeColorValue;
  contrast?: HCPair<MinContrast>;
  name?: string;
}

/**
 * Serializable shape of `GlazeColorOverrides`. `base` is replaced by
 * its export (or left as a `GlazeColorValue` if it was originally a value).
 */
export interface GlazeColorOverridesExport {
  hue?: number | RelativeValue;
  saturation?: number;
  lightness?: HCPair<number | RelativeValue>;
  saturationFactor?: number;
  mode?: AdaptationMode;
  contrast?: HCPair<MinContrast>;
  base?: GlazeColorTokenExport | GlazeColorValue;
  opacity?: number;
  name?: string;
}

// ============================================================================
// Theme API
// ============================================================================

export interface GlazeTheme {
  /** The hue seed (0–360). */
  readonly hue: number;
  /** The saturation seed (0–100). */
  readonly saturation: number;

  /** Add/replace colors (additive merge with existing definitions). */
  colors(defs: ColorMap): void;

  /** Get a color definition by name. */
  color(name: string): ColorDef | undefined;
  /** Set a single color definition. */
  color(name: string, def: ColorDef): void;

  /** Remove one or more color definitions. */
  remove(names: string | string[]): void;

  /** Check if a color is defined. */
  has(name: string): boolean;

  /** List all defined color names. */
  list(): string[];

  /** Clear all color definitions. */
  reset(): void;

  /** Export the theme configuration as a JSON-safe object. */
  export(): GlazeThemeExport;

  /** Create a child theme inheriting all color definitions. */
  extend(options: GlazeExtendOptions): GlazeTheme;

  /** Resolve all colors and return the result map. */
  resolve(): Map<string, ResolvedColor>;

  /**
   * Export as a flat token map grouped by scheme variant.
   *
   * ```ts
   * theme.tokens()
   * // → { light: { surface: 'okhsl(...)' }, dark: { surface: 'okhsl(...)' } }
   * ```
   */
  tokens(options?: GlazeJsonOptions): Record<string, Record<string, string>>;

  /**
   * Export as tasty style-to-state bindings.
   * Uses `#name` color token keys and state aliases (`''`, `@dark`, etc.).
   * Spread into component styles or register as a recipe via `configure({ recipes })`.
   * @see https://tasty.style/docs
   */
  tasty(options?: GlazeTokenOptions): Record<string, Record<string, string>>;

  /** Export as plain JSON. */
  json(options?: GlazeJsonOptions): Record<string, Record<string, string>>;

  /** Export as CSS custom property declarations. */
  css(options?: GlazeCssOptions): GlazeCssResult;
}

export interface GlazeExtendOptions {
  hue?: number;
  saturation?: number;
  colors?: ColorMap;
}

// ============================================================================
// Palette API
// ============================================================================

export interface GlazeTokenOptions {
  /** Prefix mode. `true` uses "<themeName>-", or provide a custom map. */
  prefix?: boolean | Record<string, string>;
  /** Override state aliases for this export. */
  states?: {
    dark?: string;
    highContrast?: string;
  };
  /** Override which scheme variants to include. */
  modes?: GlazeOutputModes;
  /** Output color format. Default: 'okhsl'. */
  format?: GlazeColorFormat;
}

export interface GlazeJsonOptions {
  /** Override which scheme variants to include. */
  modes?: GlazeOutputModes;
  /** Output color format. Default: 'okhsl'. */
  format?: GlazeColorFormat;
}

export interface GlazeCssOptions {
  /** Output color format. Default: 'rgb'. */
  format?: GlazeColorFormat;
  /** Suffix appended to each CSS custom property name. Default: '-color'. */
  suffix?: string;
}

/** CSS custom property declarations grouped by scheme variant. */
export interface GlazeCssResult {
  light: string;
  dark: string;
  lightContrast: string;
  darkContrast: string;
}

/** Options for `glaze.palette()` creation. */
export interface GlazePaletteOptions {
  /**
   * Name of the primary theme. The primary theme's tokens are duplicated
   * without prefix in all exports, providing convenient short aliases
   * alongside the prefixed versions. Can be overridden per-export.
   *
   * @example
   * ```ts
   * const palette = glaze.palette({ brand, accent }, { primary: 'brand' });
   * palette.tokens()
   * // → { light: { 'brand-surface': '...', 'surface': '...', 'accent-surface': '...' } }
   * ```
   */
  primary?: string;
}

/** Options shared by palette `tokens()`, `tasty()`, and `css()` exports. */
export interface GlazePaletteExportOptions {
  /**
   * Prefix mode. `true` uses `"<themeName>-"`, or provide a custom map.
   * Defaults to `true` for palette export methods.
   * Set to `false` explicitly to disable prefixing. Colliding keys
   * produce a console.warn and the first-written value wins.
   */
  prefix?: boolean | Record<string, string>;
  /**
   * Override the palette-level primary theme for this export.
   * Pass a theme name to set/change the primary, or `false` to disable it.
   * When omitted, inherits the palette-level `primary`.
   */
  primary?: string | false;
}

export interface GlazePalette {
  /**
   * Export all themes as a flat token map grouped by scheme variant.
   * Prefix defaults to `true` — all tokens are prefixed with the theme name.
   * Inherits the palette-level `primary`; override per-call or pass `false` to disable.
   *
   * ```ts
   * const palette = glaze.palette({ brand, accent }, { primary: 'brand' });
   * palette.tokens()
   * // → { light: { 'brand-surface': '...', 'surface': '...', 'accent-surface': '...' } }
   * ```
   */
  tokens(
    options?: GlazeJsonOptions & GlazePaletteExportOptions,
  ): Record<string, Record<string, string>>;

  /**
   * Export all themes as tasty style-to-state bindings.
   * Uses `#name` color token keys and state aliases (`''`, `@dark`, etc.).
   * Prefix defaults to `true`. Inherits the palette-level `primary`.
   * @see https://tasty.style/docs
   */
  tasty(
    options?: GlazeTokenOptions & GlazePaletteExportOptions,
  ): Record<string, Record<string, string>>;

  /** Export all themes as plain JSON grouped by theme name. */
  json(
    options?: GlazeJsonOptions & {
      prefix?: boolean | Record<string, string>;
    },
  ): Record<string, Record<string, Record<string, string>>>;

  /** Export all themes as CSS custom property declarations. */
  css(options?: GlazeCssOptions & GlazePaletteExportOptions): GlazeCssResult;
}
