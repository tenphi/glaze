/**
 * Small shared helpers used across the resolver pipeline:
 * - HC-pair selection (`pairNormal` / `pairHC`)
 * - Absolute / relative lightness discrimination
 * - Generic numeric helpers (`clamp`, hue resolution, relative-value parsing)
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
