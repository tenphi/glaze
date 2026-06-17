/**
 * Glaze type definitions.
 */

import type { ContrastPreset } from './contrast-solver';

// ============================================================================
// Value types
// ============================================================================

/** A value or [normal, high-contrast] pair. */
export type HCPair<T> = T | [T, T];

/** Bare WCAG contrast target: a ratio number or a named preset. */
export type MinContrast = number | ContrastPreset;

/**
 * A contrast floor with a pluggable metric.
 *
 * - `number` / `ContrastPreset`: a WCAG ratio (bare form).
 * - `{ wcag }`: WCAG ratio or preset, optionally an HC pair.
 * - `{ apca }`: APCA Lc target (absolute value), optionally an HC pair.
 *
 * The `[normal, highContrast]` pair may live at the outer level
 * (`[4.5, 7]`, `[{ wcag: 4.5 }, { wcag: 7 }]`) or inside the metric
 * (`{ wcag: [4.5, 7] }`, `{ apca: [45, 60] }`).
 */
export type ContrastSpec =
  | number
  | ContrastPreset
  | { wcag: HCPair<number | ContrastPreset> }
  | { apca: HCPair<number> };

export type AdaptationMode = 'auto' | 'fixed' | 'static';

/** A signed relative offset string, e.g. '+20' or '-15.5'. */
export type RelativeValue = `+${number}` | `-${number}`;

/**
 * Force a color to a tone extreme:
 * - `'max'`: the highest tone in the active scheme range/window.
 * - `'min'`: the lowest tone.
 *
 * Under `mode: 'auto'` the extreme inverts in the dark scheme (so `'max'`
 * tracks the inversion and becomes the darkest tone). No `base` required.
 */
export type ExtremeValue = 'max' | 'min';

/**
 * A tone value as authored on a color.
 * - Number: absolute tone (0–100).
 * - `'+N'` / `'-N'`: relative to the base's tone (requires `base`).
 * - `'max'` / `'min'`: forced to the scheme's tone extreme (no base needed).
 */
export type ToneValue = number | RelativeValue | ExtremeValue;

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

/**
 * Direct OKHST color input — OKHSL with the lightness axis replaced by the
 * contrast-uniform tone axis. `h`: 0–360, `s`: 0–1, `t`: 0–1 (tone).
 */
export interface OkhstColor {
  h: number;
  s: number;
  t: number;
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
   * Tone value (0–100, contrast-uniform — see `docs/okhst.md`).
   * - Number: absolute tone.
   * - String ('+N' / '-N'): relative to base color's tone (requires `base`).
   * - `'max'` / `'min'`: force to the scheme's tone extreme (no base needed).
   */
  tone?: HCPair<ToneValue>;
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
  /**
   * Contrast floor against the base color. A bare number/preset is WCAG;
   * use `{ wcag }` / `{ apca }` to pick the metric. Accepts an HC pair.
   */
  contrast?: HCPair<ContrastSpec>;

  /** Adaptation mode. Default: 'auto'. */
  mode?: AdaptationMode;

  /**
   * Whether to flip out-of-bounds results to the opposite side instead of
   * clamping to the extreme. Affects both:
   * - relative `tone`: when `base ± delta` exceeds `[0, 100]`, mirror the
   *   delta to the other side of the base.
   * - `contrast`: when the requested direction can't meet the floor, try the
   *   opposite side (same as the global `autoFlip`).
   *
   * Defaults to the global `autoFlip` config (default `true`). Set `false`
   * to clamp instead.
   */
  flip?: boolean;

