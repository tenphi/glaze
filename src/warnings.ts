/**
 * Resolve-time warning dispatcher: unmet contrast floors (regular colors and
 * mixes), chromatic contrast drift, out-of-reach shadow / glow steps (SDR, and
 * HDR glows whose headroom cap falls short), and a glow `headroom` clamped to
 * its 2-stop maximum. A validator that checks more fields after a clamp queues
 * that warning (`DeferredWarnings`) and sends it with `flushWarnings` only once
 * the whole input has passed.
 *
 * Tokens memoize their resolution, but a long-lived process (e.g. a dev
 * server with HMR) can re-resolve the same theme many times. The cache
 * here dedupes warnings within a session with a soft cap to keep noise
 * bounded.
 */

import { apcaContrast } from './contrast-solver';
import type { ResolvedContrast } from './contrast-solver';
import { MAX_HEADROOM } from './lighting';
import type { LightingKind, LightingResult } from './lighting';
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

/**
 * Whether `actual` is short of the floor by more than the slack. The solver
 * aims slightly past the target, so a smaller shortfall is rounding noise.
 */
function missesFloor(contrast: ResolvedContrast, actual: number): boolean {
  const slack =
    contrast.metric === 'apca'
      ? contrast.target - CONTRAST_WARN_SLACK_APCA
      : contrast.target * CONTRAST_WARN_SLACK_WCAG;
  return actual < slack;
}

function contrastKey(
  kind: string,
  name: string,
  scheme: string,
  contrast: ResolvedContrast,
  actual: number,
): string {
  return `${kind}|${name}|${scheme}|${contrast.metric}|${contrast.target.toFixed(
    2,
  )}|${actual.toFixed(2)}`;
}

/** Warn when the solver could not reach the requested contrast floor. */
export function warnContrastUnmet(
  name: string,
  isDark: boolean,
  isHighContrast: boolean,
  contrast: ResolvedContrast,
  actual: number,
): void {
  if (!missesFloor(contrast, actual)) return;

  const scheme = schemeLabel(isDark, isHighContrast);
  if (dedupe(contrastKey('unmet', name, scheme, contrast, actual))) return;

  console.warn(
    `glaze: color "${name}" cannot meet ${metricLabel(contrast)} in ` +
      `${scheme} scheme (got ${actual.toFixed(2)}). ` +
      `Try widening the tone window, lowering the contrast target, ` +
      `or picking a base color further from this color's tone.`,
  );
}

/**
 * Warn when a mix's ratio / opacity search could not reach its contrast floor
 * against the mix's `base`. An unmet mix means even the pure target falls
 * short, so the fix is the target color or the floor, not a tone window.
 * `actual` is the contrast of the value the mix settled at.
 */
export function warnMixContrastUnmet(
  name: string,
  isDark: boolean,
  isHighContrast: boolean,
  contrast: ResolvedContrast,
  actual: number,
): void {
  if (!missesFloor(contrast, actual)) return;

  const scheme = schemeLabel(isDark, isHighContrast);
  if (dedupe(contrastKey('unmet-mix', name, scheme, contrast, actual))) return;

  console.warn(
    `glaze: mix "${name}" cannot meet ${metricLabel(contrast)} against its ` +
      `base in ${scheme} scheme (got ${actual.toFixed(2)}). ` +
      `Even the pure target falls short; try lowering the contrast target ` +
      `or mixing toward a color further from the base.`,
  );
}

/**
 * Verification (the drift check in docs/okhst.mdx): a chromatic swatch
 * inherits the gray tone's lightness but drifts in real luminance, so a
 * contrast-floored color may land slightly under the contrast its tone
 * implies. Emit an advisory warning when the actual measured contrast
 * drifts below the target. The caller skips achromatic variants and ones the
 * solver already reported through `warnContrastUnmet`.
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

  if (!missesFloor(contrast, actual)) return;

  const scheme = schemeLabel(isDark, isHighContrast);
  if (dedupe(contrastKey('drift', name, scheme, contrast, actual))) return;

  console.warn(
    `glaze: color "${name}" drifts below ${metricLabel(contrast)} in ` +
      `${scheme} scheme (measured ${actual.toFixed(2)}). Chromatic luminance ` +
      `differs from the gray tone; nudge the tone or saturation if the floor matters.`,
  );
}

/** Tone slack before an out-of-reach shadow / glow step is worth a warning. */
const LIGHTING_WARN_SLACK = 0.05;

/**
 * Warn when a `shadow` / `glow` step is out of reach of its pigment — a glow
 * on white, a deep shadow on near-black — so the composite pins to the
 * pigment's strongest and lands short. `name` is omitted for the standalone
 * `glaze.shadow()` / `glaze.glow()` factories, which have no scheme either.
 */
