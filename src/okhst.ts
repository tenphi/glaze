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
 *   (`mapToneForScheme`) and its per-scheme inverses (`unmapLightTone` /
 *   `unmapDarkTone`, which the resolver uses to find where a base sits on the
 *   authored scale), the dark desaturation reducer, and the scheme tone range
 *   that clamps a contrast-solved color's preferred tone,
 * - the scheme tone window — validated and clamped by `normalizeToneWindow` —
 *   including the high-contrast bypass and its continuous generalization under
 *   a manual contrast level.
 *
 * See `docs/okhst.mdx` for the full specification and the calibrated
 * default constants.
 */

import { clamp, contrastFraction, lerp } from './hc-pair';
import { toe, toeInv } from './okhsl-color-math';
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
 * it to the OKHSL `{ h, s, l }` the formatters and luminance pipeline expect —
 * `s` and `l` on the same 0–1 factor scale, so `const { h, s, l } =
 * variantToOkhsl(v)` destructures straight into `formatOkhsl` / `formatRgb` /
 * `okhslToLinearSrgb` with no rescaling. `alpha` stays on the variant; use
 * `glaze.format(v, format)` for a string that carries it.
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
 * Largest render eps a tone window accepts. The transfers divide by
 * `log(1 + eps) - log(eps)`, which loses precision as eps grows (colors are
 * visibly wrong by ~1e14) and cancels to 0 — `NaN` tones — from ~1e15. At 1e6
 * the tone ↔ luminance round trip still holds to ~1e-9, and past ~1e3 the
 * curve is already linear in luminance, so the cap costs nothing usable.
 */
const MAX_WINDOW_EPS = 1e6;

/**
 * Normalize any {@link ToneWindow} form to `{ lo, hi, eps }`, validated.
 * - `false`: full range `[0, 100]` at the reference eps (boundaries removed,
 *   curve preserved).
 * - `[lo, hi]`: endpoints at the reference eps (the common form).
 * - `{ lo, hi, eps }`: an explicit render eps (advanced eps tuning).
 *
 * A bad window never fails on its own — `[90, 20]` silently inverts the scale
 * and an `eps` of 0 turns every tone into `NaN` — so this throws a `glaze:`
 * error when the value is none of the three forms, an endpoint is not a finite
 * number, `lo > hi`, or `eps` is not a finite number in `(0, MAX_WINDOW_EPS]`.
 * Endpoints then clamp into `[0, 100]`, the OKHSL lightness range. `lo === hi`
 * is allowed: a zero-width window renders every tone at that one lightness.
 *
 * `field` names the window in the error message (`lightTone` / `darkTone`).
 */
export function normalizeToneWindow(
  win: ToneWindow,
  field = 'tone window',
): { lo: number; hi: number; eps: number } {
  if (win === false) return { lo: 0, hi: 100, eps: REF_EPS };
  // Numbers via `String` (`JSON.stringify(NaN)` is "null"); anything else via
  // JSON, so a string shows its quotes and an array its shape.
  const show = (value: unknown): string =>
    typeof value === 'number' || value === undefined
      ? String(value)
      : (JSON.stringify(value) ?? String(value));
  const raw: unknown = win;
  let lo: unknown;
  let hi: unknown;
  let eps: unknown = REF_EPS;
  if (Array.isArray(raw) && raw.length === 2) {
    [lo, hi] = raw;
  } else if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    ({ lo, hi, eps } = raw as Record<string, unknown>);
  } else {
    throw new Error(
      `glaze: ${field} must be [lo, hi], { lo, hi, eps }, or false (got ${show(raw)}).`,
    );
  }
  for (const [name, value] of [
    ['lo', lo],
    ['hi', hi],
  ] as const) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(
        `glaze: ${field} ${name} must be a finite number (got ${show(value)}).`,
      );
    }
  }
  if (
    typeof eps !== 'number' ||
    !Number.isFinite(eps) ||
    eps <= 0 ||
    eps > MAX_WINDOW_EPS
  ) {
    throw new Error(
      `glaze: ${field} eps must be a finite number above 0 and at most 1e6 (got ${show(eps)}).`,
    );
  }
  const from = lo as number;
  const to = hi as number;
  if (from > to) {
    throw new Error(
      `glaze: ${field} lo (${from}) is above hi (${to}). A window runs from ` +
        `its dark end to its light end: [lo, hi] with lo ≤ hi, e.g. [${to}, ${from}].`,
    );
  }
  return { lo: clamp(from, 0, 100), hi: clamp(to, 0, 100), eps };
}