  /**
   * Fixed opacity (0–1).
   * Output includes alpha in the CSS value.
   * Does not affect contrast resolution — a semi-transparent color
   * has no fixed perceived tone, so `contrast` and `opacity`
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
   * Minimum contrast between the base and the resulting color.
   * In 'opaque' mode, adjusts the mix ratio to meet contrast.
   * In 'transparent' mode, adjusts opacity to meet contrast against the composite.
   * A bare number/preset is WCAG; use `{ wcag }` / `{ apca }` to pick the
   * metric. Supports [normal, highContrast] pair.
   */
  contrast?: HCPair<ContrastSpec>;

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

/**
 * Resolved color for a single scheme variant.
 *
 * Stored in OKHST: `h` / `s` are OKHSL hue/saturation, `t` is the canonical
 * contrast-uniform tone (0–1, reference eps). Convert to OKHSL lightness via
 * `variantToOkhsl` at the rendering / luminance edges.
 */
export interface ResolvedColorVariant {
  /** OKHSL hue (0–360). */
  h: number;
  /** OKHSL saturation (0–1). */
  s: number;
  /** Canonical tone (0–1, reference eps). */
  t: number;
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

/**
 * A scheme tone window.
 * - `[lo, hi]`: OKHSL-lightness endpoints (0–100) the authored tone is
 *   remapped into, using the reference eps `0.05`. The common form.
 * - `{ lo, hi, eps }`: same, with an explicit render curvature `eps`
 *   (advanced — most palettes never need this).
 * - `false`: disable clamping (full range `[0, 100]` at the reference eps).
 *   This removes the *boundaries*, not the tone curve.
 */
export type ToneWindow =
  | false
  | [number, number]
  | { lo: number; hi: number; eps: number };

export interface GlazeConfig {
  /** Light scheme tone window — `[lo, hi]` (default `[13, 100]`), `{ lo, hi, eps }` for advanced eps tuning, or `false` to disable clamping. */
  lightTone?: ToneWindow;
  /** Dark scheme tone window — `[lo, hi]` (default `[10, 95]`), `{ lo, hi, eps }`, or `false` to disable clamping. */
  darkTone?: ToneWindow;
  /** Saturation reduction factor for dark scheme (0–1). Default: 0.1. */
  darkDesaturation?: number;
  /**
   * Saturation taper toward the tone extremes (0–1). The fraction of the
   * tone range over which saturation rolls off at each end, where in-gamut
   * chroma collapses. Default: 0.15. Set to 0 to disable.
   */
  saturationTaper?: number;
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
   * Automatically flip tone direction when contrast can't be met.
   *
   * When enabled (default `true`), the solver searches the requested
   * tone direction first. If that direction can't reach the target,
   * it tries the opposite direction and uses it when it passes. If neither
   * side passes, the tone is pinned to the requested-direction
   * extreme and a warning is emitted.
   *
   * Set to `false` for strict "no flip" behavior. The opposite
   * direction is never considered: if the requested direction can't
   * meet the target, the tone is pinned to its extreme (never
   * falls back to the originally requested tone).
   */
  autoFlip?: boolean;
}

export interface GlazeConfigResolved {
  lightTone: ToneWindow;
  darkTone: ToneWindow;
  darkDesaturation: number;
  saturationTaper: number;
  states: {
    dark: string;
    highContrast: string;
  };
  modes: Required<GlazeOutputModes>;
  shadowTuning?: ShadowTuning;
  autoFlip: boolean;
}

/**
 * Per-instance config override for `glaze.color()` and `glaze()` themes.
 * Fields that are set take priority over the live global config. Fields
 * that are omitted fall through to the live global at resolve time.
 *
 * `false` for a tone window disables clamping (full range at reference eps).
 */
export interface GlazeConfigOverride {
  /** Light scheme tone window, or `false` to disable clamping. */
  lightTone?: ToneWindow;
  /** Dark scheme tone window, or `false` to disable clamping. */
  darkTone?: ToneWindow;
  /** Saturation reduction factor for dark scheme (0–1). */
  darkDesaturation?: number;
  /** Saturation taper toward the tone extremes (0–1). */
  saturationTaper?: number;
  /** Whether to auto-flip tone when contrast can't be met. */
  autoFlip?: boolean;
  /**
   * Shadow tuning defaults. Only meaningful for themes; harmless on
   * standalone color tokens.
   */
  shadowTuning?: ShadowTuning;
}

// ============================================================================
// Serialization
// ============================================================================

/** Serialized theme configuration (no resolved values). */
export interface GlazeThemeExport {
  hue: number;
  saturation: number;
  colors: ColorMap;
  /** Per-theme config override, if any. */
  config?: GlazeConfigOverride;
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
  tone: HCPair<number | ExtremeValue>;
  saturationFactor?: number;
  mode?: AdaptationMode;
  /** Flip out-of-bounds results instead of clamping. Default: global `autoFlip`. */
  flip?: boolean;
  /**
   * Fixed opacity (0–1). Output includes alpha in the CSS value.
   * Combining with `contrast` is not recommended (perceived tone
   * becomes unpredictable) — a `console.warn` is emitted in that case.
   */
  opacity?: number;
  /**
   * Optional dependency on another color. Same semantics as
   * `GlazeColorOverrides.base` — `contrast` and relative `tone`
   * anchor to the base per scheme.
   */
  base?: GlazeColorToken | GlazeColorValue;
  /**
   * Contrast floor against `base`. Requires `base` to be set. A bare
   * number/preset is WCAG; use `{ wcag }` / `{ apca }` to pick the metric.
   */
  contrast?: HCPair<ContrastSpec>;
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
 * - `{ h, s, t }` — OKHST (h: 0–360, s/t: 0–1). Tone in 0–1.
 * - `{ r, g, b }` — sRGB 0–255.
 * - `{ l, c, h }` — OKLCh (L/C: 0–1, H: degrees), same as `oklch()` strings.
 */
export type GlazeColorValue =
  | string
  | OkhslColor
  | OkhstColor
  | RgbColor
  | OklchColor;

/** Color overrides for the `from` and value-shorthand inputs. */
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
   * Override tone. Number is absolute (0–100, contrast-uniform); `'+N'`/`'-N'`
   * is relative to the literal seed (the value passed to `glaze.color()`);
   * `'max'` / `'min'` force to the scheme's tone extreme.
   * Supports HCPair for high-contrast.
   */
  tone?: HCPair<ToneValue>;
  /** Saturation multiplier on the seed (0–1). Default: 1. */
  saturationFactor?: number;
  /**
   * Adaptation mode. Defaults to `'auto'` for every input form, so
   * colors automatically adapt between light and dark like an ordinary
   * theme color. All value-shorthand inputs (strings and literal objects)
   * preserve light tone (`lightTone: false`) and snapshot
   * `globalConfig.darkTone` on the dark side. Only the structured
   * `{ hue, saturation, tone }` form also snapshots
   * `globalConfig.lightTone`.
   *
   * Pass `'fixed'` explicitly to opt back into the linear, non-
   * inverting mapping; pass `'static'` to pin the same tone
   * across every variant.
   */
  mode?: AdaptationMode;

