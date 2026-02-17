/**
 * OKHSL Contrast Solver
 *
 * Finds the closest OKHSL lightness that satisfies a WCAG 2 contrast target
 * against a base color. Used by glaze when resolving dependent colors
 * with `contrast`.
 */

import {
  okhslToLinearSrgb,
  relativeLuminanceFromLinearRgb,
  contrastRatioFromLuminance,
} from './okhsl-color-math';

// ============================================================================
// Types
// ============================================================================

export type ContrastPreset = 'AA' | 'AAA' | 'AA-large' | 'AAA-large';
export type MinContrast = number | ContrastPreset;

export interface FindLightnessForContrastOptions {
  /** Hue of the candidate color (0–360). */
  hue: number;
  /** Saturation of the candidate color (0–1). */
  saturation: number;
  /** Preferred lightness of the candidate (0–1). */
  preferredLightness: number;

  /** Base/reference color as linear sRGB (channels may be outside 0–1 before clamp). */
  baseLinearRgb: [number, number, number];

  /** WCAG contrast ratio target floor. */
  contrast: MinContrast;

  /** Search bounds for lightness. Default: [0, 1]. */
  lightnessRange?: [number, number];
  /** Convergence threshold. Default: 1e-4. */
  epsilon?: number;
  /** Maximum binary-search iterations per branch. Default: 14. */
  maxIterations?: number;
}

export interface FindLightnessForContrastResult {
  /** Chosen lightness in 0–1. */
  lightness: number;
  /** Achieved WCAG contrast ratio. */
  contrast: number;
  /** Whether the target was reached. */
  met: boolean;
  /** Which branch was selected. */
  branch: 'lighter' | 'darker' | 'preferred';
}

// ============================================================================
// Preset mapping
// ============================================================================

const CONTRAST_PRESETS: Record<ContrastPreset, number> = {
  AA: 4.5,
  AAA: 7,
  'AA-large': 3,
  'AAA-large': 4.5,
};

export function resolveMinContrast(value: MinContrast): number {
  if (typeof value === 'number') {
    return Math.max(1, value);
  }
  return CONTRAST_PRESETS[value];
}

// ============================================================================
// LRU luminance cache
// ============================================================================

const CACHE_SIZE = 512;
const luminanceCache = new Map<string, number>();
const cacheOrder: string[] = [];

function cachedLuminance(h: number, s: number, l: number): number {
  const lRounded = Math.round(l * 10000) / 10000;
  const key = `${h}|${s}|${lRounded}`;

  const cached = luminanceCache.get(key);
  if (cached !== undefined) return cached;

  const linearRgb = okhslToLinearSrgb(h, s, lRounded);
  const y = relativeLuminanceFromLinearRgb(linearRgb);

  if (luminanceCache.size >= CACHE_SIZE) {
    const evict = cacheOrder.shift()!;
    luminanceCache.delete(evict);
  }
  luminanceCache.set(key, y);
  cacheOrder.push(key);

  return y;
}

// ============================================================================
// Solver
// ============================================================================

interface BranchResult {
  lightness: number;
  contrast: number;
  met: boolean;
}

/**
 * Binary search one branch [lo, hi] for the nearest passing lightness to `preferred`.
 */
function searchBranch(
  h: number,
  s: number,
  lo: number,
  hi: number,
  yBase: number,
  target: number,
  epsilon: number,
  maxIter: number,
  preferred: number,
): BranchResult {
  const yLo = cachedLuminance(h, s, lo);
  const yHi = cachedLuminance(h, s, hi);
  const crLo = contrastRatioFromLuminance(yLo, yBase);
  const crHi = contrastRatioFromLuminance(yHi, yBase);

  if (crLo < target && crHi < target) {
    if (crLo >= crHi) {
      return { lightness: lo, contrast: crLo, met: false };
    }
    return { lightness: hi, contrast: crHi, met: false };
  }

  let low = lo;
  let high = hi;

  for (let i = 0; i < maxIter; i++) {
    if (high - low < epsilon) break;

    const mid = (low + high) / 2;
    const yMid = cachedLuminance(h, s, mid);
    const crMid = contrastRatioFromLuminance(yMid, yBase);

    if (crMid >= target) {
      if (mid < preferred) {
        low = mid;
      } else {
        high = mid;
      }
    } else {
      if (mid < preferred) {
        high = mid;
      } else {
        low = mid;
      }
    }
  }

  const yLow = cachedLuminance(h, s, low);
  const yHigh = cachedLuminance(h, s, high);
  const crLow = contrastRatioFromLuminance(yLow, yBase);
  const crHigh = contrastRatioFromLuminance(yHigh, yBase);

  const lowPasses = crLow >= target;
  const highPasses = crHigh >= target;

  if (lowPasses && highPasses) {
    if (Math.abs(low - preferred) <= Math.abs(high - preferred)) {
      return { lightness: low, contrast: crLow, met: true };
    }
    return { lightness: high, contrast: crHigh, met: true };
  }
  if (lowPasses) return { lightness: low, contrast: crLow, met: true };
  if (highPasses) return { lightness: high, contrast: crHigh, met: true };

  return coarseScan(h, s, lo, hi, yBase, target, epsilon, maxIter);
}

