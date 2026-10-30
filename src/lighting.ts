/**
 * Shadow and glow color computation.
 *
 * Owns the shadow / glow / mix def predicates, the default lighting tuning
 * and its merge, and the exact lighting solver (`computeLighting`). Both
 * types emit a translucent pigment over a known surface (`bg`) whose opacity
 * is solved so the composite lands an exact tone step away from it: darker
 * for `shadow`, lighter for `glow`, in every scheme. Compositing is modeled
 * the way browsers paint it — `source-over` on gamma-encoded sRGB — and the
 * step is measured in the WCAG-shaped tone of the composite's luminance, so
 * it holds on chromatic surfaces too. An optional object (`fg`) scales the
 * step the way bounce light does. The resolver consumes this module per
 * scheme variant; `glaze.shadow()` / `glaze.glow()` call it directly.
 */

import {
  compositeOverGamma,
  okhslToLinearSrgb,
  relativeLuminanceFromLinearRgb,
  toDisplayGamma,
} from './okhsl-color-math';
import { clamp } from './hc-pair';
import { fromTone, toTone, toneFromY } from './okhst';
import type {
  ColorDef,
  GlowColorDef,
  LightingTuning,
  MixColorDef,
  ShadowColorDef,
} from './types';

export type LightingKind = 'shadow' | 'glow';

/** OKHSL color fed to the lighting solver (`h` 0–360, `s` / `l` 0–1). */
export interface LightingColor {
  h: number;
  s: number;
  l: number;
  /** Gamut flag for this color's own sRGB conversion. */
  pastel?: boolean;
}

/** Output of {@link computeLighting}. */
export interface LightingResult {
  /** Pigment hue (0–360). */
  h: number;
  /** Pigment OKHSL saturation (0–1). */
  s: number;
  /** Pigment OKHSL lightness (0–1). */
  l: number;
  /** Solved pigment opacity (0–1). */
  alpha: number;
  /** Requested tone step: `intensity × k`. */
  step: number;
  /** Tone step the composite actually lands. Below `step` only when unreachable. */
  reached: number;
}

export function isShadowDef(def: ColorDef): def is ShadowColorDef {
  return (def as ShadowColorDef).type === 'shadow';
}

export function isGlowDef(def: ColorDef): def is GlowColorDef {
  return (def as GlowColorDef).type === 'glow';
}

/** A `shadow` or `glow` def — the translucent overlay types. */
export function isLightingDef(
  def: ColorDef,
): def is ShadowColorDef | GlowColorDef {
  return isShadowDef(def) || isGlowDef(def);
}

export function isMixDef(def: ColorDef): def is MixColorDef {
  return (def as MixColorDef).type === 'mix';
}

export const DEFAULT_LIGHTING_TUNING: Required<LightingTuning> = {
  objectInfluence: 0.5,
  tint: 0,
  reach: 1,
  hueBleed: 0,
};

/** Defaults ← global (`shadowTuning` / `glowTuning`) ← per-color, field by field. */
export function resolveLightingTuning(
  perColor?: LightingTuning,
  globalTuning?: LightingTuning,
): Required<LightingTuning> {
  return { ...DEFAULT_LIGHTING_TUNING, ...globalTuning, ...perColor };
}

export function circularLerp(a: number, b: number, t: number): number {
  let diff = b - a;
  if (diff > 180) diff -= 360;
  else if (diff < -180) diff += 360;
  return (((a + diff * t) % 360) + 360) % 360;
}

const SAT_EPSILON = 1e-6;
const BISECT_ITERATIONS = 40;
const GOLDEN = (Math.sqrt(5) - 1) / 2;

/**
 * Object factor `k = max(0, 1 + β · d · (t_bg − t_fg) / 100)`, with `d = +1`
 * for a shadow and `−1` for a glow. Calibrated so an object at the surface's
 * own tone — or no object at all — gives exactly the authored step: a darker
 * object deepens its shadow, a lighter one strengthens its glow.
 */
export function objectFactor(
  kind: LightingKind,
  bgTone: number,
  fgTone: number | undefined,
  objectInfluence: number,
): number {
  if (fgTone === undefined) return 1;
  const d = kind === 'shadow' ? 1 : -1;
  return Math.max(0, 1 + (objectInfluence * d * (bgTone - fgTone)) / 100);
}

