/**
 * Small shared helpers used across the resolver pipeline:
 * - HC-pair selection (`pairNormal` / `pairHC`)
 * - Absolute / relative lightness discrimination
 * - Generic numeric helpers (`clamp`, hue resolution, relative-value parsing)
 */

import type { HCPair, RelativeValue } from './types';

export function pairNormal<T>(p: HCPair<T>): T {
  return Array.isArray(p) ? p[0] : p;
}

export function pairHC<T>(p: HCPair<T>): T {
  return Array.isArray(p) ? p[1] : p;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
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
 * Check whether a lightness value represents an absolute root definition
 * (i.e. a number, not a relative string).
 */
export function isAbsoluteLightness(
  lightness: HCPair<number | RelativeValue> | undefined,
): boolean {
  if (lightness === undefined) return false;
  const normal = Array.isArray(lightness) ? lightness[0] : lightness;
  return typeof normal === 'number';
}