/**
 * Fallback coarse scan when binary search is unstable near gamut edges.
 */
function coarseScan(
  h: number,
  s: number,
  lo: number,
  hi: number,
  yBase: number,
  target: number,
  epsilon: number,
  maxIter: number,
): BranchResult {
  const STEPS = 64;
  const step = (hi - lo) / STEPS;
  let bestL = lo;
  let bestCr = 0;
  let bestMet = false;

  for (let i = 0; i <= STEPS; i++) {
    const l = lo + step * i;
    const y = cachedLuminance(h, s, l);
    const cr = contrastRatioFromLuminance(y, yBase);

    if (cr >= target && !bestMet) {
      bestL = l;
      bestCr = cr;
      bestMet = true;
    } else if (cr >= target && bestMet) {
      bestL = l;
      bestCr = cr;
    } else if (!bestMet && cr > bestCr) {
      bestL = l;
      bestCr = cr;
    }
  }

  if (bestMet && bestL > lo + step) {
    let rLo = bestL - step;
    let rHi = bestL;
    for (let i = 0; i < maxIter; i++) {
      if (rHi - rLo < epsilon) break;
      const mid = (rLo + rHi) / 2;
      const y = cachedLuminance(h, s, mid);
      const cr = contrastRatioFromLuminance(y, yBase);
      if (cr >= target) {
        rHi = mid;
        bestL = mid;
        bestCr = cr;
      } else {
        rLo = mid;
      }
    }
  }

  return { lightness: bestL, contrast: bestCr, met: bestMet };
}

/**
 * Find the OKHSL lightness that satisfies a WCAG 2 contrast target
 * against a base color, staying as close to `preferredLightness` as possible.
 */
export function findLightnessForContrast(
  options: FindLightnessForContrastOptions,
): FindLightnessForContrastResult {
  const {
    hue,
    saturation,
    preferredLightness,
    baseLinearRgb,
    contrast: contrastInput,
    lightnessRange = [0, 1],
    epsilon = 1e-4,
    maxIterations = 14,
  } = options;

  const target = resolveMinContrast(contrastInput);
  const yBase = relativeLuminanceFromLinearRgb(baseLinearRgb);

  const yPref = cachedLuminance(hue, saturation, preferredLightness);
  const crPref = contrastRatioFromLuminance(yPref, yBase);

  if (crPref >= target) {
    return {
      lightness: preferredLightness,
      contrast: crPref,
      met: true,
      branch: 'preferred',
    };
  }

  const [minL, maxL] = lightnessRange;

  const darkerResult =
    preferredLightness > minL
      ? searchBranch(
          hue,
          saturation,
          minL,
          preferredLightness,
          yBase,
          target,
          epsilon,
          maxIterations,
          preferredLightness,
        )
      : null;

  const lighterResult =
    preferredLightness < maxL
      ? searchBranch(
          hue,
          saturation,
          preferredLightness,
          maxL,
          yBase,
          target,
          epsilon,
          maxIterations,
          preferredLightness,
        )
      : null;

  const darkerPasses = darkerResult?.met ?? false;
  const lighterPasses = lighterResult?.met ?? false;

  if (darkerPasses && lighterPasses) {
    const darkerDist = Math.abs(darkerResult!.lightness - preferredLightness);
    const lighterDist = Math.abs(lighterResult!.lightness - preferredLightness);
    if (darkerDist <= lighterDist) {
      return { ...darkerResult!, branch: 'darker' };
    }
    return { ...lighterResult!, branch: 'lighter' };
  }

  if (darkerPasses) {
    return { ...darkerResult!, branch: 'darker' };
  }

  if (lighterPasses) {
    return { ...lighterResult!, branch: 'lighter' };
  }

  const candidates: (BranchResult & { branch: 'darker' | 'lighter' })[] = [];
  if (darkerResult) candidates.push({ ...darkerResult, branch: 'darker' });
  if (lighterResult) candidates.push({ ...lighterResult, branch: 'lighter' });

  if (candidates.length === 0) {
    return {
      lightness: preferredLightness,
      contrast: crPref,
      met: false,
      branch: 'preferred',
    };
  }

  candidates.sort((a, b) => b.contrast - a.contrast);
  return candidates[0];
}
