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

export interface ColorDef {
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
}

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
}

/** Fully resolved color across all scheme variants. */
export interface ResolvedColor {
  name: string;
  light: ResolvedColorVariant;
  dark: ResolvedColorVariant;
  lightContrast: ResolvedColorVariant;
  darkContrast: ResolvedColorVariant;
  mode: AdaptationMode;
}

// ============================================================================
// Configuration
// ============================================================================

export interface GlazeConfig {
  /** Dark scheme lightness window [lo, hi]. Default: [10, 90]. */
  darkLightness?: [number, number];
  /** Saturation reduction factor for dark scheme (0–1). Default: 0.1. */
  darkDesaturation?: number;
  /** State alias names for token export. */
  states?: {
    dark?: string;
    highContrast?: string;
  };
  /** Which scheme variants to include in exports. Default: both true. */
  modes?: GlazeOutputModes;
}

export interface GlazeConfigResolved {
  darkLightness: [number, number];
  darkDesaturation: number;
  states: {
    dark: string;
    highContrast: string;
  };
  modes: Required<GlazeOutputModes>;
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

export interface GlazePalette {
  /**
   * Export all themes as a flat token map grouped by scheme variant.
   *
   * ```ts
   * palette.tokens({ prefix: true })
   * // → { light: { 'primary-surface': 'okhsl(...)' }, dark: { 'primary-surface': 'okhsl(...)' } }
   * ```
   */
  tokens(
    options?: GlazeJsonOptions & {
      prefix?: boolean | Record<string, string>;
    },
  ): Record<string, Record<string, string>>;

  /**
   * Export all themes as tasty style-to-state bindings.
   * Uses `#name` color token keys and state aliases (`''`, `@dark`, etc.).
   * Spread into component styles or register as a recipe via `configure({ recipes })`.
   * @see https://cube-ui-kit.vercel.app/?path=/docs/tasty-documentation--docs
   */
  tasty(options?: GlazeTokenOptions): Record<string, Record<string, string>>;

  /** Export all themes as plain JSON. */
  json(
    options?: GlazeJsonOptions & {
      prefix?: boolean | Record<string, string>;
    },
  ): Record<string, Record<string, Record<string, string>>>;

  /** Export all themes as CSS custom property declarations. */
  css(
    options?: GlazeCssOptions & {
      prefix?: boolean | Record<string, string>;
    },
  ): GlazeCssResult;
}
