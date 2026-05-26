/**
 * OKHSL Contrast Solver
 *
 * Finds the closest OKHSL lightness that satisfies a WCAG 2 contrast target
 * against a base color. Used by glaze when resolving dependent colors
 * with `contrast`.
 */

import {
  okhslToLinearSrgb,
  contrastRatioFromLuminance,
  gamutClampedLuminance,
} from './okhsl-color-math';

export type LinearRgb = [number, number, number];

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
  /**
   * Auto-flip lightness direction when contrast can't be met.
   *
   * When `true`, the solver searches the initial direction first
   * (the side with higher contrast against the base). If that side
   * doesn't reach the target, it tries the opposite direction and
   * uses it when it passes. If neither side passes, it returns the
   * extreme lightness of the initial direction.
   *
   * When `false`, only the initial direction is considered. If it
   * doesn't reach the target, the result is pinned to the initial
   * direction's extreme — never to the original preferred lightness.
   *
   * Default: false.
   */
  flip?: boolean;
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
  /**
   * Whether the result was auto-flipped to the opposite direction.
   * Only set when the initial direction failed and the opposite
   * direction satisfied the target.
   */
  flipped?: boolean;
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
  const y = gamutClampedLuminance(linearRgb);

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
  // Overshoot absorbs rounding in the OKHSL pipeline and OKLCH formatting
  const searchTarget = target * 1.01;
  const yBase = gamutClampedLuminance(baseLinearRgb);

  const yPref = cachedLuminance(hue, saturation, preferredLightness);
  const crPref = contrastRatioFromLuminance(yPref, yBase);

  if (crPref >= searchTarget) {
    return {
      lightness: preferredLightness,
      contrast: crPref,
      met: true,
      branch: 'preferred',
    };
  }

  const [minL, maxL] = lightnessRange;

  // Initial direction: the side whose extreme has higher contrast
  // against the base — that's the "natural" direction the solver explores
  // first to meet the target. The opposite direction is only considered
  // when `flip` is enabled; the fallback extreme also lives on the
  // initial side.
  const canDarker = preferredLightness > minL;
  const canLighter = preferredLightness < maxL;
  let initialIsDarker: boolean;
  if (canDarker && !canLighter) {
    initialIsDarker = true;
  } else if (!canDarker && canLighter) {
    initialIsDarker = false;
  } else if (!canDarker && !canLighter) {
    // Degenerate range — preferred == minL == maxL. Nothing to search.
    return {
      lightness: preferredLightness,
      contrast: crPref,
      met: false,
      branch: 'preferred',
    };
  } else {
    const yMinExt = cachedLuminance(hue, saturation, minL);
    const yMaxExt = cachedLuminance(hue, saturation, maxL);
    const crMinExt = contrastRatioFromLuminance(yMinExt, yBase);
    const crMaxExt = contrastRatioFromLuminance(yMaxExt, yBase);
    initialIsDarker = crMinExt >= crMaxExt;
  }

  const searchInitial = () =>
    initialIsDarker
      ? searchBranch(
          hue,
          saturation,
          minL,
          preferredLightness,
          yBase,
          searchTarget,
          epsilon,
          maxIterations,
          preferredLightness,
        )
      : searchBranch(
          hue,
          saturation,
          preferredLightness,
          maxL,
          yBase,
          searchTarget,
          epsilon,
          maxIterations,
          preferredLightness,
        );

  const searchOpposite = () =>
    initialIsDarker
      ? searchBranch(
          hue,
          saturation,
          preferredLightness,
          maxL,
          yBase,
          searchTarget,
          epsilon,
          maxIterations,
          preferredLightness,
        )
      : searchBranch(
          hue,
          saturation,
          minL,
          preferredLightness,
          yBase,
          searchTarget,
          epsilon,
          maxIterations,
          preferredLightness,
        );

  const initialBranchName: 'darker' | 'lighter' = initialIsDarker
    ? 'darker'
    : 'lighter';
  const oppositeBranchName: 'darker' | 'lighter' = initialIsDarker
    ? 'lighter'
    : 'darker';

  const initialResult = searchInitial();
  initialResult.met = initialResult.contrast >= target;

  // Initial direction passes — use it (closest passing point in that
  // direction). When auto-flip is enabled we also consider the opposite
  // direction in case it produces a result closer to `preferredLightness`.
  if (initialResult.met && !options.flip) {
    return { ...initialResult, branch: initialBranchName };
  }

  if (options.flip) {
    const canOpposite = initialIsDarker ? canLighter : canDarker;
    const oppositeResult = canOpposite ? searchOpposite() : null;
    if (oppositeResult) oppositeResult.met = oppositeResult.contrast >= target;

    if (initialResult.met && oppositeResult?.met) {
      const initialDist = Math.abs(
        initialResult.lightness - preferredLightness,
      );
      const oppositeDist = Math.abs(
        oppositeResult.lightness - preferredLightness,
      );
      if (initialDist <= oppositeDist) {
        return { ...initialResult, branch: initialBranchName };
      }
      return {
        ...oppositeResult,
        branch: oppositeBranchName,
        flipped: true,
      };
    }

    if (initialResult.met) {
      return { ...initialResult, branch: initialBranchName };
    }

    if (oppositeResult?.met) {
      return {
        ...oppositeResult,
        branch: oppositeBranchName,
        flipped: true,
      };
    }
  }

  // Failure: pin to the initial direction's extreme.
  const extreme = initialIsDarker ? minL : maxL;
  const yExtreme = cachedLuminance(hue, saturation, extreme);
  const crExtreme = contrastRatioFromLuminance(yExtreme, yBase);
  return {
    lightness: extreme,
    contrast: crExtreme,
    met: false,
    branch: initialBranchName,
  };
}

