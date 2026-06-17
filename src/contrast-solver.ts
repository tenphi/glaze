/**
 * Contrast solver — operates in OKHST tone.
 *
 * Finds the tone closest to a preferred tone that satisfies a contrast
 * floor (WCAG 2 ratio or APCA Lc) against a base color. Because tone is
 * contrast-uniform, the WCAG branch gets a closed-form seed and the search
 * converges quickly.
 *
 * Public API: `findToneForContrast`, `findValueForMixContrast`,
 * `resolveMinContrast`, `resolveContrastForMode`, `apcaContrast`.
 */

import {
  okhslToLinearSrgb,
  contrastRatioFromLuminance,
  gamutClampedLuminance,
  apcaLuminanceFromLinearRgb,
} from './okhsl-color-math';
import { REF_EPS, fromTone, saturationEnvelope, toneFromY } from './okhst';
import { clamp } from './hc-pair';
import type { ContrastSpec, HCPair } from './types';

export type LinearRgb = [number, number, number];

export type ContrastMetric = 'wcag' | 'apca';

/**
 * Luminance of a linear-sRGB color in the basis the metric expects: WCAG
 * relative luminance for `wcag`, APCA screen luminance (`Ys`) for `apca`.
 */
export function metricLuminance(
  metric: ContrastMetric,
  linearRgb: LinearRgb,
): number {
  return metric === 'apca'
    ? apcaLuminanceFromLinearRgb(linearRgb)
    : gamutClampedLuminance(linearRgb);
}

// ============================================================================
// Types
// ============================================================================

export type ContrastPreset = 'AA' | 'AAA' | 'AA-large' | 'AAA-large';
export type MinContrast = number | ContrastPreset;

/** Metric + numeric target after resolving a `ContrastSpec` for a mode. */
export interface ResolvedContrast {
  metric: 'wcag' | 'apca';
  /** WCAG ratio (>= 1) or APCA Lc magnitude (0–106). */
  target: number;
}

// ============================================================================
// Preset mapping + spec resolution
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

function pickPair<T>(p: HCPair<T>, isHighContrast: boolean): T {
  return Array.isArray(p) ? (isHighContrast ? p[1] : p[0]) : p;
}

/**
 * Resolve a `ContrastSpec` (already selected from any outer HC pair) for a
 * given mode into `{ metric, target }`. Handles the inner metric HC pair and
 * preset resolution.
 */
export function resolveContrastForMode(
  spec: ContrastSpec,
  isHighContrast: boolean,
): ResolvedContrast {
  if (typeof spec === 'number' || typeof spec === 'string') {
    return { metric: 'wcag', target: resolveMinContrast(spec) };
  }
  if ('apca' in spec) {
    return {
      metric: 'apca',
      target: Math.abs(pickPair(spec.apca, isHighContrast)),
    };
  }
  return {
    metric: 'wcag',
    target: resolveMinContrast(pickPair(spec.wcag, isHighContrast)),
  };
}

// ============================================================================
// APCA (SAPC / APCA-W3 0.1.9 simplified)
// ============================================================================

const APCA_EXPONENTS = {
  mainTRC: 2.4,
  normBG: 0.56,
  normTXT: 0.57,
  revTXT: 0.62,
  revBG: 0.65,
};
const APCA_BLACK_THRESH = 0.022;
const APCA_BLACK_CLIP = 1.414;
const APCA_DELTA_Y_MIN = 0.0005;
const APCA_SCALE = 1.14;
const APCA_LO_OFFSET = 0.027;

function apcaSoftClamp(y: number): number {
  const yc = Math.max(0, y);
  if (yc >= APCA_BLACK_THRESH) return yc;
  return yc + Math.pow(APCA_BLACK_THRESH - yc, APCA_BLACK_CLIP);
}

/**
 * APCA lightness contrast (Lc), signed: positive for dark text on light bg,
 * negative for light text on dark bg. Inputs are screen luminances (0–1).
 */
