/**
 * Small shared helpers used across the resolver pipeline:
 * - HC-pair selection (`pairNormal` / `pairHC`)
 * - HC-pair interpolation for the manual contrast level (`contrastFraction`,
 *   `numberAt`, `parseToneValueAt`)
 * - Absolute / relative / extreme tone discrimination
 * - Generic numeric helpers (`clamp`, `lerp`, hue resolution, relative-value
 *   parsing)
 */

import type { ExtremeValue, HCPair, RelativeValue, ToneValue } from './types';

export function pairNormal<T>(p: HCPair<T>): T {
  return Array.isArray(p) ? p[0] : p;
}

export function pairHC<T>(p: HCPair<T>): T {
  return Array.isArray(p) ? p[1] : p;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function lerp(a: number, b: number, f: number): number {
  return a + (b - a) * f;
}

// ============================================================================
// Manual contrast level
// ============================================================================

/**
 * Blend fraction at/above which an un-interpolable HC pair switches from its
 * normal entry to its high-contrast one (level 50).
 */
export const PAIR_SWITCH = 0.5;

/** Blend fraction (0–1) for an authored 0–100 contrast level. */
export function levelFraction(level: number): number {
  return clamp(level, 0, 100) / 100;
}

/**
 * Manual-contrast blend fraction (0–1) for a resolved config, or `undefined`
 * in `'auto'` mode (the two-tier normal + high-contrast model).
 *
 * Note `contrastLevel: 0` yields `0`, not `undefined`: "pinned to normal
 * contrast with no high-contrast tier" is a distinct state from `'auto'`.
 */
export function contrastFraction(config: {
  contrastLevel?: number | 'auto';
}): number | undefined {
  const level = config.contrastLevel;
  if (typeof level !== 'number' || !Number.isFinite(level)) return undefined;
  return levelFraction(level);
}

/**
 * A numeric HC pair at a blend fraction (shadow `intensity`, mix `value`).
 *
 * The endpoints return the authored entry *by identity* rather than through
 * float arithmetic — `a + (b - a) * 1` is not bit-exactly `b` in IEEE 754, and
 * levels 0 / 100 must reproduce the classic output exactly.
 */
export function numberAt(p: HCPair<number>, f: number): number {
  if (!Array.isArray(p)) return p;
  if (f <= 0) return p[0];
  if (f >= 1) return p[1];
  return lerp(p[0], p[1], f);
}

/** Whether a tone value is an extreme keyword (`'max'` / `'min'`). */
export function isExtremeTone(value: ToneValue): value is ExtremeValue {
  return value === 'max' || value === 'min';
}

/**
 * Parse a value that can be absolute (number) or relative (signed string).
 * Returns the numeric value and whether it's relative.
 */
export function parseRelativeOrAbsolute(value: number | RelativeValue): {
  value: number;
  relative: boolean;
} {
  if (typeof value === 'number') {
    return { value, relative: false };
  }
  return { value: parseFloat(value), relative: true };
}

/**
 * Parse a tone value into a normalized shape.
 * - `'max'` / `'min'` → `{ kind: 'extreme', value: 100 | 0 }` (an absolute
 *   author tone before scheme mapping — `'max'` is 100, `'min'` is 0).
 * - `'+N'` / `'-N'` → `{ kind: 'relative', value: ±N }`.
 * - number → `{ kind: 'absolute', value }`.
 */
export function parseToneValue(value: ToneValue): {
  kind: 'absolute' | 'relative' | 'extreme';
  value: number;
} {
  if (value === 'max') return { kind: 'extreme', value: 100 };
  if (value === 'min') return { kind: 'extreme', value: 0 };
  if (typeof value === 'number') return { kind: 'absolute', value };
  return { kind: 'relative', value: parseFloat(value) };
}

/**
 * Parse an authored tone pair at a manual-contrast blend fraction, returning
 * the same normalized shape as {@link parseToneValue}.
 *
 * Same-kind numeric pairs interpolate their magnitude — absolute tones
 * (`[30, 20]` → 25 at level 50) and relative deltas (`['+10', '+20']` → +15).
 * Everything else is un-interpolable and switches at {@link PAIR_SWITCH}:
 * extremes carry no magnitude, and a mixed-kind pair would change *which*
 * resolver branch runs mid-ramp (absolute remap vs. extreme-against-base vs.
 * base-anchored delta), putting a discontinuity at level 100 — exactly where
 * the output must stay bit-exact.
 *
 * Returns a parsed struct rather than a `ToneValue` so a blended relative
 * delta never round-trips through a `'+15.5'` string, and so `kind` — which
 * selects the resolver branch — cannot drift.
 */
export function parseToneValueAt(
  p: HCPair<ToneValue>,
  f: number,
): { kind: 'absolute' | 'relative' | 'extreme'; value: number } {
  if (!Array.isArray(p)) return parseToneValue(p);
  if (f <= 0) return parseToneValue(p[0]);
  if (f >= 1) return parseToneValue(p[1]);
  const normal = parseToneValue(p[0]);
  const hc = parseToneValue(p[1]);
  if (normal.kind === hc.kind && normal.kind !== 'extreme') {
    return { kind: normal.kind, value: lerp(normal.value, hc.value, f) };
  }
  return f < PAIR_SWITCH ? normal : hc;
}

/**
 * Compute the effective hue for a color, given the theme seed hue
 * and an optional per-color hue override.
 */
export function resolveEffectiveHue(
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
 * Check whether a tone value represents an absolute root definition
 * (i.e. a number, not a relative string). Extreme keywords (`'max'` /
 * `'min'`) also count — they need no base.
 */
export function isAbsoluteTone(tone: HCPair<ToneValue> | undefined): boolean {
  if (tone === undefined) return false;
  const normal = Array.isArray(tone) ? tone[0] : tone;
  return typeof normal === 'number' || isExtremeTone(normal);
}
