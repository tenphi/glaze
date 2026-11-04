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
 *
 * HDR glows: with `glowTuning.headroom` above 0, a glow whose target tone
 * (surface tone + step) passes 100 also gets an HDR value, computed in closed
 * form after the untouched SDR solve. SDR is pinned at its brightest there —
 * the pigment at opacity 1, or a white surface at opacity 0 — and the HDR
 * value is an opaque exposure of that color: the base times `2^exposure`, the
 * gain that lands the exact step, capped per channel at `2^headroom`
 * (`MAX_HEADROOM` stops at most). A pigment that cannot lift a non-white
 * surface at all gets none and keeps the SDR shortfall warning. Since the
 * value lands the whole step, only a full-reach glow meets SDR at the boundary
 * (`exposure` → 0); one with `reach` below 1 jumps from its pigment to the
 * exact step. `hdrToLinearSrgb` turns a resolved HDR value back into linear
 * sRGB for the writers.
 */

import {
  compositeOverGamma,
  okhslToLinearSrgb,
  okhslToOklab,
  oklabToOkhsl,
  relativeLuminanceFromLinearRgb,
  toDisplayGamma,
} from './okhsl-color-math';
import { clamp } from './hc-pair';
import {
  fromTone,
  okhslToOkhst,
  okhstToOkhsl,
  toTone,
  toneFromY,
  yFromTone,
} from './okhst';
import type {
  ColorDef,
  GlowColorDef,
  GlowTuning,
  LightingTuning,
  MixColorDef,
  ResolvedHdr,
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
  /**
   * HDR value of a glow whose target tone passes 100 with `headroom` above 0,
   * when SDR is pinned at its brightest (see `pinnedBase`); absent otherwise.
   * The SDR fields above are unchanged by it.
   */
  hdr?: LightingHdr;
}

/** The HDR value in a {@link LightingResult}. */
export interface LightingHdr {
  /**
   * Base hue (0–360). The base is what SDR paints at its brightest, opaque:
   * the pigment, or the white surface it cannot lift.
   */
  h: number;
  /** Base OKHSL saturation (0–1, always non-pastel). */
  s: number;
  /** Base OKHSL lightness (0–1). */
  l: number;
  /** Gain over the base in stops, above 0. */
  exposure: number;
  /**
   * Tone step the exposed base lands above the surface: `step`, or less when
   * the `headroom` cap binds.
   */
  reached: number;
}

/** Most stops of HDR headroom a glow may use; larger values clamp to it. */
export const MAX_HEADROOM = 2;

/**
 * A merged tuning: every {@link LightingTuning} field, plus the glow-only
 * `headroom` in stops (0 for a shadow, which never carries one).
 */
export type ResolvedLightingTuning = Required<LightingTuning> & {
  headroom: number;
};

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

/**
 * Defaults ← global (`shadowTuning` / `glowTuning`) ← per-color, field by
 * field. `headroom` defaults to 0 and clamps to `0–MAX_HEADROOM`; the config
 * and def validators have already rejected a non-finite or negative value and
 * warned about one above the maximum.
 */
