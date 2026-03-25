/**
 * Glaze — OKHSL-based color theme generator.
 *
 * Generates robust light, dark, and high-contrast colors from a hue/saturation
 * seed, preserving contrast for UI pairs via explicit dependencies.
 */

import {
  okhslToLinearSrgb,
  sRGBLinearToGamma,
  gamutClampedLuminance,
  formatOkhsl,
  formatRgb,
  formatHsl,
  formatOklch,
  srgbToOkhsl,
  parseHex,
} from './okhsl-color-math';
import {
  findLightnessForContrast,
  findValueForMixContrast,
} from './contrast-solver';
import type { LinearRgb } from './contrast-solver';
import type {
  HCPair,
  AdaptationMode,
  RelativeValue,
  RegularColorDef,
  ShadowColorDef,
  ShadowTuning,
  MixColorDef,
  ColorDef,
  ColorMap,
  ResolvedColor,
  ResolvedColorVariant,
  GlazeColorFormat,
  GlazeConfig,
  GlazeConfigResolved,
  GlazeOutputModes,
  GlazeTheme,
  GlazeThemeExport,
  GlazeExtendOptions,
  GlazeTokenOptions,
  GlazeJsonOptions,
  GlazeCssOptions,
  GlazeCssResult,
  GlazePaletteExportOptions,
  GlazeColorInput,
  GlazeColorToken,
  GlazeShadowInput,
  OkhslColor,
} from './types';

// ============================================================================
// Global configuration
// ============================================================================

let globalConfig: GlazeConfigResolved = {
  lightLightness: [10, 100],
  darkLightness: [15, 95],
  darkDesaturation: 0.1,
  states: {
    dark: '@dark',
    highContrast: '@high-contrast',
  },
  modes: {
    dark: true,
    highContrast: false,
  },
};

// ============================================================================
// HCPair helpers
// ============================================================================

function pairNormal<T>(p: HCPair<T>): T {
  return Array.isArray(p) ? p[0] : p;
}

function pairHC<T>(p: HCPair<T>): T {
  return Array.isArray(p) ? p[1] : p;
}

// ============================================================================
// Shadow helpers
// ============================================================================

function isShadowDef(def: ColorDef): def is ShadowColorDef {
  return (def as ShadowColorDef).type === 'shadow';
}

function isMixDef(def: ColorDef): def is MixColorDef {
  return (def as MixColorDef).type === 'mix';
}

const DEFAULT_SHADOW_TUNING: Required<ShadowTuning> = {
  saturationFactor: 0.18,
  maxSaturation: 0.25,
  lightnessFactor: 0.25,
  lightnessBounds: [0.05, 0.2],
  minGapTarget: 0.05,
  alphaMax: 1.0,
  bgHueBlend: 0.2,
};

function resolveShadowTuning(perColor?: ShadowTuning): Required<ShadowTuning> {
  return {
    ...DEFAULT_SHADOW_TUNING,
    ...globalConfig.shadowTuning,
    ...perColor,
    lightnessBounds:
      perColor?.lightnessBounds ??
      globalConfig.shadowTuning?.lightnessBounds ??
      DEFAULT_SHADOW_TUNING.lightnessBounds,
  };
}

function circularLerp(a: number, b: number, t: number): number {
  let diff = b - a;
  if (diff > 180) diff -= 360;
  else if (diff < -180) diff += 360;
  return (((a + diff * t) % 360) + 360) % 360;
}

/**
 * Compute the canonical max-contrast reference t value for normalization.
 * Uses bg.l=1, fg.l=0, intensity=100 — the theoretical maximum.
 * This is a fixed constant per tuning configuration, ensuring uniform
 * scaling across all bg/fg pairs at low intensities.
 */
function computeRefT(tuning: Required<ShadowTuning>): number {
  const EPSILON = 1e-6;
  let lShRef = clamp(
    tuning.lightnessFactor,
    tuning.lightnessBounds[0],
    tuning.lightnessBounds[1],
  );
  lShRef = Math.max(Math.min(lShRef, 1 - tuning.minGapTarget), 0);
  const gapRef = Math.max(1 - lShRef, EPSILON);
  return 1 / gapRef;
}

function computeShadow(
  bg: ResolvedColorVariant,
  fg: ResolvedColorVariant | undefined,
  intensity: number,
  tuning: Required<ShadowTuning>,
): ResolvedColorVariant {
  const EPSILON = 1e-6;
  const clampedIntensity = clamp(intensity, 0, 100);
  const contrastWeight = fg ? Math.abs(bg.l - fg.l) : 1;
  const deltaL = (clampedIntensity / 100) * contrastWeight;

  const h = fg ? circularLerp(fg.h, bg.h, tuning.bgHueBlend) : bg.h;
  const s = fg
    ? Math.min(fg.s * tuning.saturationFactor, tuning.maxSaturation)
    : 0;

  let lSh = clamp(
    bg.l * tuning.lightnessFactor,
    tuning.lightnessBounds[0],
    tuning.lightnessBounds[1],
  );
  lSh = Math.max(Math.min(lSh, bg.l - tuning.minGapTarget), 0);

  const gap = Math.max(bg.l - lSh, EPSILON);
  const t = deltaL / gap;

  const tRef = computeRefT(tuning);
  const norm = Math.tanh(tRef / tuning.alphaMax);
  const alpha = Math.min(
    (tuning.alphaMax * Math.tanh(t / tuning.alphaMax)) / norm,
    tuning.alphaMax,
  );

  return { h, s, l: lSh, alpha };
}

