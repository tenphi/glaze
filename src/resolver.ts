/**
 * Color resolution engine.
 *
 * Runs the four-pass solver (light → light-HC → dark → dark-HC) that
 * turns a `ColorMap` into a fully resolved `ResolvedColor` per name.
 * Owns the per-scheme resolve helpers for regular, shadow, and mix
 * color defs.
 *
 * Variants are stored in OKHST: `h` / `s` are OKHSL hue/saturation and
 * `t` is the canonical contrast-uniform tone (0–1, reference eps). The
 * resolver works in tone for regular colors and converts to/from OKHSL
 * lightness only at the mix/shadow and luminance edges.
 *
 * Every function receives a single `GlazeConfigResolved` so the full
 * per-instance config (including overrides) is available without
 * re-reading the global singleton mid-resolve.
 */

import {
  okhslToLinearSrgb,
  sRGBLinearToGamma,
  srgbToOkhsl,
} from './okhsl-color-math';
import {
  findToneForContrast,
  findValueForMixContrast,
  metricLuminance,
  resolveContrastForMode,
} from './contrast-solver';
import type { LinearRgb, ResolvedContrast } from './contrast-solver';
import {
  clamp,
  isAbsoluteTone,
  pairHC,
  pairNormal,
  parseToneValue,
  resolveEffectiveHue,
} from './hc-pair';
import {
  computeShadow,
  circularLerp,
  isMixDef,
  isShadowDef,
  resolveShadowTuning,
} from './shadow';
import {
  fromTone,
  mapSaturationDark,
  mapToneForScheme,
  okhslToOkhst,
  schemeToneRange,
  toTone,
  variantToOkhsl,
} from './okhst';
import { topoSort, validateColorDefs } from './validation';
import { warnContrastUnmet, warnContrastDrift } from './warnings';
import type {
  AdaptationMode,
  ColorDef,
  ColorMap,
  ContrastSpec,
  GlazeConfigResolved,
  HCPair,
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
  /** Fully-merged effective config for this resolve pass. */
  config: GlazeConfigResolved;
}

type ResolvedField = 'light' | 'dark' | 'lightContrast' | 'darkContrast';

/** An OKHSL-lightness-shaped variant used at the mix/shadow edge. */
interface OkhslVariant {
  h: number;
  s: number;
  l: number;
  alpha: number;
}

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

/** Edge adapter: resolved variant (`t`) → OKHSL-lightness variant. */
function toOkhslVariant(v: ResolvedColorVariant): OkhslVariant {
  const c = variantToOkhsl(v);
  return { h: c.h, s: c.s, l: c.l, alpha: v.alpha };
}

/** Edge adapter: OKHSL-lightness variant → resolved variant (`t`). */
function toToneVariant(v: OkhslVariant): ResolvedColorVariant {
  const c = okhslToOkhst({ h: v.h, s: v.s, l: v.l });
  return { h: c.h, s: c.s, t: c.t, alpha: v.alpha };
}

function resolveContrastSpec(
  spec: HCPair<ContrastSpec>,
  isHighContrast: boolean,
): ResolvedContrast {
  const outer = isHighContrast ? pairHC(spec) : pairNormal(spec);
  return resolveContrastForMode(outer, isHighContrast);
}

/**
 * Apply the relative-tone delta against a base, honoring `flip`.
 *
 * When `flip` is on and `base + delta` falls outside `[0, 100]`, mirror the
 * delta to the other side of the base (so an offset that would clamp instead
 * reflects back into range). When off, the caller clamps as usual.
 */
function applyToneFlip(delta: number, baseTone: number, flip: boolean): number {
  if (!flip) return delta;
  const target = baseTone + delta;
  if (target >= 0 && target <= 100) return delta;
  return -delta;
}

function resolveRootColor(
  def: RegularColorDef,
  isHighContrast: boolean,
): { authorTone: number; satFactor: number } {
  const rawT = def.tone!;
  const rawValue = isHighContrast ? pairHC(rawT) : pairNormal(rawT);
  // Root tone is absolute or extreme ('max' = 100, 'min' = 0); both flow
  // through mapToneForScheme (and invert in dark under mode 'auto').
  const parsed = parseToneValue(rawValue);
  const authorTone = clamp(parsed.value, 0, 100);
  const satFactor = clamp(def.saturation ?? 1, 0, 1);
  return { authorTone, satFactor };
}