export function apcaContrast(yText: number, yBg: number): number {
  const txt = apcaSoftClamp(yText);
  const bg = apcaSoftClamp(yBg);

  if (Math.abs(bg - txt) < APCA_DELTA_Y_MIN) return 0;

  let sapc: number;
  if (bg > txt) {
    // Normal polarity: dark text on light bg.
    sapc =
      (Math.pow(bg, APCA_EXPONENTS.normBG) -
        Math.pow(txt, APCA_EXPONENTS.normTXT)) *
      APCA_SCALE;
    return sapc < 0.1 ? 0 : (sapc - APCA_LO_OFFSET) * 100;
  }
  // Reverse polarity: light text on dark bg.
  sapc =
    (Math.pow(bg, APCA_EXPONENTS.revBG) -
      Math.pow(txt, APCA_EXPONENTS.revTXT)) *
    APCA_SCALE;
  return sapc > -0.1 ? 0 : (sapc + APCA_LO_OFFSET) * 100;
}

// ============================================================================
// Tone -> luminance (cached)
// ============================================================================

const CACHE_SIZE = 512;
const luminanceCache = new Map<string, number>();
const cacheOrder: string[] = [];

/**
 * Luminance of an OKHST color `(h, s, t)` with t in 0–1 (reference eps), in
 * the metric's luminance basis. The metric is part of the cache key because
 * WCAG and APCA derive different luminances from the same color.
 */
function cachedLuminance(
  metric: ContrastMetric,
  h: number,
  s: number,
  t: number,
): number {
  const tRounded = Math.round(t * 10000) / 10000;
  const key = `${metric}|${h}|${s}|${tRounded}`;

  const cached = luminanceCache.get(key);
  if (cached !== undefined) return cached;

  const l = fromTone(tRounded * 100, REF_EPS);
  const linearRgb = okhslToLinearSrgb(h, s, l);
  const y = metricLuminance(metric, linearRgb);

  if (luminanceCache.size >= CACHE_SIZE) {
    const evict = cacheOrder.shift()!;
    luminanceCache.delete(evict);
  }
  luminanceCache.set(key, y);
  cacheOrder.push(key);

  return y;
}

// ============================================================================
// Metric evaluation
// ============================================================================

/**
 * Score a candidate luminance against the base for a metric. Returns a value
 * that is `>= target` exactly when the floor is met (WCAG ratio, or APCA Lc
 * magnitude).
 */
function metricScore(
  metric: 'wcag' | 'apca',
  yCandidate: number,
  yBase: number,
): number {
  if (metric === 'wcag') return contrastRatioFromLuminance(yCandidate, yBase);
  return Math.abs(apcaContrast(yCandidate, yBase));
}

// ============================================================================
// Solver
// ============================================================================

export interface FindToneForContrastOptions {
  /** Hue of the candidate color (0–360). */
  hue: number;
  /** Saturation of the candidate color (0–1). */
  saturation: number;
  /** Preferred tone of the candidate (0–1). */
  preferredTone: number;

  /** Base/reference color as linear sRGB. */
  baseLinearRgb: LinearRgb;

  /** Resolved contrast floor (metric + target). */
  contrast: ResolvedContrast;

  /** Search bounds for tone. Default: [0, 1]. */
  toneRange?: [number, number];
  /** Convergence threshold. Default: 1e-4. */
  epsilon?: number;
  /** Maximum binary-search iterations per branch. Default: 18. */
  maxIterations?: number;
  /** Preferred search direction before auto-flip is considered. */
  initialDirection?: 'lighter' | 'darker';
  /** Auto-flip tone direction when contrast can't be met. Default: false. */
  flip?: boolean;
  /**
   * Saturation taper strength (0–1). When set, candidate saturation is rolled
   * off toward the tone extremes via the same envelope the renderer applies,
   * so the solved tone meets the floor with its *rendered* saturation. Default
   * `0` (no taper) for direct/advanced callers.
   */
  saturationTaper?: number;
}

export interface FindToneForContrastResult {
  /** Chosen tone in 0–1. */
  tone: number;
  /** Achieved score (WCAG ratio or APCA Lc magnitude). */
  contrast: number;
  /** Whether the target was reached. */
  met: boolean;
  /** Which branch was selected. */
  branch: 'lighter' | 'darker' | 'preferred';
  /** Whether the result auto-flipped to the opposite direction. */
  flipped?: boolean;
}

