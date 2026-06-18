/**
 * OKHST — the contrast-uniform tone space.
 *
 * OKHST is OKHSL with its lightness axis replaced by a contrast-uniform
 * "tone" axis. It shares `h` / `s` with OKHSL verbatim and swaps `l` for
 * `t`. This module owns:
 *
 * - the closed-form tone transfers (`toTone` / `fromTone`) at a fixed
 *   reference eps, plus the gray luminance helpers (`lToY` / `yToL`),
 * - the `{ h, s, t }` <-> `{ h, s, l }` color-space converters,
 * - the resolved-variant edge adapter (`variantToOkhsl`),
 * - the per-scheme tone mapping that replaced the Möbius dark curve
 *   (`mapToneForScheme`), the saturation reducers (dark desaturation +
 *   the cusp-anchored `saturationCeiling`), and the solver's scheme
 *   tone range.
 *
 * See `docs/okhst.md` for the full specification and the calibrated
 * default constants.
 */

import { clamp } from './hc-pair';
import { cuspLightness, toe, toeInv } from './okhsl-color-math';
import type { AdaptationMode, GlazeConfigResolved, ToneWindow } from './types';

/**
 * Reference eps for the OKHST color space. WCAG 2 contrast is
 * `(Y_hi + 0.05) / (Y_lo + 0.05)`, so an eps of `0.05` makes equal tone
 * steps yield equal WCAG contrast. This is the canonical eps used by
 * `okhst()` input, `{ h, s, t }` input, stored `ResolvedColorVariant.t`,
 * relative `tone` offsets, and the contrast solver.
 */
export const REF_EPS = 0.05;

// ============================================================================
// Gray luminance <-> OKHSL lightness (closed form)
// ============================================================================

/**
 * Gray luminance from OKHSL lightness. For an achromatic color the OKLab
 * lightness is `toeInv(l)` and luminance is its cube.
 */
export function lToY(l: number): number {
  const L = toeInv(l);
  return L * L * L;
}

/** OKHSL lightness from gray luminance — exact inverse of {@link lToY}. */
export function yToL(y: number): number {
  return toe(Math.cbrt(Math.max(0, y)));
}

// ============================================================================
// Tone transfers (luminance domain)
// ============================================================================

/**
 * Map a luminance `Y` (0–1) to tone (0–100) at the given eps.
 * `toneFromY(0) === 0` and `toneFromY(1) === 100` for any eps.
 */
export function toneFromY(y: number, eps: number = REF_EPS): number {
  const num = Math.log(y + eps) - Math.log(eps);
  const den = Math.log(1 + eps) - Math.log(eps);
  return (num / den) * 100;
}

/** Map a tone (0–100) back to luminance (0–1). Inverse of {@link toneFromY}. */
export function yFromTone(t: number, eps: number = REF_EPS): number {
  const den = Math.log(1 + eps) - Math.log(eps);
  return Math.exp((t / 100) * den + Math.log(eps)) - eps;
}

// ============================================================================
// Tone transfers (OKHSL lightness domain)
// ============================================================================

/** OKHSL lightness (0–1) -> tone (0–100). */
export function toTone(l: number, eps: number = REF_EPS): number {
  return toneFromY(lToY(l), eps);
}

/** Tone (0–100) -> OKHSL lightness (0–1). Inverse of {@link toTone}. */
export function fromTone(t: number, eps: number = REF_EPS): number {
  return yToL(yFromTone(t, eps));
}

// ============================================================================
// Color-space converters
// ============================================================================

/** Convert OKHST `{ h, s, t }` (t in 0–1) to OKHSL `{ h, s, l }`. */
export function okhstToOkhsl(c: { h: number; s: number; t: number }): {
  h: number;
  s: number;
  l: number;
} {
  return { h: c.h, s: c.s, l: clamp(fromTone(c.t * 100), 0, 1) };
}

/** Convert OKHSL `{ h, s, l }` to OKHST `{ h, s, t }` (t in 0–1). */
export function okhslToOkhst(c: { h: number; s: number; l: number }): {
  h: number;
  s: number;
  t: number;
} {
  return { h: c.h, s: c.s, t: clamp(toTone(c.l) / 100, 0, 1) };
}

/**
 * Edge adapter: a resolved variant stores canonical tone `t` (0–1). Convert
 * it to the OKHSL `{ h, s, l }` the formatters and luminance pipeline expect.
 */
export function variantToOkhsl(v: { h: number; s: number; t: number }): {
  h: number;
  s: number;
  l: number;
} {
  return { h: v.h, s: v.s, l: clamp(fromTone(v.t * 100), 0, 1) };
}

// ============================================================================
// Scheme tone mapping (replaces the Möbius dark curve)
// ============================================================================

/**
 * Normalize any {@link ToneWindow} form to `{ lo, hi, eps }`.
 * - `false`: full range `[0, 100]` at the reference eps (boundaries removed,
 *   curve preserved).
 * - `[lo, hi]`: endpoints at the reference eps (the common form).
 * - `{ lo, hi, eps }`: passed through (advanced eps tuning).
 */
export function normalizeToneWindow(win: ToneWindow): {
  lo: number;
  hi: number;
  eps: number;
} {
  if (win === false) return { lo: 0, hi: 100, eps: REF_EPS };
  if (Array.isArray(win)) return { lo: win[0], hi: win[1], eps: REF_EPS };
  return { lo: win.lo, hi: win.hi, eps: win.eps };
}

/**
 * Resolve the active tone window for a scheme as OKHSL-lightness endpoints.
 * - HC variants always return the full range `[0, 100]` with the mode eps.
 * - `false` (= "no clamping") is treated as `[0, 100]` with the reference eps.
 */
