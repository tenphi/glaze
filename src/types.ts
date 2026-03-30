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
  /** Background color — hex string or OKHSL { h, s (0-1), l (0-1) }. */
  bg: HexColor | OkhslColor;
  /** Foreground color for tinting + intensity modulation. */
  fg?: HexColor | OkhslColor;
  /** Intensity 0-100. */
  intensity: number;
  tuning?: ShadowTuning;
}

// ============================================================================
// Standalone color token
// ============================================================================

/** Input for `glaze.color()` standalone factory. */
export interface GlazeColorInput {
  hue: number;
  saturation: number;
  lightness: HCPair<number>;
  saturationFactor?: number;
  mode?: AdaptationMode;
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
   * @see https://cube-ui-kit.vercel.app/?path=/docs/tasty-documentation--docs
   */
  tasty(options?: GlazeTokenOptions): Record<string, string>;
  /** Export as a flat JSON map (no color name key). */
  json(options?: GlazeJsonOptions): Record<string, string>;
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
   * @see https://cube-ui-kit.vercel.app/?path=/docs/tasty-documentation--docs
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
   * @see https://cube-ui-kit.vercel.app/?path=/docs/tasty-documentation--docs
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