// ============================================================================
// Validation
// ============================================================================

function validateColorDefs(defs: ColorMap): void {
  const names = new Set(Object.keys(defs));

  for (const [name, def] of Object.entries(defs)) {
    if (isShadowDef(def)) {
      if (!names.has(def.bg)) {
        throw new Error(
          `glaze: shadow "${name}" references non-existent bg "${def.bg}".`,
        );
      }
      if (isShadowDef(defs[def.bg])) {
        throw new Error(
          `glaze: shadow "${name}" bg "${def.bg}" references another shadow color.`,
        );
      }
      if (def.fg !== undefined) {
        if (!names.has(def.fg)) {
          throw new Error(
            `glaze: shadow "${name}" references non-existent fg "${def.fg}".`,
          );
        }
        if (isShadowDef(defs[def.fg])) {
          throw new Error(
            `glaze: shadow "${name}" fg "${def.fg}" references another shadow color.`,
          );
        }
      }
      continue;
    }

    if (isMixDef(def)) {
      if (!names.has(def.base)) {
        throw new Error(
          `glaze: mix "${name}" references non-existent base "${def.base}".`,
        );
      }
      if (!names.has(def.target)) {
        throw new Error(
          `glaze: mix "${name}" references non-existent target "${def.target}".`,
        );
      }
      if (isShadowDef(defs[def.base])) {
        throw new Error(
          `glaze: mix "${name}" base "${def.base}" references a shadow color.`,
        );
      }
      if (isShadowDef(defs[def.target])) {
        throw new Error(
          `glaze: mix "${name}" target "${def.target}" references a shadow color.`,
        );
      }
      continue;
    }

    const regDef = def as RegularColorDef;

    if (regDef.contrast !== undefined && !regDef.base) {
      throw new Error(`glaze: color "${name}" has "contrast" without "base".`);
    }

    if (
      regDef.lightness !== undefined &&
      !isAbsoluteLightness(regDef.lightness) &&
      !regDef.base
    ) {
      throw new Error(
        `glaze: color "${name}" has relative "lightness" without "base".`,
      );
    }

    if (regDef.base && !names.has(regDef.base)) {
      throw new Error(
        `glaze: color "${name}" references non-existent base "${regDef.base}".`,
      );
    }

    if (regDef.base && isShadowDef(defs[regDef.base])) {
      throw new Error(
        `glaze: color "${name}" base "${regDef.base}" references a shadow color.`,
      );
    }

    if (!isAbsoluteLightness(regDef.lightness) && regDef.base === undefined) {
      throw new Error(
        `glaze: color "${name}" must have either absolute "lightness" (root) or "base" (dependent).`,
      );
    }

    if (regDef.contrast !== undefined && regDef.opacity !== undefined) {
      console.warn(
        `glaze: color "${name}" has both "contrast" and "opacity". Opacity makes perceived lightness unpredictable.`,
      );
    }
  }

  // Check for circular references (follows base, bg, fg edges)
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(name: string): void {
    if (inStack.has(name)) {
      throw new Error(
        `glaze: circular base reference detected involving "${name}".`,
      );
    }
    if (visited.has(name)) return;

    inStack.add(name);
    const def = defs[name];
    if (isShadowDef(def)) {
      dfs(def.bg);
      if (def.fg) dfs(def.fg);
    } else if (isMixDef(def)) {
      dfs(def.base);
      dfs(def.target);
    } else {
      const regDef = def as RegularColorDef;
      if (regDef.base) {
        dfs(regDef.base);
      }
    }
    inStack.delete(name);
    visited.add(name);
  }

  for (const name of names) {
    dfs(name);
  }
}

// ============================================================================
// Topological sort
// ============================================================================

function topoSort(defs: ColorMap): string[] {
  const result: string[] = [];
  const visited = new Set<string>();

  function visit(name: string): void {
    if (visited.has(name)) return;
    visited.add(name);

    const def = defs[name];
    if (isShadowDef(def)) {
      visit(def.bg);
      if (def.fg) visit(def.fg);
    } else if (isMixDef(def)) {
      visit(def.base);
      visit(def.target);
    } else {
      const regDef = def as RegularColorDef;
      if (regDef.base) {
        visit(regDef.base);
      }
    }

    result.push(name);
  }

  for (const name of Object.keys(defs)) {
    visit(name);
  }

  return result;
}

// ============================================================================
// Light scheme mapping
// ============================================================================

function mapLightnessLight(l: number, mode: AdaptationMode): number {
  if (mode === 'static') return l;
  const [lo, hi] = globalConfig.lightLightness;
  return (l * (hi - lo)) / 100 + lo;
}

// ============================================================================
// Dark scheme mapping
// ============================================================================

function mapLightnessDark(l: number, mode: AdaptationMode): number {
  if (mode === 'static') return l;

  const [lo, hi] = globalConfig.darkLightness;

  if (mode === 'fixed') {
    return (l * (hi - lo)) / 100 + lo;
  }

  // auto — inverted
  return ((100 - l) * (hi - lo)) / 100 + lo;
}

