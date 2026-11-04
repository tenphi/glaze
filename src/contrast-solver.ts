/**
 * Contrast solver — operates in OKHST tone.
 *
 * Finds the tone closest to a preferred tone that satisfies a contrast
 * floor (WCAG 2 ratio or APCA Lc) against a base color. Because tone is
 * contrast-uniform, the WCAG branch gets a closed-form seed and the search
 * converges quickly.
 *
 * Both solvers search two branches that meet at the preferred position, which
 * has already missed the overshooting search target and so sits between the
 * passing regions. Each branch therefore reaches only its own side: a result
 * sits where its `branch` / `flipped` say, and keeps the overshoot that absorbs
 * formatting rounding.
 *
 * Public API: `findToneForContrast`, `findValueForMixContrast`,
 * `resolveMinContrast`, `resolveApcaTarget`, `resolveContrastForMode`,
 * `resolveContrastForLevel`, `apcaContrast`, plus the `APCA_PRESETS`,
 * `APCA_HC_ENHANCEMENT` and `APCA_MAX_LC` constants.
 */

import {
  okhslToLinearSrgb,
  contrastRatioFromLuminance,
  gamutClampedLuminance,
  apcaLuminanceFromLinearRgb,
} from './okhsl-color-math';
import { REF_EPS, fromTone, toneFromY } from './okhst';
import { clamp, lerp, levelFraction, pairHC, pairNormal } from './hc-pair';
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

/**
 * Named APCA Lc floor presets (APCA Bronze Simple Mode conformance levels),
 * independent of role. Use them anywhere an APCA target is accepted.
 *
 * | Preset        | Lc  | Use case                                             |
 * | ------------- | --- | ---------------------------------------------------- |
 * | `'preferred'` | 90  | Preferred body / column text                         |
 * | `'body'`      | 75  | Minimum body / column text                           |
 * | `'content'`   | 60  | Readable non-body content (~WCAG AA 4.5:1)           |
 * | `'large'`     | 45  | Large/bold headlines; fine icons/outlines (~3:1)     |
 * | `'non-text'`  | 30  | Solid icons/controls; placeholder/disabled text      |
 * | `'min'`       | 15  | Dividers/decorative; APCA "point of invisibility"    |
 */
export type ApcaPreset =
  | 'preferred'
  | 'body'
  | 'content'
  | 'large'
  | 'non-text'
  | 'min';

export const APCA_PRESETS: Record<ApcaPreset, number> = {
  preferred: 90,
  body: 75,
  content: 60,
  large: 45,
  'non-text': 30,
  min: 15,
};

/**
 * APCA-W3 "Enhanced Level" delta added to a bare APCA target in high-contrast
 * mode when no explicit HC value is provided (analogous to WCAG AAA over AA).
 * Only applied when neither the outer `contrast` pair nor the inner `apca`
 * pair carries an explicit HC entry.
 */
export const APCA_HC_ENHANCEMENT = 15;

/** Upper bound for an APCA Lc target after HC enhancement. */
export const APCA_MAX_LC = 106;

/**
 * Resolve an APCA target — a raw Lc number (kept as-is) or an `ApcaPreset`
 * keyword mapped to its Lc value. The magnitude is forced non-negative.
 */
export function resolveApcaTarget(value: number | ApcaPreset): number {
  if (typeof value === 'number') return Math.abs(value);
  return APCA_PRESETS[value];
}