/**
 * Result of a single one-dimensional branch search. `pos` is the chosen
 * coordinate (tone or mix value depending on the caller's domain).
 */
interface BranchResult {
  pos: number;
  contrast: number;
  met: boolean;
}

/**
 * Binary search one branch `[lo, hi]` for the position nearest to `anchor`
 * that meets `target`. The domain is whatever `lum` interprets (tone 0–1 or
 * mix parameter 0–1); the search is identical in both cases.
 */
function searchBranch(
  lum: (x: number) => number,
  lo: number,
  hi: number,
  yBase: number,
  metric: 'wcag' | 'apca',
  target: number,
  epsilon: number,
  maxIter: number,
  anchor: number,
): BranchResult {
  const scoreLo = metricScore(metric, lum(lo), yBase);
  const scoreHi = metricScore(metric, lum(hi), yBase);

  if (scoreLo < target && scoreHi < target) {
    return scoreLo >= scoreHi
      ? { pos: lo, contrast: scoreLo, met: false }
      : { pos: hi, contrast: scoreHi, met: false };
  }

  let low = lo;
  let high = hi;

  for (let i = 0; i < maxIter; i++) {
    if (high - low < epsilon) break;
    const mid = (low + high) / 2;
    const scoreMid = metricScore(metric, lum(mid), yBase);

    if (scoreMid >= target) {
      if (mid < anchor) low = mid;
      else high = mid;
    } else {
      if (mid < anchor) high = mid;
      else low = mid;
    }
  }

  const scoreLow = metricScore(metric, lum(low), yBase);
  const scoreHigh = metricScore(metric, lum(high), yBase);
  const lowPasses = scoreLow >= target;
  const highPasses = scoreHigh >= target;

  if (lowPasses && highPasses) {
    return Math.abs(low - anchor) <= Math.abs(high - anchor)
      ? { pos: low, contrast: scoreLow, met: true }
      : { pos: high, contrast: scoreHigh, met: true };
  }
  if (lowPasses) return { pos: low, contrast: scoreLow, met: true };
  if (highPasses) return { pos: high, contrast: scoreHigh, met: true };

  return scoreLow >= scoreHigh
    ? { pos: low, contrast: scoreLow, met: false }
    : { pos: high, contrast: scoreHigh, met: false };
}

/**
 * Closed-form WCAG tone seed: the gray tone whose luminance produces exactly
 * the target ratio against the base, on the requested side. Used to bias the
 * preferred tone before the search so chromatic refinement starts close.
 */
function wcagToneSeed(yBase: number, target: number, darker: boolean): number {
  const yTarget = darker
    ? (yBase + 0.05) / target - 0.05
    : target * (yBase + 0.05) - 0.05;
  const yClamped = Math.max(0, Math.min(1, yTarget));
  return Math.max(0, Math.min(1, toneFromY(yClamped, REF_EPS) / 100));
}

/**
 * Shared "find the nearest passing position" core for both the tone and mix
 * solvers. Both pick an initial direction within `[lo, hi]`, binary-search
 * that branch, optionally flip to the opposite branch, and pin to the
 * initial extreme on failure — they only differ in their domain and how the
 * branch boundary / luminance closure are built.
 *
 * `searchAnchor` biases the branch boundary and the in-branch tiebreak (the
 * WCAG seed for the tone solver; `preferred` otherwise). `distanceAnchor`
 * is the position the flip step measures closeness against (the original
 * preferred position, before any seed bias).
 */
interface SolveCoreOptions {
  lum: (x: number) => number;
  yBase: number;
  metric: 'wcag' | 'apca';
  target: number;
  searchTarget: number;
  lo: number;
  hi: number;
  /** Branch-boundary + in-branch tiebreak anchor. */
  searchAnchor: number;
  /** Position the flip step minimizes distance to. */
  distanceAnchor: number;
  epsilon: number;
  maxIterations: number;
  flip: boolean;
  /** Force the first branch ('lower' searches `[lo, anchor]'). */
  initialIsLower: boolean;
}

interface SolveCoreResult {
  pos: number;
  contrast: number;
  met: boolean;
  /** Which branch produced the result. */
  lower: boolean;
  flipped?: boolean;
}

