/**
 * Color resolution engine.
 *
 * Runs the four-pass solver (light → light-HC → dark → dark-HC) that
 * turns a `ColorMap` into a fully resolved `ResolvedColor` per name.
 * Owns the per-scheme resolve helpers for regular, shadow, and mix
 * color defs.
 */

import {
  okhslToLinearSrgb,
  sRGBLinearToGamma,
  gamutClampedLuminance,
  srgbToOkhsl,
} from './okhsl-color-math';
import {
  findLightnessForContrast,
  findValueForMixContrast,
} from './contrast-solver';
import type { LinearRgb } from './contrast-solver';
import {
  clamp,
  isAbsoluteLightness,
  pairHC,
  pairNormal,
  parseRelativeOrAbsolute,
  resolveEffectiveHue,
} from './hc-pair';
import { getConfig } from './config';
import {
  computeShadow,
  circularLerp,
  isMixDef,
  isShadowDef,
  resolveShadowTuning,
} from './shadow';
import {
  lightMappedToDark,
  mapLightnessDark,
  mapLightnessLight,
  mapSaturationDark,
  schemeLightnessRange,
} from './scheme-mapping';
import { topoSort, validateColorDefs } from './validation';
import { warnContrastUnmet } from './warnings';
import type {
  AdaptationMode,
  ColorDef,
  ColorMap,
  GlazeColorScaling,
  MixColorDef,
  RegularColorDef,
  ResolvedColor,
  ResolvedColorVariant,
  ShadowColorDef,
} from './types';

export interface ResolveContext {
  hue: number;
  saturation: number;
  defs: ColorMap;
  resolved: Map<string, ResolvedColor>;
  /**
   * Optional per-resolve scaling overrides for the lightness windows.
   * Used by `glaze.color()` to preserve light input by default while
   * still adapting dark to `globalConfig.darkLightness`.
   */
  scaling?: GlazeColorScaling;
  /**
   * Whether to auto-flip lightness direction when contrast can't be met.
   * Read from global config at resolve time; overridable per-call via
   * the context for standalone tokens that snapshot it at creation.
   */
  autoFlip?: boolean;
}

type ResolvedField = 'light' | 'dark' | 'lightContrast' | 'darkContrast';

