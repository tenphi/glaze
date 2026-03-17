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
  HexColor,
  OkhslColor,
  RegularColorDef,
  ShadowColorDef,
  ShadowTuning,
  MixColorDef,
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
  GlazeShadowInput,
  GlazePalette,
} from './types';

// Re-export contrast solver utilities for advanced use
export {
  findLightnessForContrast,
  findValueForMixContrast,
  resolveMinContrast,
} from './contrast-solver';
export type {
  ContrastPreset,
  FindLightnessForContrastOptions,
  FindLightnessForContrastResult,
  FindValueForMixContrastOptions,
  FindValueForMixContrastResult,
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