  /**
   * Flip out-of-bounds results (relative `tone` overshoot / unmet
   * `contrast`) to the opposite side instead of clamping. Defaults to
   * the global `autoFlip`.
   */
  flip?: boolean;

  /**
   * Contrast floor. By default solved against the literal seed
   * (the value itself); when `base` is set, solved against the base's
   * resolved variant per scheme. Same shape as `RegularColorDef.contrast`
   * (bare number/preset = WCAG; `{ wcag }` / `{ apca }` to pick the metric).
   */
  contrast?: HCPair<ContrastSpec>;

  /**
   * Optional dependency on another color. Accepts either a
   * `GlazeColorToken` (returned by another `glaze.color()`) or a raw
   * `GlazeColorValue` (hex / CSS strings / `{ r, g, b }` / `{ h, s, l }` / …),
   * which is automatically wrapped in `glaze.color(value)`.
   *
   * When set:
   * - `contrast` is solved against the base's resolved variant
   *   per-scheme (light / dark / lightContrast / darkContrast).
   * - Relative `tone: '+N'` / `'-N'` is anchored to the base's
   *   tone per-scheme (matches theme behavior for dependent colors).
   * - Relative `hue: '+N'` / `'-N'` still anchors to the seed (the
   *   value passed to `glaze.color()`), not the base.
   * - When the base was created via the structured form (with explicit
   *   `hue`/`saturation`/`tone`), it is resolved at full range
   *   (`lightTone: false`) for the linking math — ensuring the
   *   contrast/tone anchor matches the input tone, not the
   *   windowed output. The base's own `.resolve()` output is unaffected.
   *
   * The base token's `.resolve()` is called lazily on first resolve and
   * its result is captured by reference; later mutations to the base's
   * defining call don't apply (matches existing token snapshot semantics).
   */
  base?: GlazeColorToken | GlazeColorValue;

  /**
   * Fixed opacity (0–1). Output includes alpha in the CSS value.
   * Combining with `contrast` is not recommended (perceived tone
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
 * Object input for `glaze.color()` that carries a raw color value plus
 * optional color overrides in the same object.
 *
 * ```ts
 * glaze.color({ from: '#1a1a2e', base: bg, contrast: 'AA' })
 * glaze.color({ from: { r: 38, g: 252, b: 178 }, tone: '+10' })
 * ```
 */
export interface GlazeFromInput extends GlazeColorOverrides {
  /** The source color value. Accepts the same forms as a bare `GlazeColorValue`. */
  from: GlazeColorValue;
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
   * input value, overrides, and config so it can be rehydrated via
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
   * - `'value'`: created via `glaze.color(value)` or `glaze.color({ from, ...overrides })`.
   * - `'structured'`: created via `glaze.color({ hue, saturation, ... })`.
   */
  form: 'value' | 'structured';
  /** Original input. For `form: 'value'` this is the raw `GlazeColorValue`; for `form: 'structured'` this is the structured input. */
  input: GlazeColorValue | GlazeColorInputExport;
  /**
   * Overrides recorded at creation time. `base` is recursively
   * serialized. Only present for `form: 'value'`.
   */
  overrides?: GlazeColorOverridesExport;
  /**
   * Effective config snapshot at creation time — captures the merged
   * result of the global config + any per-call override at the moment
   * the token was created. Only fields that differ from their
   * post-merge defaults are present. Used by `glaze.colorFrom()` to
   * reproduce deterministic behavior across `configure()` calls.
   */
  config?: GlazeConfigOverride;
}

/**
 * Serializable shape of a structured `glaze.color({...})` input.
 * Differs from `GlazeColorInput` only in that `base` is replaced by an
 * `export` instead of a token reference.
 */
export interface GlazeColorInputExport {
  hue: number;
  saturation: number;
  tone: HCPair<number | ExtremeValue>;
  saturationFactor?: number;
  mode?: AdaptationMode;
  flip?: boolean;
  opacity?: number;
  base?: GlazeColorTokenExport | GlazeColorValue;
  contrast?: HCPair<ContrastSpec>;
  name?: string;
}

/**
 * Serializable shape of `GlazeColorOverrides`. `base` is replaced by
 * its export (or left as a `GlazeColorValue` if it was originally a value).
 */
export interface GlazeColorOverridesExport {
  hue?: number | RelativeValue;
  saturation?: number;
  tone?: HCPair<ToneValue>;
  saturationFactor?: number;
  mode?: AdaptationMode;
  flip?: boolean;
  contrast?: HCPair<ContrastSpec>;
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
  /** Config override for the child theme. Merged with the parent's override. */
  config?: GlazeConfigOverride;
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