/**
 * The pigment: pure black (shadow) / pure white (glow) by default. `reach`
 * below 1 parks it part of the way from the surface's tone to that extreme so
 * a `tint` — saturation in the surface's hue, optionally pulled toward the
 * object's hue by `hueBleed` — can show.
 */
function pigmentFor(
  kind: LightingKind,
  bg: LightingColor,
  fg: LightingColor | undefined,
  bgTone: number,
  tuning: Required<LightingTuning>,
): { h: number; s: number; l: number } {
  const reach = clamp(tuning.reach, 0, 1);
  const tone =
    kind === 'shadow' ? bgTone * (1 - reach) : bgTone + (100 - bgTone) * reach;
  const bleed = clamp(tuning.hueBleed, 0, 1);
  const h =
    fg !== undefined && fg.s > SAT_EPSILON && bleed > 0
      ? circularLerp(bg.h, fg.h, bleed)
      : bg.h;
  return { h, s: clamp(tuning.tint, 0, 1), l: clamp(fromTone(tone), 0, 1) };
}

/**
 * Solve the pigment opacity that moves `bg` exactly `intensity × k` tones
 * darker (shadow) or lighter (glow) once the browser composites it.
 *
 * The composite's luminance is convex in alpha (each gamma channel moves
 * linearly and the sRGB decode is convex), so the "has reached the step"
 * predicate is monotone whenever full opacity reaches it and a bisection
 * lands it exactly. When it doesn't, the step is out of reach — a glow on
 * white, a deep shadow on near-black — and the result pins to the pigment's
 * strongest composite, reporting what it reached in `reached`.
 */
export function computeLighting(
  kind: LightingKind,
  bg: LightingColor,
  fg: LightingColor | undefined,
  intensity: number,
  tuning: Required<LightingTuning>,
  pastel: boolean,
): LightingResult {
  const bgTone = toTone(bg.l);
  const k = objectFactor(
    kind,
    bgTone,
    fg === undefined ? undefined : toTone(fg.l),
    tuning.objectInfluence,
  );
  const step = clamp(intensity, 0, 100) * k;
  const pigment = pigmentFor(kind, bg, fg, bgTone, tuning);

  const bgGamma = toDisplayGamma(
    okhslToLinearSrgb(bg.h, bg.s, bg.l, bg.pastel ?? pastel),
  );
  const pigmentGamma = toDisplayGamma(
    okhslToLinearSrgb(pigment.h, pigment.s, pigment.l, pastel),
  );
  const toneAt = (alpha: number): number =>
    toneFromY(
      relativeLuminanceFromLinearRgb(
        compositeOverGamma(bgGamma, pigmentGamma, alpha),
      ),
    );
  const surfaceTone = toneAt(0);
  const d = kind === 'shadow' ? 1 : -1;
  const gain = (alpha: number): number => d * (surfaceTone - toneAt(alpha));

  if (step <= 0) return { ...pigment, alpha: 0, step, reached: 0 };

  // The predicate is monotone on [0, hi] once `gain(hi)` reaches the step.
  let hi = 1;
  if (gain(1) < step) {
    hi = kind === 'shadow' ? strongestShadowAlpha(gain) : 1;
    const reached = gain(hi);
    if (reached < step) {
      // A pigment that cannot move the surface at all stays fully transparent.
      return reached > 0
        ? { ...pigment, alpha: hi, step, reached }
        : { ...pigment, alpha: 0, step, reached: 0 };
    }
  }

  let lo = 0;
  for (let i = 0; i < BISECT_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    if (gain(mid) < step) lo = mid;
    else hi = mid;
  }
  return { ...pigment, alpha: hi, step, reached: gain(hi) };
}

/**
 * Opacity of a shadow pigment's darkest composite. Full opacity for pure
 * black; a tinted pigment whose channels pull in different directions can
 * bottom out earlier, so a golden-section search over the unimodal gain finds
 * it and the better of that and full opacity wins. (A glow needs no search:
 * convex luminance peaks at an endpoint, and full opacity is the one that
 * lightens.)
 */
function strongestShadowAlpha(gain: (alpha: number) => number): number {
  let a = 0;
  let b = 1;
  for (let i = 0; i < BISECT_ITERATIONS; i++) {
    const c = b - GOLDEN * (b - a);
    const e = a + GOLDEN * (b - a);
    if (gain(c) < gain(e)) a = c;
    else b = e;
  }
  const peak = (a + b) / 2;
  return gain(peak) > gain(1) ? peak : 1;
}