function solveNearestContrast(opts: SolveCoreOptions): SolveCoreResult {
  const {
    lum,
    yBase,
    metric,
    target,
    searchTarget,
    lo,
    hi,
    searchAnchor,
    distanceAnchor,
    epsilon,
    maxIterations,
    flip,
    initialIsLower,
  } = opts;

  const runBranch = (lower: boolean): BranchResult =>
    lower
      ? searchBranch(
          lum,
          lo,
          searchAnchor,
          yBase,
          metric,
          searchTarget,
          epsilon,
          maxIterations,
          searchAnchor,
        )
      : searchBranch(
          lum,
          searchAnchor,
          hi,
          yBase,
          metric,
          searchTarget,
          epsilon,
          maxIterations,
          searchAnchor,
        );

  const initialResult = runBranch(initialIsLower);
  initialResult.met = initialResult.contrast >= target;

  if (initialResult.met && !flip) {
    return { ...initialResult, lower: initialIsLower };
  }

  if (flip) {
    // The opposite branch exists only when `distanceAnchor` is strictly
    // interior on that side (matches the legacy canDarker/canUpper guards).
    const canOpposite = initialIsLower
      ? distanceAnchor < hi
      : distanceAnchor > lo;
    const oppositeResult = canOpposite ? runBranch(!initialIsLower) : null;
    if (oppositeResult) oppositeResult.met = oppositeResult.contrast >= target;

    if (initialResult.met && oppositeResult?.met) {
      const initialDist = Math.abs(initialResult.pos - distanceAnchor);
      const oppositeDist = Math.abs(oppositeResult.pos - distanceAnchor);
      return initialDist <= oppositeDist
        ? { ...initialResult, lower: initialIsLower }
        : { ...oppositeResult, lower: !initialIsLower, flipped: true };
    }
    if (initialResult.met) return { ...initialResult, lower: initialIsLower };
    if (oppositeResult?.met) {
      return { ...oppositeResult, lower: !initialIsLower, flipped: true };
    }
  }

  // Failure: pin to the initial direction's extreme.
  const extreme = initialIsLower ? lo : hi;
  const scoreExtreme = metricScore(metric, lum(extreme), yBase);
  return {
    pos: extreme,
    contrast: scoreExtreme,
    met: false,
    lower: initialIsLower,
  };
}

/**
 * Find the tone that satisfies a contrast floor against a base color,
 * staying as close to `preferredTone` as possible.
 */