export function warnLightingUnreachable(
  kind: 'shadow' | 'glow',
  name: string | undefined,
  scheme: { isDark: boolean; isHighContrast: boolean } | undefined,
  step: number,
  reached: number,
): void {
  if (reached >= step - LIGHTING_WARN_SLACK) return;

  const label = scheme
    ? schemeLabel(scheme.isDark, scheme.isHighContrast)
    : undefined;
  const key = `lighting|${kind}|${name ?? ''}|${label ?? ''}|${step.toFixed(
    2,
  )}|${reached.toFixed(2)}`;
  if (dedupe(key)) return;

  const subject = name === undefined ? `glaze.${kind}()` : `${kind} "${name}"`;
  const where = label === undefined ? '' : ` in ${label} scheme`;
  const extreme = kind === 'shadow' ? 'black' : 'white';
  console.warn(
    `glaze: ${subject} cannot reach a ${step.toFixed(1)}-tone step${where} ` +
      `(reached ${reached.toFixed(1)} at full strength). Lower the intensity, ` +
      `move the surface away from ${extreme}, or raise a tuned-down \`reach\`.`,
  );
}

/**
 * `1 stop`, `2 stops`, `1.5 stops`, `0.004 stops`: three significant digits,
 * so a small headroom never reads as `0 stops`.
 */
function stopsLabel(stops: number): string {
  const n = Number(stops.toPrecision(3));
  return `${n} stop${n === 1 ? '' : 's'}`;
}

/**
 * Warn when an HDR glow's gain is capped by its `headroom` short of the step:
 * the brightest channel sits at `2^headroom` and the composite lands
 * `reached` tones above the surface instead of `step`. Replaces the SDR
 * shortfall warning for that variant — when the cap does not bind, HDR covers
 * the step and neither warning fires. `name` / `scheme` are omitted for the
 * standalone `glaze.glow()`.
 */
export function warnHdrUnreachable(
  name: string | undefined,
  scheme: { isDark: boolean; isHighContrast: boolean } | undefined,
  step: number,
  reached: number,
  headroom: number,
): void {
  if (reached >= step - LIGHTING_WARN_SLACK) return;

  const label = scheme
    ? schemeLabel(scheme.isDark, scheme.isHighContrast)
    : undefined;
  const key = `hdr|${name ?? ''}|${label ?? ''}|${step.toFixed(
    2,
  )}|${reached.toFixed(2)}|${headroom}`;
  if (dedupe(key)) return;

  const subject = name === undefined ? 'glaze.glow()' : `glow "${name}"`;
  const where = label === undefined ? '' : ` in ${label} scheme`;
  const advice =
    headroom >= MAX_HEADROOM
      ? `Lower the intensity; \`headroom\` is already at its ${MAX_HEADROOM}-stop maximum.`
      : 'Lower the intensity or raise `headroom`.';
  console.warn(
    `glaze: ${subject} cannot reach a ${step.toFixed(1)}-tone step${where} ` +
      `even with ${stopsLabel(headroom)} of headroom ` +
      `(reached ${reached.toFixed(1)}). ${advice}`,
  );
}

/**
 * Report a shadow / glow solve that lands short. A glow with an HDR value
 * (the author opted into headroom) warns only when the headroom cap leaves
 * the step short (`warnHdrUnreachable`); everything else gets the SDR
 * shortfall warning (`warnLightingUnreachable`), unchanged at headroom 0.
 */
export function warnLightingShortfall(
  kind: LightingKind,
  name: string | undefined,
  scheme: { isDark: boolean; isHighContrast: boolean } | undefined,
  result: LightingResult,
  headroom: number,
): void {
  if (result.hdr) {
    warnHdrUnreachable(name, scheme, result.step, result.hdr.reached, headroom);
  } else {
    warnLightingUnreachable(kind, name, scheme, result.step, result.reached);
  }
}

/**
 * Warnings a validator found, queued until the whole input has passed. Every
 * warning here is deduped for the session, so one sent by a call that then
 * throws on a later field would leave the corrected retry — the call that
 * actually applies the value — silent.
 */
export type DeferredWarnings = (() => void)[];

/** Send the queued warnings, in the order they were found. */
export function flushWarnings(deferred: DeferredWarnings): void {
  for (const warn of deferred) warn();
}

/**
 * Warn, once per field and value, that a glow `headroom` above the maximum was
 * clamped. The likely cause is a ratio typed where stops were meant (`4` for
 * "4× white", which is 2 stops), so the message spells out the unit.
 */
export function warnHeadroomClamped(where: string, value: number): void {
  if (dedupe(`headroom|${where}|${value}`)) return;
  console.warn(
    `glaze: ${where}.headroom ${value} is above the ${MAX_HEADROOM}-stop ` +
      `maximum; using ${MAX_HEADROOM}. Headroom counts stops (doublings of SDR white's ` +
      `luminance), not a ratio: 1 stop is 2× white, 2 stops 4×.`,
  );
}