// ============================================================================
// Mix contrast solver
// ============================================================================

export interface FindValueForMixContrastOptions {
  /** Preferred mix parameter (0–1). */
  preferredValue: number;
  /** Base color as linear sRGB. */
  baseLinearRgb: LinearRgb;
  /** Target color as linear sRGB. */
  targetLinearRgb: LinearRgb;
  /** WCAG contrast target. */
  contrast: MinContrast;
  /**
   * Compute the luminance of the mixed color at parameter t.
   * For opaque: luminance of OKHSL-interpolated color.
   * For transparent: luminance of alpha-composited color over base.
   */
  luminanceAtValue: (t: number) => number;
  /** Convergence threshold. Default: 1e-4. */
  epsilon?: number;
  /** Maximum binary-search iterations per branch. Default: 20. */
  maxIterations?: number;
  /**
   * Auto-flip mix direction when contrast can't be met.
   *
   * When `true`, the solver searches the initial direction first
   * (the side whose extreme has higher contrast against the base).
   * If that side doesn't reach the target, it tries the opposite
   * direction and uses it when it passes. If neither side passes,
   * it returns the extreme mix value of the initial direction.
   *
   * When `false`, only the initial direction is considered. If it
   * doesn't reach the target, the result is pinned to the initial
   * direction's extreme — never to the original preferred value.
   *
   * Default: false.
   */
  flip?: boolean;
}

export interface FindValueForMixContrastResult {
  /** Chosen mix parameter (0–1). */
  value: number;
  /** Achieved WCAG contrast ratio. */
  contrast: number;
  /** Whether the target was reached. */
  met: boolean;
  /**
   * Whether the result was auto-flipped to the opposite direction.
   * Only set when the initial direction failed and the opposite
   * direction satisfied the target.
   */
  flipped?: boolean;
}

/**
 * Binary-search one branch [lo, hi] for the nearest passing mix value
 * to `preferred`.
 */
function searchMixBranch(
  lo: number,
  hi: number,
  yBase: number,
  target: number,
  epsilon: number,
  maxIter: number,
  preferred: number,
  luminanceAt: (t: number) => number,
): BranchResult {
  const crLo = contrastRatioFromLuminance(luminanceAt(lo), yBase);
  const crHi = contrastRatioFromLuminance(luminanceAt(hi), yBase);

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
    const crMid = contrastRatioFromLuminance(luminanceAt(mid), yBase);

    if (crMid >= target) {
      if (mid < preferred) low = mid;
      else high = mid;
    } else {
      if (mid < preferred) high = mid;
      else low = mid;
    }
  }

  const crLow = contrastRatioFromLuminance(luminanceAt(low), yBase);
  const crHigh = contrastRatioFromLuminance(luminanceAt(high), yBase);

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

  return crLow >= crHigh
    ? { lightness: low, contrast: crLow, met: false }
    : { lightness: high, contrast: crHigh, met: false };
}