export function findToneForContrast(
  options: FindToneForContrastOptions,
): FindToneForContrastResult {
  const {
    hue,
    saturation,
    preferredTone,
    baseLinearRgb,
    contrast,
    toneRange = [0, 1],
    epsilon = 1e-4,
    maxIterations = 18,
  } = options;

  const { metric, target } = contrast;
  // Overshoot absorbs rounding in the OKHSL/OKLCH formatting pipeline.
  const searchTarget = metric === 'wcag' ? target * 1.01 : target + 0.5;
  const yBase = metricLuminance(metric, baseLinearRgb);

  const taper = options.saturationTaper ?? 0;
  // Luminance of a candidate at tone `t`. With a taper, saturation rolls off
  // toward the extremes exactly as the renderer does, so the solved tone
  // meets the floor with its *rendered* saturation; the (h, s, t) cache only
  // applies when saturation is tone-independent (no taper).
  const lum =
    taper > 0
      ? (t: number): number => {
          const s = saturationEnvelope(saturation, t, taper);
          const l = fromTone(t * 100, REF_EPS);
          return metricLuminance(metric, okhslToLinearSrgb(hue, s, l));
        }
      : (t: number): number => cachedLuminance(metric, hue, saturation, t);

  const scorePref = metricScore(metric, lum(preferredTone), yBase);

  if (scorePref >= searchTarget) {
    return {
      tone: preferredTone,
      contrast: scorePref,
      met: true,
      branch: 'preferred',
    };
  }

  const [minT, maxT] = toneRange;
  const canDarker = preferredTone > minT;
  const canLighter = preferredTone < maxT;

  let initialIsDarker: boolean;
  if (options.initialDirection !== undefined) {
    initialIsDarker = options.initialDirection === 'darker';
  } else if (canDarker && !canLighter) {
    initialIsDarker = true;
  } else if (!canDarker && canLighter) {
    initialIsDarker = false;
  } else if (!canDarker && !canLighter) {
    return {
      tone: preferredTone,
      contrast: scorePref,
      met: false,
      branch: 'preferred',
    };
  } else {
    const scoreMin = metricScore(metric, lum(minT), yBase);
    const scoreMax = metricScore(metric, lum(maxT), yBase);
    initialIsDarker = scoreMin >= scoreMax;
  }

  // For WCAG, bias the search start toward the closed-form seed (darker =
  // the "lower" branch). The flip step still measures distance against the
  // original `preferredTone`, not the seed.
  const searchAnchor =
    metric === 'wcag'
      ? clamp(
          initialIsDarker
            ? Math.min(preferredTone, wcagToneSeed(yBase, target, true))
            : Math.max(preferredTone, wcagToneSeed(yBase, target, false)),
          minT,
          maxT,
        )
      : preferredTone;

  const solved = solveNearestContrast({
    lum,
    yBase,
    metric,
    target,
    searchTarget,
    lo: minT,
    hi: maxT,
    searchAnchor,
    distanceAnchor: preferredTone,
    epsilon,
    maxIterations,
    flip: options.flip ?? false,
    initialIsLower: initialIsDarker,
  });

  return {
    tone: solved.pos,
    contrast: solved.contrast,
    met: solved.met,
    branch: solved.lower ? 'darker' : 'lighter',
    ...(solved.flipped ? { flipped: true } : {}),
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
  /** Resolved contrast floor (metric + target). */
  contrast: ResolvedContrast;
  /** Compute the luminance of the mixed color at parameter t. */
  luminanceAtValue: (t: number) => number;
  /** Convergence threshold. Default: 1e-4. */
  epsilon?: number;
  /** Maximum binary-search iterations per branch. Default: 20. */
  maxIterations?: number;
  /** Auto-flip mix direction when contrast can't be met. Default: false. */
  flip?: boolean;
}

export interface FindValueForMixContrastResult {
  value: number;
  contrast: number;
  met: boolean;
  flipped?: boolean;
}

/**
 * Find the mix parameter (ratio or opacity) that satisfies a contrast floor
 * against a base color, staying as close to `preferredValue` as possible.
 */
export function findValueForMixContrast(
  options: FindValueForMixContrastOptions,
): FindValueForMixContrastResult {
  const {
    preferredValue,
    baseLinearRgb,
    contrast,
    luminanceAtValue,
    epsilon = 1e-4,
    maxIterations = 20,
  } = options;

  const { metric, target } = contrast;
  const searchTarget = metric === 'wcag' ? target * 1.01 : target + 0.5;
  const yBase = metricLuminance(metric, baseLinearRgb);

  const scorePref = metricScore(
    metric,
    luminanceAtValue(preferredValue),
    yBase,
  );
  if (scorePref >= searchTarget) {
    return { value: preferredValue, contrast: scorePref, met: true };
  }

  const canLower = preferredValue > 0;
  const canUpper = preferredValue < 1;
  let initialIsLower: boolean;
  if (canLower && !canUpper) {
    initialIsLower = true;
  } else if (!canLower && canUpper) {
    initialIsLower = false;
  } else if (!canLower && !canUpper) {
    return { value: preferredValue, contrast: scorePref, met: false };
  } else {
    const scoreLower = metricScore(metric, luminanceAtValue(0), yBase);
    const scoreUpper = metricScore(metric, luminanceAtValue(1), yBase);
    initialIsLower = scoreLower >= scoreUpper;
  }

  const solved = solveNearestContrast({
    lum: luminanceAtValue,
    yBase,
    metric,
    target,
    searchTarget,
    lo: 0,
    hi: 1,
    searchAnchor: preferredValue,
    distanceAnchor: preferredValue,
    epsilon,
    maxIterations,
    flip: options.flip ?? false,
    initialIsLower,
  });

  return {
    value: solved.pos,
    contrast: solved.contrast,
    met: solved.met,
    ...(solved.flipped ? { flipped: true } : {}),
  };
}
