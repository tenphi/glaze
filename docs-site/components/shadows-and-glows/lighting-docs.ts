/**
 * Measurement helpers for the shadow / glow / mix examples.
 *
 * A translucent color only means something over the surface it composites
 * onto, so these helpers model what the browser paints — `source-over` on
 * gamma-encoded sRGB, the same model Glaze solves against — and report the
 * result in tone (the WCAG-shaped luminance axis Glaze measures steps on).
 */

import {
  glaze,
  okhslToLinearSrgb,
  relativeLuminanceFromLinearRgb,
  toneFromY,
  variantToOkhsl,
} from '../../../src/index.ts';
import {
  compositeOverGamma,
  toDisplayGamma,
} from '../../../src/okhsl-color-math.ts';
import type {
  GlowColorDef,
  ResolvedColorVariant,
  ShadowColorDef,
} from '../../../src/index.ts';
import {
  DEFAULT_LIGHTING_TUNING,
  objectFactor,
} from '../../../src/lighting.ts';
import { inkForLuminance } from '../glaze-docs';
import type { Scheme } from '../glaze-docs';

export { DEFAULT_LIGHTING_TUNING, objectFactor };

function linear(v: ResolvedColorVariant) {
  const { h, s, l } = variantToOkhsl(v);
  return okhslToLinearSrgb(h, s, l, v.pastel ?? false);
}

/** Tone (0–100) of an opaque color's luminance. */
export function luminanceTone(v: ResolvedColorVariant): number {
  return toneFromY(relativeLuminanceFromLinearRgb(linear(v)));
}

/** Tone of `over` (with its alpha) composited onto the opaque `under`. */
export function compositeTone(
  over: ResolvedColorVariant,
  under: ResolvedColorVariant,
): number {
  const rgb = compositeOverGamma(
    toDisplayGamma(linear(under)),
    toDisplayGamma(linear(over)),
    over.alpha,
  );
  return toneFromY(relativeLuminanceFromLinearRgb(rgb));
}

/** Signed tone step `over` paints onto `under`: negative darkens. */
export function stepOf(
  over: ResolvedColorVariant,
  under: ResolvedColorVariant,
): number {
  return compositeTone(over, under) - luminanceTone(under);
}

/** Linear sRGB of `over` composited onto `under`, for contrast measurements. */
export function compositeLinear(
  over: ResolvedColorVariant,
  under: ResolvedColorVariant,
) {
  return compositeOverGamma(
    toDisplayGamma(linear(under)),
    toDisplayGamma(linear(over)),
    over.alpha,
  );
}

/**
 * Black or white text ink for `over` composited onto `under`: whichever has
 * more WCAG contrast on what the browser actually paints.
 */
export function compositeInk(
  over: ResolvedColorVariant,
  under: ResolvedColorVariant,
): string {
  return inkForLuminance(
    relativeLuminanceFromLinearRgb(compositeLinear(over, under)),
  );
}

/** A translucent color's pigment at full opacity, as CSS `rgb()`. */
export function opaqueCss(v: ResolvedColorVariant): string {
  return glaze.format({ ...v, alpha: 1 }, 'rgb');
}

/** `−6.0` / `+6.0`: a signed step with a typographic minus. */
export function signed(n: number, digits = 1): string {
  const s = Math.abs(n).toFixed(digits);
  if (Number(s) === 0) return s;
  return n < 0 ? `−${s}` : `+${s}`;
}

/**
 * Run `fn` with Glaze's resolve-time warnings held back. For demos that show
 * an out-of-reach step on purpose: the figure reports what was reached, so
 * the expected `console.warn` would only be build noise.
 */
export function quietly<T>(fn: () => T): T {
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].startsWith('glaze: ')) return;
    original(...args);
  };
  try {
    return fn();
  } finally {
    console.warn = original;
  }
}

/**
 * The signed step a `shadow` / `glow` def asks for in one scheme: its
 * intensity (the high-contrast half of a pair in a contrast scheme) times
 * the object factor `k`.
 */
export function askedStep(
  def: ShadowColorDef | GlowColorDef,
  scheme: Scheme,
  bg: ResolvedColorVariant,
  fg?: ResolvedColorVariant,
): number {
  const hc = scheme === 'lightContrast' || scheme === 'darkContrast';
  const intensity = Array.isArray(def.intensity)
    ? def.intensity[hc ? 1 : 0]
    : def.intensity;
  const k = objectFactor(
    def.type,
    bg.t * 100,
    fg === undefined ? undefined : fg.t * 100,
    def.tuning?.objectInfluence ?? DEFAULT_LIGHTING_TUNING.objectInfluence,
  );
  return (def.type === 'shadow' ? -1 : 1) * intensity * k;
}

/** `−4.0`, or `0.0 of −4.0` when the overlay could not reach its step. */
export function stepLabel(got: number, asked: number): string {
  return Math.abs(got - asked) < 0.05
    ? signed(got)
    : `${signed(got)} of ${signed(asked)}`;
}