function mapSaturationDark(s: number, mode: AdaptationMode): number {
  if (mode === 'static') return s;
  return s * (1 - globalConfig.darkDesaturation);
}

function schemeLightnessRange(
  isDark: boolean,
  mode: AdaptationMode,
): [number, number] {
  if (mode === 'static') return [0, 1];
  const [lo, hi] = isDark
    ? globalConfig.darkLightness
    : globalConfig.lightLightness;
  return [lo / 100, hi / 100];
}

// ============================================================================
// Helpers
// ============================================================================

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Parse a value that can be absolute (number) or relative (signed string).
 * Returns the numeric value and whether it's relative.
 */
function parseRelativeOrAbsolute(value: number | RelativeValue): {
  value: number;
  relative: boolean;
} {
  if (typeof value === 'number') {
    return { value, relative: false };
  }
  return { value: parseFloat(value), relative: true };
}

/**
 * Compute the effective hue for a color, given the theme seed hue
 * and an optional per-color hue override.
 */
function resolveEffectiveHue(
  seedHue: number,
  defHue: number | RelativeValue | undefined,
): number {
  if (defHue === undefined) return seedHue;
  const parsed = parseRelativeOrAbsolute(defHue);
  if (parsed.relative) {
    return (((seedHue + parsed.value) % 360) + 360) % 360;
  }
  return ((parsed.value % 360) + 360) % 360;
}

/**
 * Check whether a lightness value represents an absolute root definition
 * (i.e. a number, not a relative string).
 */
function isAbsoluteLightness(
  lightness: HCPair<number | RelativeValue> | undefined,
): boolean {
  if (lightness === undefined) return false;
  const normal = Array.isArray(lightness) ? lightness[0] : lightness;
  return typeof normal === 'number';
}

// ============================================================================
// Color resolution engine
// ============================================================================

interface ResolveContext {
  hue: number;
  saturation: number;
  defs: ColorMap;
  resolved: Map<string, ResolvedColor>;
}

function resolveRootColor(
  _name: string,
  def: RegularColorDef,
  _ctx: ResolveContext,
  isHighContrast: boolean,
): { lightL: number; satFactor: number } {
  const rawL = def.lightness!;
  const rawValue = isHighContrast ? pairHC(rawL) : pairNormal(rawL);
  const parsed = parseRelativeOrAbsolute(rawValue);
  const lightL = clamp(parsed.value, 0, 100);
  const satFactor = clamp(def.saturation ?? 1, 0, 1);
  return { lightL, satFactor };
}

function resolveDependentColor(
  name: string,
  def: RegularColorDef,
  ctx: ResolveContext,
  isHighContrast: boolean,
  isDark: boolean,
  effectiveHue: number,
): { l: number; satFactor: number } {
  const baseName = def.base!;
  const baseResolved = ctx.resolved.get(baseName);
  if (!baseResolved) {
    throw new Error(
      `glaze: base "${baseName}" not yet resolved for "${name}".`,
    );
  }

  const mode = def.mode ?? 'auto';
  const satFactor = clamp(def.saturation ?? 1, 0, 1);

  const baseVariant = getSchemeVariant(baseResolved, isDark, isHighContrast);
  const baseL = baseVariant.l * 100;

  let preferredL: number;
  const rawLightness = def.lightness;

  if (rawLightness === undefined) {
    preferredL = baseL;
  } else {
    const rawValue = isHighContrast
      ? pairHC(rawLightness)
      : pairNormal(rawLightness);
    const parsed = parseRelativeOrAbsolute(rawValue);

    if (parsed.relative) {
      let delta = parsed.value;
      if (isDark && mode === 'auto') {
        delta = -delta;
      }
      preferredL = clamp(baseL + delta, 0, 100);
    } else {
      if (isDark) {
        preferredL = mapLightnessDark(parsed.value, mode);
      } else {
        preferredL = mapLightnessLight(parsed.value, mode);
      }
    }
  }

  const rawContrast = def.contrast;
  if (rawContrast !== undefined) {
    const minCr = isHighContrast
      ? pairHC(rawContrast)
      : pairNormal(rawContrast);

    const effectiveSat = isDark
      ? mapSaturationDark((satFactor * ctx.saturation) / 100, mode)
      : (satFactor * ctx.saturation) / 100;

    const baseLinearRgb = okhslToLinearSrgb(
      baseVariant.h,
      baseVariant.s,
      baseVariant.l,
    );

    const lightnessRange = schemeLightnessRange(isDark, mode);

    const result = findLightnessForContrast({
      hue: effectiveHue,
      saturation: effectiveSat,
      preferredLightness: clamp(
        preferredL / 100,
        lightnessRange[0],
        lightnessRange[1],
      ),
      baseLinearRgb,
      contrast: minCr,
      lightnessRange,
    });

    return { l: result.lightness * 100, satFactor };
  }

  return { l: clamp(preferredL, 0, 100), satFactor };
}

function getSchemeVariant(
  color: ResolvedColor,
  isDark: boolean,
  isHighContrast: boolean,
): ResolvedColorVariant {
  if (isDark && isHighContrast) return color.darkContrast;
  if (isDark) return color.dark;
  if (isHighContrast) return color.lightContrast;
  return color.light;
}