function resolveDependentColor(
  name: string,
  def: RegularColorDef,
  ctx: ResolveContext,
  isHighContrast: boolean,
  isDark: boolean,
  effectiveHue: number,
): { tone: number; satFactor: number } {
  const baseName = def.base!;
  const baseResolved = ctx.resolved.get(baseName);
  if (!baseResolved) {
    throw new Error(
      `glaze: base "${baseName}" not yet resolved for "${name}".`,
    );
  }

  const mode = def.mode ?? 'auto';
  const satFactor = clamp(def.saturation ?? 1, 0, 1);
  const flip = def.flip ?? ctx.config.autoFlip;

  const baseVariant = getSchemeVariant(baseResolved, isDark, isHighContrast);
  const baseTone = baseVariant.t * 100;

  let preferredTone: number;
  const rawTone = def.tone;

  if (rawTone === undefined) {
    preferredTone = baseTone;
  } else {
    const rawValue = isHighContrast ? pairHC(rawTone) : pairNormal(rawTone);
    const parsed = parseToneValue(rawValue);

    if (parsed.kind === 'relative') {
      if (isDark && mode === 'auto') {
        const baseLightVariant = getSchemeVariant(
          baseResolved,
          false,
          isHighContrast,
        );
        const baseLightTone = baseLightVariant.t * 100;
        const absoluteLightTone = clamp(
          baseLightTone + applyToneFlip(parsed.value, baseLightTone, flip),
          0,
          100,
        );
        // Invert + remap the base-anchored light tone into the dark window,
        // exactly like an absolute author tone under `mode: 'auto'`.
        preferredTone = mapToneForScheme(
          absoluteLightTone,
          'auto',
          true,
          isHighContrast,
          ctx.config,
        );
      } else {
        const delta = applyToneFlip(parsed.value, baseTone, flip);
        preferredTone = clamp(baseTone + delta, 0, 100);
      }
    } else {
      // Absolute or extreme ('max' = 100, 'min' = 0): map through the scheme.
      preferredTone = mapToneForScheme(
        parsed.value,
        mode,
        isDark,
        isHighContrast,
        ctx.config,
      );
    }
  }

  const rawContrast = def.contrast;
  if (rawContrast !== undefined) {
    const resolvedContrast = resolveContrastSpec(rawContrast, isHighContrast);

    const effectiveSat = isDark
      ? mapSaturationDark((satFactor * ctx.saturation) / 100, mode, ctx.config)
      : (satFactor * ctx.saturation) / 100;

    const baseOkhsl = toOkhslVariant(baseVariant);
    const baseLinearRgb = okhslToLinearSrgb(
      baseOkhsl.h,
      baseOkhsl.s,
      baseOkhsl.l,
      ctx.config.pastel,
    );

    const toneRange = schemeToneRange(isDark, mode, isHighContrast, ctx.config);

    let initialDirection: 'lighter' | 'darker' | undefined;
    if (preferredTone < baseTone) {
      initialDirection = 'darker';
    } else if (preferredTone > baseTone) {
      initialDirection = 'lighter';
    }

    const result = findToneForContrast({
      hue: effectiveHue,
      saturation: effectiveSat,
      preferredTone: clamp(preferredTone / 100, toneRange[0], toneRange[1]),
      baseLinearRgb,
      contrast: resolvedContrast,
      toneRange: [0, 1],
      initialDirection,
      flip,
      pastel: ctx.config.pastel,
    });

    if (!result.met) {
      warnContrastUnmet(
        name,
        isDark,
        isHighContrast,
        resolvedContrast,
        result.contrast,
      );
    }

    return { tone: result.tone * 100, satFactor };
  }

  return { tone: clamp(preferredTone, 0, 100), satFactor };
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
  const isRoot = isAbsoluteTone(regDef.tone) && !regDef.base;
  const effectiveHue = resolveEffectiveHue(ctx.hue, regDef.hue);

  let finalTone: number;
  let satFactor: number;

  if (isRoot) {
    const root = resolveRootColor(regDef, isHighContrast);
    finalTone = mapToneForScheme(
      root.authorTone,
      mode,
      isDark,
      isHighContrast,
      ctx.config,
    );
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
    finalTone = dep.tone;
    satFactor = dep.satFactor;
  }

  const baseSat = (satFactor * ctx.saturation) / 100;
  const finalSat = isDark
    ? mapSaturationDark(baseSat, mode, ctx.config)
    : baseSat;

  const toneFraction = clamp(finalTone / 100, 0, 1);

  return {
    h: effectiveHue,
    s: clamp(finalSat, 0, 1),
    t: toneFraction,
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
  const bgVariant = toOkhslVariant(
    getSchemeVariant(bgResolved, isDark, isHighContrast),
  );

  let fgVariant: OkhslVariant | undefined;
  if (def.fg) {
    const fgResolved = ctx.resolved.get(def.fg)!;
    fgVariant = toOkhslVariant(
      getSchemeVariant(fgResolved, isDark, isHighContrast),
    );
  }

  const intensity = isHighContrast
    ? pairHC(def.intensity)
    : pairNormal(def.intensity);

  const tuning = resolveShadowTuning(def.tuning, ctx.config.shadowTuning);
  return toToneVariant(computeShadow(bgVariant, fgVariant, intensity, tuning));
}

function okhslVariantToLinearRgb(v: OkhslVariant, pastel: boolean): LinearRgb {
  return okhslToLinearSrgb(v.h, v.s, v.l, pastel);
}

/**
 * Resolve hue for OKHSL mixing, handling achromatic colors.
 * When one color has no saturation, its hue is meaningless —
 * use the hue from the color that has saturation (matches CSS
 * color-mix "missing component" behavior).
 */
function mixHue(base: OkhslVariant, target: OkhslVariant, t: number): number {
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

function linearRgbToToneVariant(
  rgb: LinearRgb,
  pastel: boolean,
): ResolvedColorVariant {
  const gamma: [number, number, number] = [
    Math.max(0, Math.min(1, sRGBLinearToGamma(rgb[0]))),
    Math.max(0, Math.min(1, sRGBLinearToGamma(rgb[1]))),
    Math.max(0, Math.min(1, sRGBLinearToGamma(rgb[2]))),
  ];
  const [h, s, l] = srgbToOkhsl(gamma, pastel);
  return toToneVariant({ h, s, l, alpha: 1 });
}

function resolveMixForScheme(
  def: MixColorDef,
  ctx: ResolveContext,
  isDark: boolean,
  isHighContrast: boolean,
): ResolvedColorVariant {
  const baseResolved = ctx.resolved.get(def.base)!;
  const targetResolved = ctx.resolved.get(def.target)!;
  const baseVariant = toOkhslVariant(
    getSchemeVariant(baseResolved, isDark, isHighContrast),
  );
  const targetVariant = toOkhslVariant(
    getSchemeVariant(targetResolved, isDark, isHighContrast),
  );

  const rawValue = isHighContrast ? pairHC(def.value) : pairNormal(def.value);
  let t = clamp(rawValue, 0, 100) / 100;

  const blend = def.blend ?? 'opaque';
  const space = def.space ?? 'okhsl';
  const baseLinear = okhslVariantToLinearRgb(baseVariant, ctx.config.pastel);
  const targetLinear = okhslVariantToLinearRgb(targetVariant, ctx.config.pastel);

  if (def.contrast !== undefined) {
    const resolvedContrast = resolveContrastSpec(def.contrast, isHighContrast);
    const metric = resolvedContrast.metric;

    let luminanceAt: (v: number) => number;

    if (blend === 'transparent' || space === 'srgb') {
      luminanceAt = (v: number) =>
        metricLuminance(metric, linearSrgbLerp(baseLinear, targetLinear, v));
    } else {
      luminanceAt = (v: number) => {
        const h = mixHue(baseVariant, targetVariant, v);
        const s = baseVariant.s + (targetVariant.s - baseVariant.s) * v;
        const l = baseVariant.l + (targetVariant.l - baseVariant.l) * v;
        return metricLuminance(metric, okhslToLinearSrgb(h, s, l, ctx.config.pastel));
      };
    }

    const result = findValueForMixContrast({
      preferredValue: t,
      baseLinearRgb: baseLinear,
      targetLinearRgb: targetLinear,
      contrast: resolvedContrast,
      luminanceAtValue: luminanceAt,
      flip: ctx.config.autoFlip,
    });
    t = result.value;
  }

  if (blend === 'transparent') {
    return toToneVariant({
      h: targetVariant.h,
      s: targetVariant.s,
      l: targetVariant.l,
      alpha: clamp(t, 0, 1),
    });
  }

  if (space === 'srgb') {
    const mixed = linearSrgbLerp(baseLinear, targetLinear, t);
    return linearRgbToToneVariant(mixed, ctx.config.pastel);
  }

  return toToneVariant({
    h: mixHue(baseVariant, targetVariant, t),
    s: clamp(baseVariant.s + (targetVariant.s - baseVariant.s) * t, 0, 1),
    l: clamp(baseVariant.l + (targetVariant.l - baseVariant.l) * t, 0, 1),
    alpha: 1,
  });
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

/**
 * After the four passes, surface chromatic contrast drift (§10): a color
 * resolved with a `base` + `contrast` may land slightly under the contrast
 * its tone implies because chromatic luminance drifts from the gray tone.
 */
function verifyContrastDrift(
  order: string[],
  defs: ColorMap,
  result: Map<string, ResolvedColor>,
): void {
  for (const name of order) {
    const def = defs[name];
    if (isShadowDef(def) || isMixDef(def)) continue;
    const regDef = def as RegularColorDef;
    if (regDef.contrast === undefined || !regDef.base) continue;
    const color = result.get(name);
    const base = result.get(regDef.base);
    if (!color || !base) continue;

    const schemes: {
      isDark: boolean;
      isHighContrast: boolean;
      field: ResolvedField;
    }[] = [
      { isDark: false, isHighContrast: false, field: 'light' },
      { isDark: false, isHighContrast: true, field: 'lightContrast' },
      { isDark: true, isHighContrast: false, field: 'dark' },
      { isDark: true, isHighContrast: true, field: 'darkContrast' },
    ];

    for (const s of schemes) {
      const spec = resolveContrastSpec(regDef.contrast, s.isHighContrast);
      const cVariant = color[s.field];
      const bVariant = base[s.field];
      const cOkhsl = toOkhslVariant(cVariant);
      const bOkhsl = toOkhslVariant(bVariant);
      // Measure in the spec's metric basis so the APCA warning compares APCA
      // luminances, not WCAG ones.
      const yC = metricLuminance(
        spec.metric,
        okhslToLinearSrgb(cOkhsl.h, cOkhsl.s, cOkhsl.l),
      );
      const yB = metricLuminance(
        spec.metric,
        okhslToLinearSrgb(bOkhsl.h, bOkhsl.s, bOkhsl.l),
      );
      warnContrastDrift(name, s.isDark, s.isHighContrast, spec, yC, yB);
    }
  }
}

export function resolveAllColors(
  hue: number,
  saturation: number,
  defs: ColorMap,
  config: GlazeConfigResolved,
  externalBases?: Map<string, ResolvedColor>,
): Map<string, ResolvedColor> {
  validateColorDefs(defs, externalBases);
  const order = topoSort(defs);

  const ctx: ResolveContext = {
    hue,
    saturation,
    defs,
    resolved: new Map(),
    config,
  };

  // Pre-seed externally-resolved bases. The per-pass loops iterate only
  // `defs` keys (via `order`), so external entries persist across all
  // four passes and are read via `getSchemeVariant` per scheme.
  if (externalBases) {
    for (const [name, color] of externalBases) {
      ctx.resolved.set(name, color);
    }
  }

  // Pass 1: Light normal.
  const lightMap = runPass(order, defs, ctx, false, false, 'light');

  // Pass 2: Light high-contrast.
  seedField(order, ctx, 'lightContrast', lightMap);
  const lightHCMap = runPass(order, defs, ctx, false, true, 'lightContrast');

  // Pass 3: Dark normal.
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

  verifyContrastDrift(order, defs, result);

  return result;
}

// Re-export for callers that previously imported tone helpers from here.
export { fromTone, toTone };
