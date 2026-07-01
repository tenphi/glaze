/**
 * Glaze — OKHST color theme generator.
 *
 * Generates robust light, dark, and high-contrast color schemes from a
 * hue/saturation seed on a contrast-uniform tone axis, with WCAG + APCA
 * contrast solving.
 */

export { glaze } from './glaze';

// Re-export types for consumers
export type {
  HCPair,
  MinContrast,
  ContrastSpec,
  RelativeValue,
  ExtremeValue,
  ToneValue,
  AdaptationMode,
  GlazeColorFormat,
  GlazeOutputModes,
  HexColor,
  OkhslColor,
  OkhstColor,
  RgbColor,
  OklchColor,
  ToneWindow,
  RegularColorDef,
  ShadowColorDef,
  ShadowTuning,
  MixColorDef,
  ColorDef,
  ColorMap,
  ResolvedColor,
  ResolvedColorVariant,
  GlazeConfig,
  GlazeConfigOverride,
  GlazeConfigResolved,
  GlazeTheme,
  GlazeThemeExport,
  GlazeExtendOptions,
  GlazeTokenOptions,
  GlazeJsonOptions,
  GlazeCssOptions,
  GlazeCssResult,
  GlazeColorInput,
  GlazeColorInputExport,
  GlazeColorToken,
  GlazeColorTokenExport,
  GlazeColorValue,
  GlazeColorOverrides,
  GlazeColorOverridesExport,
  GlazeColorCssOptions,
  GlazeFromInput,
  GlazeShadowInput,
  GlazePalette,
  GlazePaletteOptions,
  GlazePaletteExportOptions,
  Role,
  RoleInput,
} from './types';

// Re-export contrast solver utilities for advanced use
export {
  findToneForContrast,
  findValueForMixContrast,
  resolveMinContrast,
  resolveContrastForMode,
  resolveApcaTarget,
  apcaContrast,
} from './contrast-solver';
export type {
  ContrastPreset,
  ApcaPreset,
  ResolvedContrast,
  FindToneForContrastOptions,
  FindToneForContrastResult,
  FindValueForMixContrastOptions,
  FindValueForMixContrastResult,
} from './contrast-solver';

// Re-export role helpers for advanced use
export {
  normalizeRole,
  inferRoleFromName,
  roleToPolarity,
  oppositeRole,
} from './roles';
export type { Polarity } from './roles';

// Re-export OKHST tone utilities for advanced use
export {
  toTone,
  fromTone,
  toneFromY,
  yFromTone,
  okhstToOkhsl,
  okhslToOkhst,
  variantToOkhsl,
  REF_EPS,
} from './okhst';

// Re-export color math for advanced use
export {
  okhslToLinearSrgb,
  okhslToSrgb,
  okhslToOklab,
  oklabToOkhsl,
  srgbToOkhsl,
  hslToSrgb,
  cuspLightness,
  parseHex,
  parseHexAlpha,
  relativeLuminanceFromLinearRgb,
  contrastRatioFromLuminance,
  gamutClampedLuminance,
  formatOkhsl,
  formatRgb,
  formatHsl,
  formatOklch,
} from './okhsl-color-math';