/** Metric + numeric target after resolving a `ContrastSpec` for a mode. */
export interface ResolvedContrast {
  metric: 'wcag' | 'apca';
  /** WCAG ratio (>= 1) or APCA Lc magnitude (0–106). */
  target: number;
  /**
   * APCA argument order: which side the resolved (candidate) color plays
   * against the base. `'fg'` (default) → `apcaContrast(yCandidate, yBase)`;
   * `'bg'` → `apcaContrast(yBase, yCandidate)`. Always `'fg'` for WCAG
   * (symmetric, ignored).
   */
  polarity?: 'fg' | 'bg';
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

/**
 * WCAG high-contrast auto-promotion (analog of APCA's Enhanced Level). A bare
 * AA / AA-large preset is promoted to its spec-defined "Enhanced" successor
 * (SC 1.4.3 → SC 1.4.6) in high-contrast mode. AAA / AAA-large are already
 * the top WCAG tier and are left unchanged. Bare numeric targets have no
 * defined successor tier and are also left unchanged. An explicit HC value
 * (outer or inner pair) always overrides.
 */
const WCAG_HC_PROMOTION: Partial<Record<ContrastPreset, ContrastPreset>> = {
  AA: 'AAA',
  'AA-large': 'AAA-large',
};

export function resolveMinContrast(value: MinContrast): number {
  if (typeof value === 'number') {
    return Math.max(1, value);
  }
  return CONTRAST_PRESETS[value];
}

/**
 * Resolve a WCAG target (number or preset) for a mode, applying the
 * high-contrast auto-promotion when `explicitHC` is false and the value is an
 * AA-family preset. Bare numbers and AAA-family presets pass through.
 */
function resolveWcagTarget(
  value: number | ContrastPreset,
  isHighContrast: boolean,
  explicitHC: boolean,
): number {
  if (typeof value === 'number') {
    return resolveMinContrast(value);
  }
  if (isHighContrast && !explicitHC) {
    const promoted = WCAG_HC_PROMOTION[value];
    if (promoted !== undefined) return resolveMinContrast(promoted);
  }
  return resolveMinContrast(value);
}

function pickPair<T>(p: HCPair<T>, isHighContrast: boolean): T {
  return Array.isArray(p) ? (isHighContrast ? p[1] : p[0]) : p;
}

/**
 * The metric a single `ContrastSpec` measures in. Bare numbers and WCAG
 * presets are `'wcag'`; only an `{ apca }` object is `'apca'`.
 */
export function contrastMetricOf(spec: ContrastSpec): ContrastMetric {
  return typeof spec === 'object' && 'apca' in spec ? 'apca' : 'wcag';
}

/**
 * Resolve a `ContrastSpec` (already selected from any outer HC pair) for a
 * given mode into `{ metric, target }`. Handles the inner metric HC pair and
 * preset resolution. `polarity` is passed through to the result for the APCA
 * branch (it controls argument order in the solver); WCAG ignores it.
 *
 * `outerExplicitHC` indicates whether the caller selected this `spec` from an
 * explicit high-contrast entry of the outer `contrast` pair. Together with the
 * inner metric pair, it decides whether the HC auto-enhancement fires:
 *  - APCA: +15 Lc "Enhanced Level" boost when neither level is explicit.
 *  - WCAG: AA → AAA / AA-large → AAA-large promotion (SC 1.4.3 → 1.4.6) when
 *    neither level is explicit. AAA-family presets and bare numbers are left
 *    unchanged (AAA is the top WCAG tier).
 * Defaults to `false` (correct for direct callers, which pass a single
 * selected spec rather than an outer pair).
 */
export function resolveContrastForMode(
  spec: ContrastSpec,
  isHighContrast: boolean,
  polarity?: 'fg' | 'bg',
  outerExplicitHC?: boolean,
): ResolvedContrast {
  if (typeof spec === 'number' || typeof spec === 'string') {
    // A bare string here is a WCAG preset ('AA' / 'AAA' / ...).
    return {
      metric: 'wcag',
      target: resolveWcagTarget(spec, isHighContrast, !!outerExplicitHC),
    };
  }
  if ('apca' in spec) {
    const baseTarget = resolveApcaTarget(pickPair(spec.apca, isHighContrast));
    const innerExplicitHC = Array.isArray(spec.apca);
    const enhanced =
      isHighContrast && !outerExplicitHC && !innerExplicitHC
        ? Math.min(baseTarget + APCA_HC_ENHANCEMENT, APCA_MAX_LC)
        : baseTarget;
    return {
      metric: 'apca',
      target: enhanced,
      polarity: polarity ?? 'fg',
    };
  }
  const innerExplicitHC = Array.isArray(spec.wcag);
  const picked = pickPair(spec.wcag, isHighContrast);
  return {
    metric: 'wcag',
    target: resolveWcagTarget(
      picked,
      isHighContrast,
      !!outerExplicitHC || innerExplicitHC,
    ),
  };
}

/**
 * Resolve a `contrast` spec — including its outer `[normal, highContrast]`
 * pair — at a manual contrast `level` (0–100), by resolving both ends and
 * interpolating the numeric target.
 *
 * Level 0 / 100 delegate verbatim to {@link resolveContrastForMode}, so the
 * endpoints are bit-identical to classic normal / high-contrast resolution.
 * Resolving each end fully first also means every rule that governs the
 * escalation still applies at both ends for free: preset mapping, the
 * `APCA_MAX_LC` clamp, and the explicit-HC suppression that cancels the
 * `AA → AAA` promotion and the `+15 Lc` enhancement.
 *
 * Throws when the two ends measure in different metrics — a WCAG ratio and an
 * APCA Lc live on different scales, so there is no target between them. Such a
 * pair is rejected at authoring time by `validateColorDefs`; this is the guard
 * for direct callers.
 */
export function resolveContrastForLevel(
  spec: HCPair<ContrastSpec>,
  level: number,
  polarity?: 'fg' | 'bg',
): ResolvedContrast {
  const outerExplicitHC = Array.isArray(spec);
  const f = levelFraction(level);
  const normal = resolveContrastForMode(
    pairNormal(spec),
    false,
    polarity,
    outerExplicitHC,
  );
  if (f <= 0) return normal;
  const hc = resolveContrastForMode(
    pairHC(spec),
    true,
    polarity,
    outerExplicitHC,
  );
  if (f >= 1) return hc;
  if (normal.metric !== hc.metric) {
    throw new Error(
      `glaze: a "contrast" pair cannot switch metric between its normal ` +
        `(${normal.metric}) and high-contrast (${hc.metric}) entry — the two ` +
        `targets are on different scales. Use one metric for both entries.`,
    );
  }
  // Spread `normal` so the WCAG branch keeps its absent `polarity` and the
  // APCA branch its resolved one.
  return { ...normal, target: lerp(normal.target, hc.target, f) };
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
 * Tones are rounded to `1 / TONE_STEPS` (0.0001) before measuring, so the tone
 * solver can't resolve a crossing more finely than that, whatever `epsilon`.
 */
const TONE_STEPS = 10000;

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
  pastel: boolean,
): number {
  const tRounded = Math.round(t * TONE_STEPS) / TONE_STEPS;
  const key = `${metric}|${h}|${s}|${tRounded}|${pastel}`;

  const cached = luminanceCache.get(key);
  if (cached !== undefined) return cached;

  const l = fromTone(tRounded * 100, REF_EPS);
  const linearRgb = okhslToLinearSrgb(h, s, l, pastel);
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
 * magnitude). For APCA, `polarity` selects the argument order: `'fg'` (the
 * default) treats the candidate as the text against a background base
 * (`apcaContrast(yCandidate, yBase)`); `'bg'` treats the candidate as the
 * background (`apcaContrast(yBase, yCandidate)`). The magnitude is taken
 * either way. WCAG is symmetric, so polarity is ignored there.
 */
function metricScore(
  metric: 'wcag' | 'apca',
  yCandidate: number,
  yBase: number,
  polarity?: 'fg' | 'bg',
): number {
  if (metric === 'wcag') return contrastRatioFromLuminance(yCandidate, yBase);
  const lc =
    polarity === 'bg'
      ? apcaContrast(yBase, yCandidate)
      : apcaContrast(yCandidate, yBase);
  return Math.abs(lc);
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
  /**
   * Also search the opposite direction. Default: false. When both directions
   * meet the target, the result nearer `preferredTone` wins; a gap within the
   * search resolution is a tie and keeps `initialDirection`.
   */
  flip?: boolean;
  /**
   * When `flip` is on and *both* directions meet the target, keep
   * `initialDirection` instead of taking whichever result lands nearer the
   * preferred tone. Default: false (nearest wins).
   *
   * The nearest-wins tie-break is unstable along a ramp of targets: which side
   * is nearer shifts as the target grows, so a color can swap sides between two
   * adjacent targets. Set this when a caller needs the side to be a property of
   * the color rather than of the target — the manual contrast level does. The
   * flip itself is unaffected: an initial direction that cannot reach the
   * target still falls back to the opposite side.
   */
  preferInitial?: boolean;
  /** Use the hue-independent "safe" chroma boundary. Default: false. */
  pastel?: boolean;
}

export interface FindToneForContrastResult {
  /** Chosen tone in 0–1. */
  tone: number;
  /** Achieved score (WCAG ratio or APCA Lc magnitude). */
  contrast: number;
  /** Whether the target was reached. */
  met: boolean;
  /**
   * The side the result was found on. The two sides meet at `preferredTone`,
   * so a met result sits on that side of the base too. `'preferred'` when
   * `preferredTone` already passed.
   */
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
}

/**
 * Binary search one branch, from its `inner` bound out to its `outer` extreme,
 * for the position nearest `inner` that meets `target`. The domain is whatever
 * `lum` interprets (tone 0–1 or mix parameter 0–1); the search is identical in
 * both cases, and either end may be the numerically lower one.
 *
 * The score falls toward the base, so a branch's passing positions form one run
 * that reaches out to `outer`: the outer extreme is the most the branch can
 * reach. When even it falls short, the branch reports that extreme — never
 * `inner`, which borders the opposite branch: a near-miss there may sit on the
 * other side of the base, and returning it as this branch's answer would
 * mislabel its side and drop the overshoot.
 */
function searchBranch(
  lum: (x: number) => number,
  inner: number,
  outer: number,
  yBase: number,
  metric: 'wcag' | 'apca',
  target: number,
  epsilon: number,
  maxIter: number,
  polarity?: 'fg' | 'bg',
): BranchResult {
  const scoreOuter = metricScore(metric, lum(outer), yBase, polarity);
  if (scoreOuter < target) return { pos: outer, contrast: scoreOuter };

  const scoreInner = metricScore(metric, lum(inner), yBase, polarity);
  if (scoreInner >= target) return { pos: inner, contrast: scoreInner };

  // Invariant: `pass` meets the target, `fail` does not.
  let fail = inner;
  let pass = outer;
  for (let i = 0; i < maxIter; i++) {
    if (Math.abs(pass - fail) < epsilon) break;
    const mid = (fail + pass) / 2;
    if (metricScore(metric, lum(mid), yBase, polarity) >= target) pass = mid;
    else fail = mid;
  }

  return {
    pos: pass,
    contrast: metricScore(metric, lum(pass), yBase, polarity),
  };
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
 * search anchor / luminance closure are built.
 *
 * The two branches meet at `preferred`. The core only runs once `preferred`
 * has missed `searchTarget`, so it sits strictly between the passing region on
 * each side of the base: the lower branch `[lo, preferred]` can only reach the
 * lower side's passing positions and the upper branch `[preferred, hi]` only
 * the upper side's. That is what keeps a result on the side its branch reports
 * and, away from the bounds, its contrast at `searchTarget` (overshoot
 * included).
 *
 * `searchAnchor` may bias the *initial* branch's inner bound — and with it the
 * in-branch tiebreak — outward from `preferred` (the WCAG seed for the tone
 * solver; `preferred` itself otherwise). It is clamped to the initial side, so
 * it can shrink that branch but never stretch it across `preferred` into the
 * opposite one. The opposite branch always starts at `preferred`, which is
 * also the position the flip step measures closeness against.
 */
interface SolveCoreOptions {
  lum: (x: number) => number;
  yBase: number;
  metric: 'wcag' | 'apca';
  target: number;
  searchTarget: number;
  lo: number;
  hi: number;
  /** Inner bound + tiebreak anchor of the initial branch (outward bias). */
  searchAnchor: number;
  /** Boundary between the branches; the flip step minimizes distance to it. */
  preferred: number;
  epsilon: number;
  /**
   * How finely a branch result is known: `epsilon`, or coarser when `lum` is
   * quantized. Nearest-wins treats distances within twice this as a tie.
   */
  resolution: number;
  maxIterations: number;
  flip: boolean;
  /** Keep the initial branch when both meet, instead of taking the nearest. */
  preferInitial: boolean;
  /** Force the first branch ('lower' searches `[lo, searchAnchor]`). */
  initialIsLower: boolean;
  /** APCA argument order; ignored for WCAG. Default `'fg'`. */
  polarity?: 'fg' | 'bg';
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
    preferred,
    epsilon,
    resolution,
    maxIterations,
    flip,
    preferInitial,
    initialIsLower,
    polarity,
  } = opts;

  const boundary = clamp(preferred, lo, hi);

  const runBranch = (lower: boolean, inner: number) => {
    const result = searchBranch(
      lum,
      inner,
      lower ? lo : hi,
      yBase,
      metric,
      searchTarget,
      epsilon,
      maxIterations,
      polarity,
    );
    return { ...result, met: result.contrast >= target, lower };
  };

  // The seed bias may only pull the initial branch's inner bound outward.
  const initialInner = clamp(
    initialIsLower
      ? Math.min(searchAnchor, boundary)
      : Math.max(searchAnchor, boundary),
    lo,
    hi,
  );
  const initial = runBranch(initialIsLower, initialInner);

  // A branch that misses the target reports its outer extreme, so an unmet
  // `initial` is already pinned to the initial direction's extreme — the
  // failure result whether or not the flip is tried.
  if (!flip) return initial;

  // The opposite branch exists only when `preferred` is strictly interior on
  // that side (matches the legacy canDarker/canUpper guards).
  const canOpposite = initialIsLower ? preferred < hi : preferred > lo;
  if (!canOpposite) return initial;
  const opposite = { ...runBranch(!initialIsLower, boundary), flipped: true };

  if (initial.met && opposite.met) {
    if (preferInitial) return initial;
    const initialDist = Math.abs(initial.pos - preferred);
    const oppositeDist = Math.abs(opposite.pos - preferred);
    // Each distance is only known to within `resolution`, so a gap inside
    // twice that is a tie — and a tie keeps the initial side. Without the
    // margin, an exact tie (a neutral color with no tone of its own sits the
    // same tone distance from either side's crossing) is decided by search
    // noise.
    return initialDist <= oppositeDist + 2 * resolution ? initial : opposite;
  }
  return opposite.met && !initial.met ? opposite : initial;
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
    pastel = false,
  } = options;