function activeWindow(
  isHighContrast: boolean,
  kind: 'light' | 'dark',
  config: GlazeConfigResolved,
): { lo: number; hi: number; eps: number } {
  const win = normalizeToneWindow(
    kind === 'dark' ? config.darkTone : config.lightTone,
  );
  if (isHighContrast) return { lo: 0, hi: 100, eps: win.eps };
  return win;
}

/**
 * Remap an authored tone (0–100) into a scheme window and return the final
 * OKHSL lightness (0–100). The window endpoints are OKHSL lightnesses; the
 * author tone is positioned within the window's tone interval (using the
 * window's render eps), then converted back to lightness.
 */
function remapToneToLightness(
  authorTone: number,
  win: { lo: number; hi: number; eps: number },
): number {
  const loT = toTone(win.lo / 100, win.eps);
  const hiT = toTone(win.hi / 100, win.eps);
  const winTone = loT + (authorTone / 100) * (hiT - loT);
  return clamp(fromTone(winTone, win.eps) * 100, 0, 100);
}

/**
 * Map an authored tone for a scheme and return the canonical stored tone
 * (0–100, reference eps).
 *
 * - `static`: identity — the same tone renders in every scheme.
 * - `auto` + dark: invert (`100 - tone`) then remap into the dark window.
 * - `auto`/`fixed` + light, or `fixed` + dark: remap, no inversion.
 *
 * The window remap uses the mode's render eps to land a final OKHSL
 * lightness; that lightness is then re-expressed as canonical tone so
 * relative offsets and contrast stay comparable across schemes.
 */
export function mapToneForScheme(
  authorTone: number,
  mode: AdaptationMode,
  isDark: boolean,
  isHighContrast: boolean,
  config: GlazeConfigResolved,
): number {
  if (mode === 'static') return clamp(authorTone, 0, 100);

  const kind = isDark ? 'dark' : 'light';
  const win = activeWindow(isHighContrast, kind, config);

  const inverted = isDark && mode === 'auto' ? 100 - authorTone : authorTone;
  const finalL = remapToneToLightness(clamp(inverted, 0, 100), win);
  return clamp(toTone(finalL / 100), 0, 100);
}

// ============================================================================
// Saturation
// ============================================================================

/** Dark-scheme desaturation reducer (unchanged from the legacy pipeline). */
export function mapSaturationDark(
  s: number,
  mode: AdaptationMode,
  config: GlazeConfigResolved,
): number {
  if (mode === 'static') return s;
  return s * (1 - config.darkDesaturation);
}

/**
 * Two-edge smoothstep: 0 below `e0`, 1 above `e1`, Hermite-eased between.
 * `smoothstep(e0, e1, x) = t*t*(3 - 2*t)` with `t = clamp((x - e0)/(e1 - e0))`.
 */
function smoothstep(e0: number, e1: number, x: number): number {
  if (e1 <= e0) return x < e0 ? 0 : 1;
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Cusp-anchored end shoulders — the plateau half-widths over which chroma is
 * held at full before easing to zero at the extreme. Mode-independent: the
 * taper keys on the rendered lightness `l`, so a swatch near white is tapered
 * identically in light and dark mode. The two values differ only by *end*
 * (toward black vs toward white) because the realizable color solid does not
 * taper symmetrically.
 */
const W_DARK = 0.45;
const W_LIGHT = 0.4;

/**
 * Cusp-anchored saturation ceiling.
 *
 * Reduces chroma toward the lightness extremes so ramps read as natural, with
 * a curve that is correct for any hue and asymmetric per end. The taper is
 * anchored at the hue's gamut cusp `lc` (where realizable chroma peaks) rather
 * than a fixed midpoint, and applied as a *ceiling* (`min(s, cap)`) so it only
 * tames colors that ask for more chroma than looks good at that lightness and
 * leaves intentionally muted colors untouched.
 *
 * Normalized distance from the cusp toward the nearest achromatic end
 * (`d = 0` at the cusp, `d = 1` at black on the dark side / white on the light
 * side) drives a plateau-and-shoulder envelope `f = 1 - smoothstep(w, 1, d)`:
 * `f = 1` out to the plateau half-width `w`, easing to `0` at the extreme.
 *
 * @param s Requested OKHSL saturation (0–1, already gamut-normalized).
 * @param l Rendered OKHSL lightness of the swatch (0–1).
 * @param h Hue (0–360).
 * @param sMax Global chroma ceiling (0–1) — the only per-mode lever.
 */
export function saturationCeiling(
  s: number,
  l: number,
  h: number,
  sMax: number,
): number {
  if (s <= 0) return s;
  const lc = cuspLightness(h);
  const d = l <= lc ? (lc - l) / lc : (l - lc) / (1 - lc);
  const w = l <= lc ? W_DARK : W_LIGHT;
  const f = 1 - smoothstep(w, 1, d);
  return Math.min(s, sMax * f);
}

// ============================================================================
// Solver support
// ============================================================================

/**
 * Tone search range (0–1) for the contrast solver in a given scheme.
 * `static` searches the full range; otherwise the scheme window's tone
 * endpoints (HC bypasses to full range).
 */
export function schemeToneRange(
  isDark: boolean,
  mode: AdaptationMode,
  isHighContrast: boolean,
  config: GlazeConfigResolved,
): [number, number] {
  if (mode === 'static') return [0, 1];
  const win = activeWindow(isHighContrast, isDark ? 'dark' : 'light', config);
  return [
    clamp(toTone(win.lo / 100) / 100, 0, 1),
    clamp(toTone(win.hi / 100) / 100, 0, 1),
  ];
}