/**
 * Find the mix parameter (ratio or opacity) that satisfies a WCAG 2 contrast
 * target against a base color, staying as close to `preferredValue` as possible.
 */
export function findValueForMixContrast(
  options: FindValueForMixContrastOptions,
): FindValueForMixContrastResult {
  const {
    preferredValue,
    baseLinearRgb,
    contrast: contrastInput,
    luminanceAtValue,
    epsilon = 1e-4,
    maxIterations = 20,
  } = options;

  const target = resolveMinContrast(contrastInput);
  const searchTarget = target * 1.01;
  const yBase = gamutClampedLuminance(baseLinearRgb);

  const yPref = luminanceAtValue(preferredValue);
  const crPref = contrastRatioFromLuminance(yPref, yBase);

  if (crPref >= searchTarget) {
    return { value: preferredValue, contrast: crPref, met: true };
  }

  // Initial direction: the side whose extreme has higher contrast
  // against the base. Auto-flip considers the opposite side only when
  // this side fails; the fallback extreme also lives on this side.
  const canLower = preferredValue > 0;
  const canUpper = preferredValue < 1;
  let initialIsLower: boolean;
  if (canLower && !canUpper) {
    initialIsLower = true;
  } else if (!canLower && canUpper) {
    initialIsLower = false;
  } else if (!canLower && !canUpper) {
    return { value: preferredValue, contrast: crPref, met: false };
  } else {
    const crLowerExt = contrastRatioFromLuminance(luminanceAtValue(0), yBase);
    const crUpperExt = contrastRatioFromLuminance(luminanceAtValue(1), yBase);
    initialIsLower = crLowerExt >= crUpperExt;
  }

  const searchInitial = () =>
    initialIsLower
      ? searchMixBranch(
          0,
          preferredValue,
          yBase,
          searchTarget,
          epsilon,
          maxIterations,
          preferredValue,
          luminanceAtValue,
        )
      : searchMixBranch(
          preferredValue,
          1,
          yBase,
          searchTarget,
          epsilon,
          maxIterations,
          preferredValue,
          luminanceAtValue,
        );

  const searchOpposite = () =>
    initialIsLower
      ? searchMixBranch(
          preferredValue,
          1,
          yBase,
          searchTarget,
          epsilon,
          maxIterations,
          preferredValue,
          luminanceAtValue,
        )
      : searchMixBranch(
          0,
          preferredValue,
          yBase,
          searchTarget,
          epsilon,
          maxIterations,
          preferredValue,
          luminanceAtValue,
        );

  const initialResult = searchInitial();
  initialResult.met = initialResult.contrast >= target;

  if (initialResult.met && !options.flip) {
    return {
      value: initialResult.lightness,
      contrast: initialResult.contrast,
      met: true,
    };
  }

  if (options.flip) {
    const canOpposite = initialIsLower ? canUpper : canLower;
    const oppositeResult = canOpposite ? searchOpposite() : null;
    if (oppositeResult) oppositeResult.met = oppositeResult.contrast >= target;

    if (initialResult.met && oppositeResult?.met) {
      const initialDist = Math.abs(initialResult.lightness - preferredValue);
      const oppositeDist = Math.abs(oppositeResult.lightness - preferredValue);
      if (initialDist <= oppositeDist) {
        return {
          value: initialResult.lightness,
          contrast: initialResult.contrast,
          met: true,
        };
      }
      return {
        value: oppositeResult.lightness,
        contrast: oppositeResult.contrast,
        met: true,
        flipped: true,
      };
    }

    if (initialResult.met) {
      return {
        value: initialResult.lightness,
        contrast: initialResult.contrast,
        met: true,
      };
    }

    if (oppositeResult?.met) {
      return {
        value: oppositeResult.lightness,
        contrast: oppositeResult.contrast,
        met: true,
        flipped: true,
      };
    }
  }

  // Failure: pin to the initial direction's extreme.
  const extreme = initialIsLower ? 0 : 1;
  const crExtreme = contrastRatioFromLuminance(luminanceAtValue(extreme), yBase);
  return {
    value: extreme,
    contrast: crExtreme,
    met: false,
  };
}
