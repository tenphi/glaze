/**
 * Shadow color computation.
 *
 * Owns the shadow / mix def predicates, default tuning constants, the
 * tuning merge, and the actual `computeShadow` math (hue blend,
 * saturation cap, lightness clamp, alpha curve). The resolver consumes
 * this module per scheme variant.
 */

import { clamp } from './hc-pair';
import type {
  ColorDef,
  MixColorDef,
  ShadowColorDef,
  ShadowTuning,
} from './types';

/**
 * OKHSL-lightness variant shape used by the shadow math. The resolver
 * converts the OKHST-stored variants to this shape at the shadow edge.
 */
export interface OkhslShadowVariant {
  h: number;
  s: number;
  l: number;
  alpha: number;
}

export function isShadowDef(def: ColorDef): def is ShadowColorDef {
  return (def as ShadowColorDef).type === 'shadow';
}

export function isMixDef(def: ColorDef): def is MixColorDef {
  return (def as MixColorDef).type === 'mix';
}

export const DEFAULT_SHADOW_TUNING: Required<ShadowTuning> = {
  saturationFactor: 0.18,
  maxSaturation: 0.25,
  lightnessFactor: 0.25,
  lightnessBounds: [0.05, 0.2],
  minGapTarget: 0.05,
  alphaMax: 1.0,
  bgHueBlend: 0.2,
};

export function resolveShadowTuning(
  perColor?: ShadowTuning,
  globalTuning?: ShadowTuning,
): Required<ShadowTuning> {
  return {
    ...DEFAULT_SHADOW_TUNING,
    ...globalTuning,
    ...perColor,
    lightnessBounds:
      perColor?.lightnessBounds ??
      globalTuning?.lightnessBounds ??
      DEFAULT_SHADOW_TUNING.lightnessBounds,
  };
}

export function circularLerp(a: number, b: number, t: number): number {
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

export function computeShadow(
  bg: OkhslShadowVariant,
  fg: OkhslShadowVariant | undefined,
  intensity: number,
  tuning: Required<ShadowTuning>,
): OkhslShadowVariant {
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
