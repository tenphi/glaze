/**
 * Glaze — OKHSL-based color theme generator.
 *
 * Generates robust light, dark, and high-contrast color schemes
 * from a hue/saturation seed with WCAG contrast solving.
 */

export { glaze } from './glaze';

// Re-export types for consumers
export type {
  HCPair,
  MinContrast,
  RelativeValue,
  AdaptationMode,
  GlazeColorFormat,
  GlazeOutputModes,
  ColorDef,
  ColorMap,
  ResolvedColor,
  ResolvedColorVariant,
  GlazeConfig,
  GlazeTheme,
  GlazeThemeExport,
  GlazeExtendOptions,
  GlazeTokenOptions,
  GlazeJsonOptions,
  GlazeCssOptions,
  GlazeCssResult,
  GlazeColorInput,
  GlazeColorToken,
  GlazePalette,
} from './types';

// Re-export contrast solver utilities for advanced use
export {
  findLightnessForContrast,
  resolveMinContrast,
} from './contrast-solver';
export type {
  ContrastPreset,
  FindLightnessForContrastOptions,
  FindLightnessForContrastResult,
} from './contrast-solver';

// Re-export color math for advanced use
export {
  okhslToLinearSrgb,
  okhslToSrgb,
  okhslToOklab,
  srgbToOkhsl,
  parseHex,
  relativeLuminanceFromLinearRgb,
  contrastRatioFromLuminance,
  formatOkhsl,
  formatRgb,
  formatHsl,
  formatOklch,
} from './okhsl-color-math';
