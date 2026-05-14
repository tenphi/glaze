/**
 * Contrast-warning dispatcher.
 *
 * Tokens memoize their resolution, but a long-lived process (e.g. a dev
 * server with HMR) can re-resolve the same theme many times. The cache
 * here dedupes warnings within a session with a soft cap to keep noise
 * bounded.
 */

import { resolveMinContrast } from './contrast-solver';
import type { MinContrast } from './contrast-solver';

const CONTRAST_WARN_CACHE_LIMIT = 256;
const contrastWarnCache = new Set<string>();

/**
 * Slack factor below the requested target before we emit a warning.
 * The contrast solver already overshoots by `OVERSHOOT` (currently 1%)
 * to absorb rounding noise (`see findLightnessForContrast` in
 * `contrast-solver.ts`), so an `actual` ratio within ~2x that overshoot
 * is effectively a pass and not worth nagging the user about.
 */
const CONTRAST_WARN_SLACK = 0.98;

function schemeLabel(isDark: boolean, isHighContrast: boolean): string {
  if (isDark && isHighContrast) return 'darkContrast';
  if (isDark) return 'dark';
  if (isHighContrast) return 'lightContrast';
  return 'light';
}

function formatContrastTarget(input: MinContrast, ratio: number): string {
  return typeof input === 'string'
    ? `"${input}" (${ratio.toFixed(2)})`
    : ratio.toFixed(2);
}

export function warnContrastUnmet(
  name: string,
  isDark: boolean,
  isHighContrast: boolean,
  target: MinContrast,
  actual: number,
): void {
  const targetRatio = resolveMinContrast(target);
  if (actual >= targetRatio * CONTRAST_WARN_SLACK) return;

  const scheme = schemeLabel(isDark, isHighContrast);
  const key = `${name}|${scheme}|${targetRatio.toFixed(3)}|${actual.toFixed(2)}`;
  if (contrastWarnCache.has(key)) return;

  if (contrastWarnCache.size >= CONTRAST_WARN_CACHE_LIMIT) {
    contrastWarnCache.clear();
  }
  contrastWarnCache.add(key);

  console.warn(
    `glaze: color "${name}" cannot meet contrast ${formatContrastTarget(
      target,
      targetRatio,
    )} in ${scheme} scheme (got ${actual.toFixed(2)}). ` +
      `Try widening the lightness window, lowering the contrast target, ` +
      `or picking a base color further from this color's lightness.`,
  );
}