  const { metric, target, polarity } = contrast;
  // Overshoot absorbs rounding in the OKHSL/OKLCH formatting pipeline.
  const searchTarget = metric === 'wcag' ? target * 1.01 : target + 0.5;
  const yBase = metricLuminance(metric, baseLinearRgb);

  // Luminance of a candidate at tone `t`.
  const lum = (t: number): number =>
    cachedLuminance(metric, hue, saturation, t, pastel);

  const scorePref = metricScore(metric, lum(preferredTone), yBase, polarity);

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
    const scoreMin = metricScore(metric, lum(minT), yBase, polarity);
    const scoreMax = metricScore(metric, lum(maxT), yBase, polarity);
    initialIsDarker = scoreMin >= scoreMax;
  }

  // For WCAG, bias the initial branch's search start toward the closed-form
  // seed (darker = the "lower" branch). The core only lets the seed shrink that
  // branch outward from `preferredTone`; the opposite branch and the flip
  // step's distance both stay anchored to `preferredTone` itself.
  const searchAnchor =
    metric === 'wcag'
      ? wcagToneSeed(yBase, target, initialIsDarker)
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
    preferred: preferredTone,
    epsilon,
    resolution: Math.max(epsilon, 1 / TONE_STEPS),
    maxIterations,
    flip: options.flip ?? false,
    preferInitial: options.preferInitial ?? false,
    initialIsLower: initialIsDarker,
    polarity,
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
  /** Base color as linear sRGB — the color the mix is measured against. */
  baseLinearRgb: LinearRgb;
  /** Resolved contrast floor (metric + target). */
  contrast: ResolvedContrast;
  /**
   * Luminance of the mixed color at parameter t, in the metric's basis
   * ({@link metricLuminance}). This closure is the only view the solver has of
   * the mix's target color, blend, and color space.
   */
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

  const { metric, target, polarity } = contrast;
  const searchTarget = metric === 'wcag' ? target * 1.01 : target + 0.5;
  const yBase = metricLuminance(metric, baseLinearRgb);

  const scorePref = metricScore(
    metric,
    luminanceAtValue(preferredValue),
    yBase,
    polarity,
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
    const scoreLower = metricScore(
      metric,
      luminanceAtValue(0),
      yBase,
      polarity,
    );
    const scoreUpper = metricScore(
      metric,
      luminanceAtValue(1),
      yBase,
      polarity,
    );
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
    preferred: preferredValue,
    epsilon,
    resolution: epsilon,
    maxIterations,
    flip: options.flip ?? false,
    // A mix searches along the base→target segment rather than across a base,
    // so the nearest-wins tie-break has no side to swap; left as-is.
    preferInitial: false,
    initialIsLower,
    polarity,
  });

  return {
    value: solved.pos,
    contrast: solved.contrast,
    met: solved.met,
    ...(solved.flipped ? { flipped: true } : {}),
  };
}