/**
 * Resolve the active tone window for a scheme as OKHSL-lightness endpoints.
 * - HC variants always return the full range `[0, 100]` with the mode eps.
 * - Under a manual `contrastLevel`, each endpoint is interpolated toward that
 *   full range: light `10 → 0` / `100 → 100`, dark `15 → 0` / `95 → 100`. The
 *   endpoints are exact — level 0 returns the configured window and level 100
 *   the same literal the HC branch returns.
 * - `false` (= "no clamping") is treated as `[0, 100]` with the reference eps,
 *   and is therefore level-invariant.
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
  const f = contrastFraction(config);
  if (f === undefined || f <= 0) return win;
  if (f >= 1) return { lo: 0, hi: 100, eps: win.eps };
  // The render eps is not interpolated — HC keeps the configured eps today, so
  // the ramp does too.
  return { lo: lerp(win.lo, 0, f), hi: lerp(win.hi, 100, f), eps: win.eps };
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
 *
 * A manual `contrastLevel` widens the window continuously (see
 * `activeWindow`); inversion is unaffected.
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

/**
 * Inverse of {@link remapToneToLightness} on canonical tone: the position
 * (0–100) in the window that renders at a stored canonical tone. A tone outside
 * the window comes back outside `0–100`; a zero-width window has no inverse, so
 * the tone is returned unchanged.
 */
function unmapWindow(
  tone: number,
  win: { lo: number; hi: number; eps: number },
): number {
  const loT = toTone(win.lo / 100, win.eps);
  const hiT = toTone(win.hi / 100, win.eps);
  if (hiT === loT) return tone;

  const winTone = toTone(fromTone(tone), win.eps);
  return ((winTone - loT) / (hiT - loT)) * 100;
}

/**
 * Inverse of the light branch of {@link mapToneForScheme}: the authored tone
 * (0–100) that the active light window places at a stored canonical tone.
 * `static` is the identity, like the forward map. A tone outside the window
 * comes back outside `0–100` (callers clamp); a zero-width window has no
 * inverse, so the tone is returned unchanged.
 */
export function unmapLightTone(
  tone: number,
  mode: AdaptationMode,
  isHighContrast: boolean,
  config: GlazeConfigResolved,
): number {
  if (mode === 'static') return tone;
  return unmapWindow(tone, activeWindow(isHighContrast, 'light', config));
}

/**
 * Inverse of the dark branch of {@link mapToneForScheme}: the authored tone
 * (0–100) that the active dark window places at a stored canonical tone —
 * inverted back (`100 - position`) under `auto`, as is under `fixed`, and the
 * identity under `static`. A tone outside the window comes back outside
 * `0–100` (a contrast floor can push a color past the window; callers clamp);
 * a zero-width window has no inverse, so only the inversion is undone.
 */
export function unmapDarkTone(
  tone: number,
  mode: AdaptationMode,
  isHighContrast: boolean,
  config: GlazeConfigResolved,
): number {
  if (mode === 'static') return tone;
  const position = unmapWindow(
    tone,
    activeWindow(isHighContrast, 'dark', config),
  );
  return mode === 'auto' ? 100 - position : position;
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

// ============================================================================
// Solver support
// ============================================================================

/**
 * A scheme's window as canonical tone endpoints (0–1): `[0, 1]` for `static`,
 * otherwise the active window's `lo` / `hi` (HC bypasses to the full range, a
 * manual `contrastLevel` widens toward it — see `activeWindow`).
 *
 * The resolver uses it only to clamp a contrast-solved color's *preferred*
 * tone into the window before the solve. It is not the solver's search range:
 * the solver always searches the full `[0, 1]`, so a contrast floor can push a
 * color outside the window when the window can't meet it.
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