function resolveColorForScheme(
  name: string,
  def: ColorDef,
  ctx: ResolveContext,
  isDark: boolean,
  isHighContrast: boolean,
): ResolvedColorVariant {
  if (isShadowDef(def)) {
    return resolveShadowForScheme(def, ctx, isDark, isHighContrast);
  }

  if (isMixDef(def)) {
    return resolveMixForScheme(def, ctx, isDark, isHighContrast);
  }

  const regDef = def as RegularColorDef;
  const mode = regDef.mode ?? 'auto';
  const isRoot = isAbsoluteLightness(regDef.lightness) && !regDef.base;
  const effectiveHue = resolveEffectiveHue(ctx.hue, regDef.hue);

  let lightL: number;
  let satFactor: number;

  if (isRoot) {
    const root = resolveRootColor(name, regDef, ctx, isHighContrast);
    lightL = root.lightL;
    satFactor = root.satFactor;
  } else {
    const dep = resolveDependentColor(
      name,
      regDef,
      ctx,
      isHighContrast,
      isDark,
      effectiveHue,
    );
    lightL = dep.l;
    satFactor = dep.satFactor;
  }

  let finalL: number;
  let finalSat: number;

  if (isDark && isRoot) {
    finalL = mapLightnessDark(lightL, mode);
    finalSat = mapSaturationDark((satFactor * ctx.saturation) / 100, mode);
  } else if (isDark && !isRoot) {
    finalL = lightL;
    finalSat = mapSaturationDark((satFactor * ctx.saturation) / 100, mode);
  } else if (isRoot) {
    finalL = mapLightnessLight(lightL, mode);
    finalSat = (satFactor * ctx.saturation) / 100;
  } else {
    finalL = lightL;
    finalSat = (satFactor * ctx.saturation) / 100;
  }

  return {
    h: effectiveHue,
    s: clamp(finalSat, 0, 1),
    l: clamp(finalL / 100, 0, 1),
    alpha: regDef.opacity ?? 1,
  };
}

function resolveShadowForScheme(
  def: ShadowColorDef,
  ctx: ResolveContext,
  isDark: boolean,
  isHighContrast: boolean,
): ResolvedColorVariant {
  const bgResolved = ctx.resolved.get(def.bg)!;
  const bgVariant = getSchemeVariant(bgResolved, isDark, isHighContrast);

  let fgVariant: ResolvedColorVariant | undefined;
  if (def.fg) {
    const fgResolved = ctx.resolved.get(def.fg)!;
    fgVariant = getSchemeVariant(fgResolved, isDark, isHighContrast);
  }

  const intensity = isHighContrast
    ? pairHC(def.intensity)
    : pairNormal(def.intensity);

  const tuning = resolveShadowTuning(def.tuning);
  return computeShadow(bgVariant, fgVariant, intensity, tuning);
}

function variantToLinearRgb(v: ResolvedColorVariant): LinearRgb {
  return okhslToLinearSrgb(v.h, v.s, v.l);
}

/**
 * Resolve hue for OKHSL mixing, handling achromatic colors.
 * When one color has no saturation, its hue is meaningless —
 * use the hue from the color that has saturation (matches CSS
 * color-mix "missing component" behavior).
 */
function mixHue(
  base: ResolvedColorVariant,
  target: ResolvedColorVariant,
  t: number,
): number {
  const SAT_EPSILON = 1e-6;
  const baseHasSat = base.s > SAT_EPSILON;
  const targetHasSat = target.s > SAT_EPSILON;

  if (baseHasSat && targetHasSat) return circularLerp(base.h, target.h, t);
  if (targetHasSat) return target.h;
  return base.h;
}

function linearSrgbLerp(
  base: LinearRgb,
  target: LinearRgb,
  t: number,
): LinearRgb {
  return [
    base[0] + (target[0] - base[0]) * t,
    base[1] + (target[1] - base[1]) * t,
    base[2] + (target[2] - base[2]) * t,
  ];
}

function linearRgbToVariant(rgb: LinearRgb): ResolvedColorVariant {
  const gamma: [number, number, number] = [
    Math.max(0, Math.min(1, sRGBLinearToGamma(rgb[0]))),
    Math.max(0, Math.min(1, sRGBLinearToGamma(rgb[1]))),
    Math.max(0, Math.min(1, sRGBLinearToGamma(rgb[2]))),
  ];
  const [h, s, l] = srgbToOkhsl(gamma);
  return { h, s, l, alpha: 1 };
}