export function resolveLightingTuning(
  perColor?: GlowTuning,
  globalTuning?: GlowTuning,
): ResolvedLightingTuning {
  const headroom = perColor?.headroom ?? globalTuning?.headroom ?? 0;
  return {
    ...DEFAULT_LIGHTING_TUNING,
    ...globalTuning,
    ...perColor,
    headroom: clamp(headroom, 0, MAX_HEADROOM),
  };
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
/** Float noise a target tone may sit above 100 without counting as HDR. */
const HDR_TRIGGER_EPS = 1e-9;
/** Float noise a surface tone may sit below 100 and still count as white. */
const WHITE_SURFACE_EPS = 1e-6;

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
 *
 * A glow with `headroom` above 0 whose target tone passes 100 also gets
 * `hdr` (see `exposeGlow`) when SDR is pinned at its brightest
 * (`pinnedBase`); the SDR fields are the same with or without it.
 */
export function computeLighting(
  kind: LightingKind,
  bg: LightingColor,
  fg: LightingColor | undefined,
  intensity: number,
  tuning: Required<LightingTuning> & GlowTuning,
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

  const { alpha, reached } = solveOpacity(kind, gain, step);
  const result: LightingResult = { ...pigment, alpha, step, reached };

  const headroom = tuning.headroom ?? 0;
  if (kind === 'glow' && headroom > 0 && step > 0) {
    const base = pinnedBase(alpha, surfaceTone, pigment, bg, pastel);
    const hdr =
      base === undefined
        ? undefined
        : exposeGlow(base, surfaceTone, step, headroom);
    if (hdr !== undefined) result.hdr = hdr;
  }
  return result;
}

/**
 * The SDR opacity solve: the smallest opacity whose composite reaches `step`,
 * or — out of reach — the pigment's strongest composite.
 */
function solveOpacity(
  kind: LightingKind,
  gain: (alpha: number) => number,
  step: number,
): { alpha: number; reached: number } {
  if (step <= 0) return { alpha: 0, reached: 0 };

  // The predicate is monotone on [0, hi] once `gain(hi)` reaches the step.
  let hi = 1;
  if (gain(1) < step) {
    hi = kind === 'shadow' ? strongestShadowAlpha(gain) : 1;
    const reached = gain(hi);
    if (reached < step) {
      // A pigment that cannot move the surface at all stays fully transparent.
      return reached > 0 ? { alpha: hi, reached } : { alpha: 0, reached: 0 };
    }
  }

  let lo = 0;
  for (let i = 0; i < BISECT_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    if (gain(mid) < step) lo = mid;
    else hi = mid;
  }
  return { alpha: hi, reached: gain(hi) };
}

/** An OKHSL color in the standard (non-pastel) space the HDR base uses. */
function standardOkhsl(
  c: { h: number; s: number; l: number },
  pastel: boolean,
): { h: number; s: number; l: number } {
  if (!pastel) return { h: c.h, s: c.s, l: c.l };
  const [h, s, l] = oklabToOkhsl(okhslToOklab(c.h, c.s, c.l, true));
  return { h, s, l };
}

/**
 * What SDR paints once it is pinned at its brightest, as standard OKHSL — the
 * only color an HDR glow exposes. Past white SDR cannot land the step, so the
 * solved opacity is 0 or 1 there: at 1 that is the pigment itself; at 0 it is
 * the surface, which counts only when it is white (no pigment can lift white,
 * and SDR shows white). A pigment that cannot lift a non-white surface at all
 * — `reach: 0`, say, or a `tint` that only darkens — paints nothing in SDR, so
 * there is nothing to expose: an exposure of the bare surface would be an
 * opaque, brighter copy of it where SDR leaves the surface showing, and a
 * neutral one clips to opaque white wherever HDR is clamped. `undefined` then
 * (and for any opacity between, which only float noise at the trigger
 * reaches).
 */
function pinnedBase(
  alpha: number,
  surfaceTone: number,
  pigment: { h: number; s: number; l: number },
  bg: LightingColor,
  pastel: boolean,
): { h: number; s: number; l: number } | undefined {
  if (alpha === 1) return standardOkhsl(pigment, pastel);
  if (alpha === 0 && surfaceTone >= 100 - WHITE_SURFACE_EPS) {
    return standardOkhsl(bg, bg.pastel ?? pastel);
  }
  return undefined;
}

/**
 * HDR value of a glow past white: an opaque exposure of `base` — what SDR
 * paints at its brightest (`pinnedBase`), as standard OKHSL — by the gain that
 * lands the target tone `surfaceTone + step`, capped so no channel passes
 * `2^headroom` (displays clip per channel; for a neutral base that is a cap on
 * luminance). `undefined` when the target stays at or below 100 — the trigger
 * depends on the target alone — or when the base is black and has nothing to
 * expose.
 *
 * Tone runs past 100 unchanged (`toneFromY` / `yFromTone` are unclamped), so
 * equal tone steps above white are still equal `Y + 0.05` ratios. The gain is
 * measured on the base as stored, so base × `2^exposure` lands the step to
 * float precision. It lands the whole step, not just the part past white: a
 * base at white (full `reach`) meets SDR with `exposure` → 0 as the target
 * goes to 100⁺, while a base below white (`reach` under 1) starts at
 * `log2(Y(100) / Y(base))` — just under white SDR stays short at the pigment
 * and warns; just past it HDR lands the exact step.
 */
function exposeGlow(
  base: { h: number; s: number; l: number },
  surfaceTone: number,
  step: number,
  headroom: number,
): LightingHdr | undefined {
  const target = surfaceTone + step;
  if (!(target > 100 + HDR_TRIGGER_EPS)) return undefined;

  const linear = okhslToLinearSrgb(base.h, base.s, base.l);
  const yBase = relativeLuminanceFromLinearRgb(linear);
  const peak = Math.max(linear[0], linear[1], linear[2]);
  if (!(yBase > 0) || !(peak > 0)) return undefined;

  const m = Math.min(yFromTone(target) / yBase, 2 ** headroom / peak);
  if (!(m > 1)) return undefined;
  return {
    ...base,
    exposure: Math.log2(m),
    reached: toneFromY(yBase * m) - surfaceTone,
  };
}

/** The solver's HDR value (OKHSL base) as a `ResolvedHdr` (OKHST base). */
export function toResolvedHdr(hdr: LightingHdr): ResolvedHdr {
  const { h, s, t } = okhslToOkhst(hdr);
  return { h, s, t, exposure: hdr.exposure };
}

/**
 * Linear sRGB of a resolved HDR value: the base's channels times
 * `2^exposure`, unclamped (the brightest channel can reach `2^headroom`).
 * The base is non-pastel OKHSL, so no `pastel` flag applies.
 */
export function hdrToLinearSrgb(hdr: ResolvedHdr): [number, number, number] {
  const { h, s, l } = okhstToOkhsl(hdr);
  const [r, g, b] = okhslToLinearSrgb(h, s, l);
  const m = 2 ** hdr.exposure;
  return [r * m, g * m, b * m];
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
