/**
 * Throwaway calibration script for the OKHST tone rewrite.
 *
 * Goal: pick `(lo, hi, eps)` per mode so the new tone pipeline reproduces
 * the OLD Möbius/window pipeline's resolved OKHSL lightness as closely as
 * possible across the authored 0–100 range, for the default config.
 *
 * Run: node --experimental-strip-types scripts/calibrate-tone.mts
 *
 * Not shipped. Safe to delete after constants are recorded in docs/okhst.md.
 */

import { gamutClampedLuminance, okhslToLinearSrgb } from '../src/okhsl-color-math.ts';

// --- old pipeline (mirrors current scheme-mapping.ts defaults) -----------
const LIGHT_WIN: [number, number] = [10, 100];
const DARK_WIN: [number, number] = [15, 95];
const DARK_BETA = 0.5;

function mobius(t: number, beta: number): number {
  if (beta >= 1) return t;
  return t / (t + beta * (1 - t));
}
function oldLight(l: number): number {
  const [lo, hi] = LIGHT_WIN;
  return (l * (hi - lo)) / 100 + lo;
}
function oldDark(l: number): number {
  const [lLo, lHi] = LIGHT_WIN;
  const [dLo, dHi] = DARK_WIN;
  const lightL = (l * (lHi - lLo)) / 100 + lLo;
  const t = (lHi - lightL) / (lHi - lLo);
  return dLo + (dHi - dLo) * mobius(t, DARK_BETA);
}

// --- tone transfers ------------------------------------------------------
// Gray luminance from OKHSL lightness via the real render pipeline.
function grayY(lFrac: number): number {
  return gamutClampedLuminance(okhslToLinearSrgb(0, 0, lFrac));
}
// Invert grayY numerically (monotonic) to get OKHSL l for a target Y.
function lForY(targetY: number): number {
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (grayY(mid) < targetY) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function toToneY(Y: number, eps: number): number {
  return ((Math.log(Y + eps) - Math.log(eps)) /
    (Math.log(1 + eps) - Math.log(eps))) *
    100;
}
function fromToneToY(T: number, eps: number): number {
  return (
    Math.exp(
      (T / 100) * (Math.log(1 + eps) - Math.log(eps)) + Math.log(eps),
    ) - eps
  );
}

// tone (author 0..100) -> windowed tone in [loT, hiT] where the window is
// expressed in TONE units derived from the lightness window's endpoints.
function newLight(authorTone: number, eps: number, lo: number, hi: number): number {
  const loT = toToneY(grayY(lo / 100), eps);
  const hiT = toToneY(grayY(hi / 100), eps);
  const Twin = loT + (authorTone / 100) * (hiT - loT);
  const Y = fromToneToY(Twin, eps);
  return lForY(Y) * 100;
}
function newDark(authorTone: number, eps: number, lo: number, hi: number): number {
  const inv = 100 - authorTone;
  return newLight(inv, eps, lo, hi);
}

// --- fit -----------------------------------------------------------------
function rmse(f: (a: number) => number, g: (a: number) => number): number {
  let s = 0;
  let n = 0;
  for (let a = 0; a <= 100; a += 2) {
    const d = f(a) - g(a);
    s += d * d;
    n++;
  }
  return Math.sqrt(s / n);
}

function gridSearch(
  isDark: boolean,
  loRange: number[],
  hiRange: number[],
  epsRange: number[],
) {
  const old = isDark ? oldDark : oldLight;
  let best = { lo: 0, hi: 0, eps: 0, err: Infinity };
  for (const lo of loRange)
    for (const hi of hiRange)
      for (const eps of epsRange) {
        const fn = (a: number) =>
          isDark ? newDark(a, eps, lo, hi) : newLight(a, eps, lo, hi);
        const err = rmse(fn, old);
        if (err < best.err) best = { lo, hi, eps, err };
      }
  return best;
}

const loR = [
  4, 6, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24, 26, 28, 30,
];
const hiR = [88, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100];

// Pin eps to the reference (WCAG-tracking) value so the tone axis stays
// contrast-uniform; only the windows absorb visual placement.
const REF_EPS = 0.05;
const light = gridSearch(false, loR, hiR, [REF_EPS]);
const dark = gridSearch(true, loR, hiR, [REF_EPS]);

console.log('LIGHT best (eps pinned 0.05):', light);
console.log('DARK  best (eps pinned 0.05):', dark);

// Also report a contrast-uniformity check: equal tone steps -> WCAG ratio.
function wcag(yA: number, yB: number): number {
  const hi = Math.max(yA, yB),
    lo = Math.min(yA, yB);
  return (hi + 0.05) / (lo + 0.05);
}
console.log('\n-- contrast uniformity (gray, eps=0.05): tone step 0->T vs white --');
for (const T of [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) {
  const Y = fromToneToY(T, REF_EPS);
  console.log('T=', T, 'cr-vs-black=', wcag(Y, 0).toFixed(3));
}

console.log('\n-- light sample (author -> oldL / newL) --');
for (const a of [0, 25, 50, 75, 100]) {
  console.log(
    a,
    oldLight(a).toFixed(2),
    newLight(a, light.eps, light.lo, light.hi).toFixed(2),
  );
}
console.log('\n-- dark sample (author -> oldL / newL) --');
for (const a of [0, 25, 50, 75, 100]) {
  console.log(
    a,
    oldDark(a).toFixed(2),
    newDark(a, dark.eps, dark.lo, dark.hi).toFixed(2),
  );
}

// Candidate hand-picked windows (clean defaults) vs old, for surfaces.
console.log('\n== candidate defaults: light [13,100], dark [10,95], eps 0.05 ==');
const CL: [number, number] = [13, 100];
const CD: [number, number] = [10, 95];
console.log('author  oldLight newLight | oldDark newDark');
for (const a of [0, 2, 25, 50, 75, 98, 100]) {
  console.log(
    String(a).padStart(3),
    oldLight(a).toFixed(1).padStart(8),
    newLight(a, 0.05, CL[0], CL[1]).toFixed(1).padStart(8),
    '|',
    oldDark(a).toFixed(1).padStart(7),
    newDark(a, 0.05, CD[0], CD[1]).toFixed(1).padStart(7),
  );
}