function resolveMixForScheme(
  def: MixColorDef,
  ctx: ResolveContext,
  isDark: boolean,
  isHighContrast: boolean,
): ResolvedColorVariant {
  const baseResolved = ctx.resolved.get(def.base)!;
  const targetResolved = ctx.resolved.get(def.target)!;
  const baseVariant = getSchemeVariant(baseResolved, isDark, isHighContrast);
  const targetVariant = getSchemeVariant(
    targetResolved,
    isDark,
    isHighContrast,
  );

  const rawValue = isHighContrast ? pairHC(def.value) : pairNormal(def.value);
  let t = clamp(rawValue, 0, 100) / 100;

  const blend = def.blend ?? 'opaque';
  const space = def.space ?? 'okhsl';
  const baseLinear = variantToLinearRgb(baseVariant);
  const targetLinear = variantToLinearRgb(targetVariant);

  if (def.contrast !== undefined) {
    const minCr = isHighContrast
      ? pairHC(def.contrast)
      : pairNormal(def.contrast);

    let luminanceAt: (v: number) => number;

    if (blend === 'transparent') {
      luminanceAt = (v: number) =>
        gamutClampedLuminance(linearSrgbLerp(baseLinear, targetLinear, v));
    } else if (space === 'srgb') {
      luminanceAt = (v: number) =>
        gamutClampedLuminance(linearSrgbLerp(baseLinear, targetLinear, v));
    } else {
      luminanceAt = (v: number) => {
        const h = mixHue(baseVariant, targetVariant, v);
        const s = baseVariant.s + (targetVariant.s - baseVariant.s) * v;
        const l = baseVariant.l + (targetVariant.l - baseVariant.l) * v;
        return gamutClampedLuminance(okhslToLinearSrgb(h, s, l));
      };
    }

    const result = findValueForMixContrast({
      preferredValue: t,
      baseLinearRgb: baseLinear,
      targetLinearRgb: targetLinear,
      contrast: minCr,
      luminanceAtValue: luminanceAt,
    });
    t = result.value;
  }

  if (blend === 'transparent') {
    return {
      h: targetVariant.h,
      s: targetVariant.s,
      l: targetVariant.l,
      alpha: clamp(t, 0, 1),
    };
  }

  if (space === 'srgb') {
    const mixed = linearSrgbLerp(baseLinear, targetLinear, t);
    return linearRgbToVariant(mixed);
  }

  return {
    h: mixHue(baseVariant, targetVariant, t),
    s: clamp(baseVariant.s + (targetVariant.s - baseVariant.s) * t, 0, 1),
    l: clamp(baseVariant.l + (targetVariant.l - baseVariant.l) * t, 0, 1),
    alpha: 1,
  };
}

function resolveAllColors(
  hue: number,
  saturation: number,
  defs: ColorMap,
): Map<string, ResolvedColor> {
  validateColorDefs(defs);
  const order = topoSort(defs);

  const ctx: ResolveContext = {
    hue,
    saturation,
    defs,
    resolved: new Map(),
  };

  function defMode(def: ColorDef): AdaptationMode | undefined {
    if (isShadowDef(def) || isMixDef(def)) return undefined;
    return (def as RegularColorDef).mode ?? 'auto';
  }

  // Pass 1: Light normal
  const lightMap = new Map<string, ResolvedColorVariant>();
  for (const name of order) {
    const variant = resolveColorForScheme(name, defs[name], ctx, false, false);
    lightMap.set(name, variant);
    ctx.resolved.set(name, {
      name,
      light: variant,
      dark: variant,
      lightContrast: variant,
      darkContrast: variant,
      mode: defMode(defs[name]),
    });
  }

  // Pass 2: Light high-contrast
  const lightHCMap = new Map<string, ResolvedColorVariant>();
  for (const name of order) {
    ctx.resolved.set(name, {
      ...ctx.resolved.get(name)!,
      lightContrast: lightMap.get(name)!,
    });
  }
  for (const name of order) {
    const variant = resolveColorForScheme(name, defs[name], ctx, false, true);
    lightHCMap.set(name, variant);
    ctx.resolved.set(name, {
      ...ctx.resolved.get(name)!,
      lightContrast: variant,
    });
  }

  // Pass 3: Dark normal
  const darkMap = new Map<string, ResolvedColorVariant>();
  for (const name of order) {
    ctx.resolved.set(name, {
      name,
      light: lightMap.get(name)!,
      dark: lightMap.get(name)!,
      lightContrast: lightHCMap.get(name)!,
      darkContrast: lightHCMap.get(name)!,
      mode: defMode(defs[name]),
    });
  }
  for (const name of order) {
    const variant = resolveColorForScheme(name, defs[name], ctx, true, false);
    darkMap.set(name, variant);
    ctx.resolved.set(name, {
      ...ctx.resolved.get(name)!,
      dark: variant,
    });
  }

  // Pass 4: Dark high-contrast
  const darkHCMap = new Map<string, ResolvedColorVariant>();
  for (const name of order) {
    ctx.resolved.set(name, {
      ...ctx.resolved.get(name)!,
      darkContrast: darkMap.get(name)!,
    });
  }
  for (const name of order) {
    const variant = resolveColorForScheme(name, defs[name], ctx, true, true);
    darkHCMap.set(name, variant);
    ctx.resolved.set(name, {
      ...ctx.resolved.get(name)!,
      darkContrast: variant,
    });
  }

  // Build final result
  const result = new Map<string, ResolvedColor>();
  for (const name of order) {
    result.set(name, {
      name,
      light: lightMap.get(name)!,
      dark: darkMap.get(name)!,
      lightContrast: lightHCMap.get(name)!,
      darkContrast: darkHCMap.get(name)!,
      mode: defMode(defs[name]),
    });
  }

  return result;
}

// ============================================================================
// Token formatting
// ============================================================================

const formatters: Record<
  GlazeColorFormat,
  (h: number, s: number, l: number) => string
> = {
  okhsl: formatOkhsl,
  rgb: formatRgb,
  hsl: formatHsl,
  oklch: formatOklch,
};

function fmt(value: number, decimals: number): string {
  return parseFloat(value.toFixed(decimals)).toString();
}

