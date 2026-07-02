/**
 * Contrast-warning dispatcher.
 *
 * Tokens memoize their resolution, but a long-lived process (e.g. a dev
 * server with HMR) can re-resolve the same theme many times. The cache
 * here dedupes warnings within a session with a soft cap to keep noise
 * bounded.
 */

import { apcaContrast } from './contrast-solver';
import type { ResolvedContrast } from './contrast-solver';
import { contrastRatioFromLuminance } from './okhsl-color-math';

const CONTRAST_WARN_CACHE_LIMIT = 256;
const contrastWarnCache = new Set<string>();

/**
 * Slack factor below the requested target before we emit a warning.
 * The contrast solver overshoots to absorb rounding noise, so an actual
 * value within ~2x that overshoot is effectively a pass.
 */
const CONTRAST_WARN_SLACK_WCAG = 0.98;
/** APCA Lc is on a 0–106 scale; allow a small absolute slack. */
const CONTRAST_WARN_SLACK_APCA = 1.5;

function schemeLabel(isDark: boolean, isHighContrast: boolean): string {
  if (isDark && isHighContrast) return 'darkContrast';
  if (isDark) return 'dark';
  if (isHighContrast) return 'lightContrast';
  return 'light';
}

function metricLabel(c: ResolvedContrast): string {
  return c.metric === 'apca'
    ? `APCA Lc ${c.target.toFixed(1)}`
    : `WCAG ${c.target.toFixed(2)}`;
}

function dedupe(key: string): boolean {
  if (contrastWarnCache.has(key)) return true;
  if (contrastWarnCache.size >= CONTRAST_WARN_CACHE_LIMIT) {
    contrastWarnCache.clear();
  }
  contrastWarnCache.add(key);
  return false;
}

/** Warn when the solver could not reach the requested contrast floor. */
export function warnContrastUnmet(
  name: string,
  isDark: boolean,
  isHighContrast: boolean,
  contrast: ResolvedContrast,
  actual: number,
): void {
  const slack =
    contrast.metric === 'apca'
      ? contrast.target - CONTRAST_WARN_SLACK_APCA
      : contrast.target * CONTRAST_WARN_SLACK_WCAG;
  if (actual >= slack) return;

  const scheme = schemeLabel(isDark, isHighContrast);
  const key = `unmet|${name}|${scheme}|${contrast.metric}|${contrast.target.toFixed(
    2,
  )}|${actual.toFixed(2)}`;
  if (dedupe(key)) return;

  console.warn(
    `glaze: color "${name}" cannot meet ${metricLabel(contrast)} in ` +
      `${scheme} scheme (got ${actual.toFixed(2)}). ` +
      `Try widening the tone window, lowering the contrast target, ` +
      `or picking a base color further from this color's tone.`,
  );
}

/**
 * Verification (§10): a chromatic swatch inherits the gray tone's
 * lightness but drifts in real luminance, so a contrast-floored color may
 * land slightly under the contrast its tone implies. Emit an advisory
 * warning when the actual measured contrast drifts below the target.
 */
export function warnContrastDrift(
  name: string,
  isDark: boolean,
  isHighContrast: boolean,
  contrast: ResolvedContrast,
  yColor: number,
  yBase: number,
): void {
  const actual =
    contrast.metric === 'apca'
      ? Math.abs(
          contrast.polarity === 'bg'
            ? apcaContrast(yBase, yColor)
            : apcaContrast(yColor, yBase),
        )
      : contrastRatioFromLuminance(yColor, yBase);

  const slack =
    contrast.metric === 'apca'
      ? contrast.target - CONTRAST_WARN_SLACK_APCA
      : contrast.target * CONTRAST_WARN_SLACK_WCAG;
  if (actual >= slack) return;

  const scheme = schemeLabel(isDark, isHighContrast);
  const key = `drift|${name}|${scheme}|${contrast.metric}|${contrast.target.toFixed(
    2,
  )}|${actual.toFixed(2)}`;
  if (dedupe(key)) return;

  console.warn(
    `glaze: color "${name}" drifts below ${metricLabel(contrast)} in ` +
      `${scheme} scheme (measured ${actual.toFixed(2)}). Chromatic luminance ` +
      `differs from the gray tone; nudge the tone or saturation if the floor matters.`,
  );
}
