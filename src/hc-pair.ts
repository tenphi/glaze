/**
 * Small shared helpers used across the resolver pipeline:
 * - HC-pair selection (`pairNormal` / `pairHC`)
 * - HC-pair interpolation for the manual contrast level (`contrastFraction`,
 *   `hcMirrorsNormal`, `numberAt`, `parseToneValueAt`)
 * - Absolute / relative / extreme tone discrimination
 * - Generic numeric helpers (`clamp`, `lerp`, hue resolution, relative-value
 *   parsing)
 * - `showValue`, which writes a rejected input into a validation error
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

/** Brackets `undefined` or a non-finite number while JSON writes it. */
const UNWRITABLE_MARK = '\uE000';
const UNWRITABLE_RE = /"\uE000([^"]*)\uE000"/g;

/**
 * A rejected input as a validation error shows it. Numbers and `undefined`
 * via `String` (`JSON.stringify(NaN)` is "null"), a bigint with its `n`
 * (JSON can't write one), anything else via JSON so a string shows its quotes
 * and an array its shape, with `undefined` or a non-finite number inside
 * written as it prints (`[10,NaN]`, `{"wcag":undefined}`; JSON would write
 * `null` or drop the key) — falling back to `String` for what JSON can't
 * write (a symbol, a function, a cycle).
 */
export function showValue(value: unknown): string {
  if (typeof value === 'number' || value === undefined) return String(value);
  if (typeof value === 'bigint') return `${value}n`;
  try {
    // A value that holds the marker itself is written as plain JSON, so a
    // string of the caller's never loses its quotes.
    const plain = JSON.stringify(value);
    if (plain === undefined) return String(value);
    if (plain.includes(UNWRITABLE_MARK)) return plain;
    const json = JSON.stringify(value, (_key, v: unknown) =>
      v === undefined || (typeof v === 'number' && !Number.isFinite(v))
        ? `${UNWRITABLE_MARK}${v}${UNWRITABLE_MARK}`
        : v,
    );
    return json?.replace(UNWRITABLE_RE, '$1') ?? String(value);
  } catch {
    return String(value);
  }
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
 * in `'auto'` mode, where the normal variants take the authored normal entries
 * as-is.
 *
 * Note `contrastLevel: 0` yields `0`, not `undefined`. The two select different
 * branches, and an authored `0` is a slider position that `.export()` freezes
 * where an absent level is not — but they are not an *output* distinction: at
 * fraction 0 every interpolation returns its normal entry verbatim, so level 0
 * reproduces `'auto'` bit for bit.
 */
export function contrastFraction(config: {
  contrastLevel?: number | 'auto';
}): number | undefined {
  const level = config.contrastLevel;
  if (typeof level !== 'number' || !Number.isFinite(level)) return undefined;
  return levelFraction(level);
}

/**
 * Whether the high-contrast variants are exact duplicates of the normal ones —
 * true only at `contrastLevel: 100`, where the normal passes already resolve at
 * full contrast.
 *
 * The level otherwise says nothing about high contrast: it positions the normal
 * variants, while `lightContrast` / `darkContrast` stay the true high-contrast
 * resolution at every level. This predicate marks the one level where that tier
 * carries no new information, so callers can skip the two high-contrast passes,
 * their drift checks, and the redundant output tier.
 */
export function hcMirrorsNormal(config: {
  contrastLevel?: number | 'auto';
}): boolean {
  return contrastFraction(config) === 1;
}

/**
 * A numeric HC pair at a blend fraction (shadow / glow `intensity`, mix `value`).
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