function formatVariant(
  v: ResolvedColorVariant,
  format: GlazeColorFormat = 'okhsl',
): string {
  const base = formatters[format](v.h, v.s * 100, v.l * 100);
  if (v.alpha >= 1) return base;
  const closing = base.lastIndexOf(')');
  return `${base.slice(0, closing)} / ${fmt(v.alpha, 4)})`;
}

function resolveModes(override?: GlazeOutputModes): Required<GlazeOutputModes> {
  return {
    dark: override?.dark ?? globalConfig.modes.dark,
    highContrast: override?.highContrast ?? globalConfig.modes.highContrast,
  };
}

function buildTokenMap(
  resolved: Map<string, ResolvedColor>,
  prefix: string,
  states: { dark: string; highContrast: string },
  modes: Required<GlazeOutputModes>,
  format: GlazeColorFormat = 'okhsl',
): Record<string, Record<string, string>> {
  const tokens: Record<string, Record<string, string>> = {};

  for (const [name, color] of resolved) {
    const key = `#${prefix}${name}`;
    const entry: Record<string, string> = {
      '': formatVariant(color.light, format),
    };

    if (modes.dark) {
      entry[states.dark] = formatVariant(color.dark, format);
    }
    if (modes.highContrast) {
      entry[states.highContrast] = formatVariant(color.lightContrast, format);
    }
    if (modes.dark && modes.highContrast) {
      entry[`${states.dark} & ${states.highContrast}`] = formatVariant(
        color.darkContrast,
        format,
      );
    }

    tokens[key] = entry;
  }

  return tokens;
}

function buildFlatTokenMap(
  resolved: Map<string, ResolvedColor>,
  prefix: string,
  modes: Required<GlazeOutputModes>,
  format: GlazeColorFormat = 'okhsl',
): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {
    light: {},
  };

  if (modes.dark) {
    result.dark = {};
  }
  if (modes.highContrast) {
    result.lightContrast = {};
  }
  if (modes.dark && modes.highContrast) {
    result.darkContrast = {};
  }

  for (const [name, color] of resolved) {
    const key = `${prefix}${name}`;

    result.light[key] = formatVariant(color.light, format);

    if (modes.dark) {
      result.dark[key] = formatVariant(color.dark, format);
    }
    if (modes.highContrast) {
      result.lightContrast[key] = formatVariant(color.lightContrast, format);
    }
    if (modes.dark && modes.highContrast) {
      result.darkContrast[key] = formatVariant(color.darkContrast, format);
    }
  }

  return result;
}

function buildJsonMap(
  resolved: Map<string, ResolvedColor>,
  modes: Required<GlazeOutputModes>,
  format: GlazeColorFormat = 'okhsl',
): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};

  for (const [name, color] of resolved) {
    const entry: Record<string, string> = {
      light: formatVariant(color.light, format),
    };

    if (modes.dark) {
      entry.dark = formatVariant(color.dark, format);
    }
    if (modes.highContrast) {
      entry.lightContrast = formatVariant(color.lightContrast, format);
    }
    if (modes.dark && modes.highContrast) {
      entry.darkContrast = formatVariant(color.darkContrast, format);
    }

    result[name] = entry;
  }

  return result;
}

function buildCssMap(
  resolved: Map<string, ResolvedColor>,
  prefix: string,
  suffix: string,
  format: GlazeColorFormat,
): GlazeCssResult {
  const lines: Record<keyof GlazeCssResult, string[]> = {
    light: [],
    dark: [],
    lightContrast: [],
    darkContrast: [],
  };

  for (const [name, color] of resolved) {
    const prop = `--${prefix}${name}${suffix}`;
    lines.light.push(`${prop}: ${formatVariant(color.light, format)};`);
    lines.dark.push(`${prop}: ${formatVariant(color.dark, format)};`);
    lines.lightContrast.push(
      `${prop}: ${formatVariant(color.lightContrast, format)};`,
    );
    lines.darkContrast.push(
      `${prop}: ${formatVariant(color.darkContrast, format)};`,
    );
  }

  return {
    light: lines.light.join('\n'),
    dark: lines.dark.join('\n'),
    lightContrast: lines.lightContrast.join('\n'),
    darkContrast: lines.darkContrast.join('\n'),
  };
}

// ============================================================================
// Theme implementation
// ============================================================================