export function getSchemeVariant(
  color: ResolvedColor,
  isDark: boolean,
  isHighContrast: boolean,
): ResolvedColorVariant {
  if (isDark && isHighContrast) return color.darkContrast;
  if (isDark) return color.dark;
  if (isHighContrast) return color.lightContrast;
  return color.light;
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
      const delta = parsed.value;
      if (isDark && mode === 'auto') {
        const baseLightVariant = getSchemeVariant(
          baseResolved,
          false,
          isHighContrast,
        );
        const absoluteLightL = clamp(baseLightVariant.l * 100 + delta, 0, 100);
        preferredL = lightMappedToDark(
          absoluteLightL,
          isHighContrast,
          ctx.scaling,
        );
      } else {
        preferredL = clamp(baseL + delta, 0, 100);
      }
    } else {
      if (isDark) {
        preferredL = mapLightnessDark(
          parsed.value,
          mode,
          isHighContrast,
          ctx.scaling,
        );
      } else {
        preferredL = mapLightnessLight(
          parsed.value,
          mode,
          isHighContrast,
          ctx.scaling,
        );
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

    const windowRange = schemeLightnessRange(
      isDark,
      mode,
      isHighContrast,
      ctx.scaling,
    );

    const autoFlip = ctx.autoFlip ?? getConfig().autoFlip;

    const result = findLightnessForContrast({
      hue: effectiveHue,
      saturation: effectiveSat,
      preferredLightness: clamp(
        preferredL / 100,
        windowRange[0],
        windowRange[1],
      ),
      baseLinearRgb,
      contrast: minCr,
      lightnessRange: [0, 1],
      flip: autoFlip,
    });

    if (!result.met) {
      warnContrastUnmet(name, isDark, isHighContrast, minCr, result.contrast);
    }

    return { l: result.lightness * 100, satFactor };
  }

  return { l: clamp(preferredL, 0, 100), satFactor };
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
    finalL = mapLightnessDark(lightL, mode, isHighContrast, ctx.scaling);
    finalSat = mapSaturationDark((satFactor * ctx.saturation) / 100, mode);
  } else if (isDark && !isRoot) {
    finalL = lightL;
    finalSat = mapSaturationDark((satFactor * ctx.saturation) / 100, mode);
  } else if (isRoot) {
    finalL = mapLightnessLight(lightL, mode, isHighContrast, ctx.scaling);
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

    const autoFlip = ctx.autoFlip ?? getConfig().autoFlip;

    const result = findValueForMixContrast({
      preferredValue: t,
      baseLinearRgb: baseLinear,
      targetLinearRgb: targetLinear,
      contrast: minCr,
      luminanceAtValue: luminanceAt,
      flip: autoFlip,
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

function defMode(def: ColorDef): AdaptationMode | undefined {
  if (isShadowDef(def) || isMixDef(def)) return undefined;
  return (def as RegularColorDef).mode ?? 'auto';
}

/**
 * Run a single resolve pass over all local names. Pass 1 lazily creates
 * each `ResolvedColor` (all four slots seeded with the just-resolved
 * variant) the first time it sees a name; later passes update the
 * `target` slot on the existing record.
 */
function runPass(
  order: string[],
  defs: ColorMap,
  ctx: ResolveContext,
  isDark: boolean,
  isHighContrast: boolean,
  target: ResolvedField,
): Map<string, ResolvedColorVariant> {
  const out = new Map<string, ResolvedColorVariant>();
  for (const name of order) {
    const variant = resolveColorForScheme(
      name,
      defs[name],
      ctx,
      isDark,
      isHighContrast,
    );
    out.set(name, variant);
    const existing = ctx.resolved.get(name);
    if (existing) {
      ctx.resolved.set(name, { ...existing, [target]: variant });
    } else {
      ctx.resolved.set(name, {
        name,
        light: variant,
        dark: variant,
        lightContrast: variant,
        darkContrast: variant,
        mode: defMode(defs[name]),
      });
    }
  }
  return out;
}

/**
 * Re-seed a single variant slot with a previously-resolved map so the
 * upcoming pass reads sensible fallbacks via `getSchemeVariant`.
 */
function seedField(
  order: string[],
  ctx: ResolveContext,
  field: ResolvedField,
  source: Map<string, ResolvedColorVariant>,
): void {
  for (const name of order) {
    const existing = ctx.resolved.get(name)!;
    ctx.resolved.set(name, { ...existing, [field]: source.get(name)! });
  }
}

export function resolveAllColors(
  hue: number,
  saturation: number,
  defs: ColorMap,
  scaling?: GlazeColorScaling,
  externalBases?: Map<string, ResolvedColor>,
  overrideAutoFlip?: boolean,
): Map<string, ResolvedColor> {
  validateColorDefs(defs, externalBases);
  const order = topoSort(defs);

  const cfg = getConfig();
  const ctx: ResolveContext = {
    hue,
    saturation,
    defs,
    resolved: new Map(),
    scaling,
    autoFlip: overrideAutoFlip ?? cfg.autoFlip,
  };

  // Pre-seed externally-resolved bases. The per-pass loops iterate only
  // `defs` keys (via `order`), so external entries persist across all
  // four passes and are read via `getSchemeVariant` per scheme.
  if (externalBases) {
    for (const [name, color] of externalBases) {
      ctx.resolved.set(name, color);
    }
  }

  // Pass 1: Light normal. `runPass` initializes each local ResolvedColor
  // with all four slots seeded with the just-computed light variant.
  const lightMap = runPass(order, defs, ctx, false, false, 'light');

  // Pass 2: Light high-contrast.
  seedField(order, ctx, 'lightContrast', lightMap);
  const lightHCMap = runPass(order, defs, ctx, false, true, 'lightContrast');

  // Pass 3: Dark normal. Seed dark/darkContrast from the light passes
  // so HC-dependent and base lookups have sensible starting points.
  seedField(order, ctx, 'dark', lightMap);
  seedField(order, ctx, 'darkContrast', lightHCMap);
  const darkMap = runPass(order, defs, ctx, true, false, 'dark');

  // Pass 4: Dark high-contrast.
  seedField(order, ctx, 'darkContrast', darkMap);
  const darkHCMap = runPass(order, defs, ctx, true, true, 'darkContrast');

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