function createTheme(
  hue: number,
  saturation: number,
  initialColors?: ColorMap,
): GlazeTheme {
  let colorDefs: ColorMap = initialColors ? { ...initialColors } : {};

  const theme: GlazeTheme = {
    get hue() {
      return hue;
    },
    get saturation() {
      return saturation;
    },

    colors(defs: ColorMap): void {
      colorDefs = { ...colorDefs, ...defs };
    },

    color(name: string, def?: ColorDef): ColorDef | undefined | void {
      if (def === undefined) {
        return colorDefs[name];
      }
      colorDefs[name] = def;
    },

    remove(names: string | string[]): void {
      const list = Array.isArray(names) ? names : [names];
      for (const name of list) {
        delete colorDefs[name];
      }
    },

    has(name: string): boolean {
      return name in colorDefs;
    },

    list(): string[] {
      return Object.keys(colorDefs);
    },

    reset(): void {
      colorDefs = {};
    },

    export(): GlazeThemeExport {
      return {
        hue,
        saturation,
        colors: { ...colorDefs },
      };
    },

    extend(options: GlazeExtendOptions): GlazeTheme {
      const newHue = options.hue ?? hue;
      const newSat = options.saturation ?? saturation;
      const mergedColors = options.colors
        ? { ...colorDefs, ...options.colors }
        : { ...colorDefs };

      return createTheme(newHue, newSat, mergedColors);
    },

    resolve(): Map<string, ResolvedColor> {
      return resolveAllColors(hue, saturation, colorDefs);
    },

    tokens(options?: GlazeJsonOptions): Record<string, Record<string, string>> {
      const resolved = resolveAllColors(hue, saturation, colorDefs);
      const modes = resolveModes(options?.modes);
      return buildFlatTokenMap(resolved, '', modes, options?.format);
    },

    tasty(options?: GlazeTokenOptions): Record<string, Record<string, string>> {
      const resolved = resolveAllColors(hue, saturation, colorDefs);
      const states = {
        dark: options?.states?.dark ?? globalConfig.states.dark,
        highContrast:
          options?.states?.highContrast ?? globalConfig.states.highContrast,
      };
      const modes = resolveModes(options?.modes);
      return buildTokenMap(resolved, '', states, modes, options?.format);
    },

    json(options?: GlazeJsonOptions): Record<string, Record<string, string>> {
      const resolved = resolveAllColors(hue, saturation, colorDefs);
      const modes = resolveModes(options?.modes);
      return buildJsonMap(resolved, modes, options?.format);
    },

    css(options?: GlazeCssOptions): GlazeCssResult {
      const resolved = resolveAllColors(hue, saturation, colorDefs);
      return buildCssMap(
        resolved,
        '',
        options?.suffix ?? '-color',
        options?.format ?? 'rgb',
      );
    },
  } as GlazeTheme;

  return theme;
}

// ============================================================================
// Palette
// ============================================================================

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

function createPalette(themes: PaletteInput) {
  return {
    tokens(
      options?: GlazeJsonOptions & GlazePaletteExportOptions,
    ): Record<string, Record<string, string>> {
      validatePrimaryTheme(options?.primary, themes);
      const modes = resolveModes(options?.modes);
      const allTokens: Record<string, Record<string, string>> = {};

      for (const [themeName, theme] of Object.entries(themes)) {
        const resolved = theme.resolve();
        const prefix = resolvePrefix(options, themeName, true);
        const tokens = buildFlatTokenMap(
          resolved,
          prefix,
          modes,
          options?.format,
        );

        for (const variant of Object.keys(tokens)) {
          if (!allTokens[variant]) {
            allTokens[variant] = {};
          }
          Object.assign(allTokens[variant], tokens[variant]);
        }

        if (themeName === options?.primary) {
          const unprefixed = buildFlatTokenMap(
            resolved,
            '',
            modes,
            options?.format,
          );
          for (const variant of Object.keys(unprefixed)) {
            Object.assign(allTokens[variant]!, unprefixed[variant]);
          }
        }
      }

      return allTokens;
    },

    tasty(
      options?: GlazeTokenOptions & { primary?: string },
    ): Record<string, Record<string, string>> {
      validatePrimaryTheme(options?.primary, themes);
      const states = {
        dark: options?.states?.dark ?? globalConfig.states.dark,
        highContrast:
          options?.states?.highContrast ?? globalConfig.states.highContrast,
      };
      const modes = resolveModes(options?.modes);

      const allTokens: Record<string, Record<string, string>> = {};

      for (const [themeName, theme] of Object.entries(themes)) {
        const resolved = theme.resolve();
        const prefix = resolvePrefix(options, themeName, true);
        const tokens = buildTokenMap(
          resolved,
          prefix,
          states,
          modes,
          options?.format,
        );
        Object.assign(allTokens, tokens);

        if (themeName === options?.primary) {
          const unprefixed = buildTokenMap(
            resolved,
            '',
            states,
            modes,
            options?.format,
          );
          Object.assign(allTokens, unprefixed);
        }
      }

      return allTokens;
    },

    json(
      options?: GlazeJsonOptions & {
        prefix?: boolean | Record<string, string>;
      },
    ): Record<string, Record<string, Record<string, string>>> {
      const modes = resolveModes(options?.modes);

      const result: Record<string, Record<string, Record<string, string>>> = {};

      for (const [themeName, theme] of Object.entries(themes)) {
        const resolved = theme.resolve();
        result[themeName] = buildJsonMap(resolved, modes, options?.format);
      }

      return result;
    },

    css(options?: GlazeCssOptions & GlazePaletteExportOptions): GlazeCssResult {
      validatePrimaryTheme(options?.primary, themes);
      const suffix = options?.suffix ?? '-color';
      const format = options?.format ?? 'rgb';

      const allLines: Record<keyof GlazeCssResult, string[]> = {
        light: [],
        dark: [],
        lightContrast: [],
        darkContrast: [],
      };

      for (const [themeName, theme] of Object.entries(themes)) {
        const resolved = theme.resolve();
        const prefix = resolvePrefix(options, themeName, true);

        const css = buildCssMap(resolved, prefix, suffix, format);

        for (const key of [
          'light',
          'dark',
          'lightContrast',
          'darkContrast',
        ] as const) {
          if (css[key]) {
            allLines[key].push(css[key]);
          }
        }

        if (themeName === options?.primary) {
          const unprefixed = buildCssMap(resolved, '', suffix, format);
          for (const key of [
            'light',
            'dark',
            'lightContrast',
            'darkContrast',
          ] as const) {
            if (unprefixed[key]) {
              allLines[key].push(unprefixed[key]);
            }
          }
        }
      }

      return {
        light: allLines.light.join('\n'),
        dark: allLines.dark.join('\n'),
        lightContrast: allLines.lightContrast.join('\n'),
        darkContrast: allLines.darkContrast.join('\n'),
      };
    },
  };
}

// ============================================================================
// Standalone color token
// ============================================================================

function createColorToken(input: GlazeColorInput): GlazeColorToken {
  const colorDef: RegularColorDef = {
    lightness: input.lightness,
    saturation: input.saturationFactor,
    mode: input.mode,
  };

  const defs: ColorMap = { __color__: colorDef };

  return {
    resolve(): ResolvedColor {
      const resolved = resolveAllColors(input.hue, input.saturation, defs);
      return resolved.get('__color__')!;
    },

    token(options?: GlazeTokenOptions): Record<string, string> {
      const resolved = resolveAllColors(input.hue, input.saturation, defs);
      const states = {
        dark: options?.states?.dark ?? globalConfig.states.dark,
        highContrast:
          options?.states?.highContrast ?? globalConfig.states.highContrast,
      };
      const modes = resolveModes(options?.modes);
      const tokenMap = buildTokenMap(
        resolved,
        '',
        states,
        modes,
        options?.format,
      );
      return tokenMap['#__color__'];
    },

    tasty(options?: GlazeTokenOptions): Record<string, string> {
      const resolved = resolveAllColors(input.hue, input.saturation, defs);
      const states = {
        dark: options?.states?.dark ?? globalConfig.states.dark,
        highContrast:
          options?.states?.highContrast ?? globalConfig.states.highContrast,
      };
      const modes = resolveModes(options?.modes);
      const tokenMap = buildTokenMap(
        resolved,
        '',
        states,
        modes,
        options?.format,
      );
      return tokenMap['#__color__'];
    },

    json(options?: GlazeJsonOptions): Record<string, string> {
      const resolved = resolveAllColors(input.hue, input.saturation, defs);
      const modes = resolveModes(options?.modes);
      const jsonMap = buildJsonMap(resolved, modes, options?.format);
      return jsonMap['__color__'];
    },
  };
}

// ============================================================================
// Public API: glaze()
// ============================================================================

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

/**
 * Configure global glaze settings.
 */
glaze.configure = function configure(config: GlazeConfig): void {
  globalConfig = {
    lightLightness: config.lightLightness ?? globalConfig.lightLightness,
    darkLightness: config.darkLightness ?? globalConfig.darkLightness,
    darkDesaturation: config.darkDesaturation ?? globalConfig.darkDesaturation,
    states: {
      dark: config.states?.dark ?? globalConfig.states.dark,
      highContrast:
        config.states?.highContrast ?? globalConfig.states.highContrast,
    },
    modes: {
      dark: config.modes?.dark ?? globalConfig.modes.dark,
      highContrast:
        config.modes?.highContrast ?? globalConfig.modes.highContrast,
    },
    shadowTuning: config.shadowTuning ?? globalConfig.shadowTuning,
  };
};

/**
 * Compose multiple themes into a palette.
 */
glaze.palette = function palette(themes: PaletteInput) {
  return createPalette(themes);
};

/**
 * Create a theme from a serialized export.
 */
glaze.from = function from(data: GlazeThemeExport): GlazeTheme {
  return createTheme(data.hue, data.saturation, data.colors);
};

/**
 * Create a standalone single-color token.
 */
glaze.color = function color(input: GlazeColorInput): GlazeColorToken {
  return createColorToken(input);
};

/**
 * Compute a shadow color from a bg/fg pair and intensity.
 */
glaze.shadow = function shadow(input: GlazeShadowInput): ResolvedColorVariant {
  const bg = parseOkhslInput(input.bg);
  const fg = input.fg ? parseOkhslInput(input.fg) : undefined;
  const tuning = resolveShadowTuning(input.tuning);
  return computeShadow(
    { ...bg, alpha: 1 },
    fg ? { ...fg, alpha: 1 } : undefined,
    input.intensity,
    tuning,
  );
};

/**
 * Format a resolved color variant as a CSS string.
 */
glaze.format = function format(
  variant: ResolvedColorVariant,
  colorFormat?: GlazeColorFormat,
): string {
  return formatVariant(variant, colorFormat);
};

function parseOkhslInput(input: string | OkhslColor): OkhslColor {
  if (typeof input === 'string') {
    const rgb = parseHex(input);
    if (!rgb) throw new Error(`glaze: invalid hex color "${input}".`);
    const [h, s, l] = srgbToOkhsl(rgb);
    return { h, s, l };
  }
  return input;
}

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
 * Get the current global configuration (for testing/debugging).
 */
glaze.getConfig = function getConfig(): GlazeConfigResolved {
  return { ...globalConfig };
};

/**
 * Reset global configuration to defaults.
 */
glaze.resetConfig = function resetConfig(): void {
  globalConfig = {
    lightLightness: [10, 100],
    darkLightness: [15, 95],
    darkDesaturation: 0.1,
    states: {
      dark: '@dark',
      highContrast: '@high-contrast',
    },
    modes: {
      dark: true,
      highContrast: false,
    },
  };
};
