/**
 * OKHSL color math primitives for the glaze theme generator.
 *
 * Provides bidirectional OKHSL ↔ sRGB conversion, luminance computation
 * for both contrast metrics (WCAG 2 relative luminance and APCA screen
 * luminance `Ys`), and multi-format output (okhsl, rgb, hsl, oklch).
 */

type Vec3 = [number, number, number];

// ============================================================================
// Matrices (from texel-color / Björn Ottosson's reference)
// ============================================================================

const OKLab_to_LMS_M: Vec3[] = [
  [1.0, 0.3963377773761749, 0.2158037573099136],
  [1.0, -0.1055613458156586, -0.0638541728258133],
  [1.0, -0.0894841775298119, -1.2914855480194092],
];

const LMS_to_linear_sRGB_M: Vec3[] = [
  [4.076741636075959, -3.307711539258062, 0.2309699031821041],
  [-1.2684379732850313, 2.6097573492876878, -0.3413193760026569],
  [-0.004196076138675526, -0.703418617935936, 1.7076146940746113],
];

const linear_sRGB_to_LMS_M: Vec3[] = [
  [0.4122214708, 0.5363325363, 0.0514459929],
  [0.2119034982, 0.6806995451, 0.1073969566],
  [0.0883024619, 0.2817188376, 0.6299787005],
];

const LMS_to_OKLab_M: Vec3[] = [
  [0.2104542553, 0.793617785, -0.0040720468],
  [1.9779984951, -2.428592205, 0.4505937099],
  [0.0259040371, 0.7827717662, -0.808675766],
];

const OKLab_to_linear_sRGB_coefficients: [
  [[number, number], number[]],
  [[number, number], number[]],
  [[number, number], number[]],
] = [
  [
    [-1.8817030993265873, -0.8093650129914302],
    [1.19086277, 1.76576728, 0.59662641, 0.75515197, 0.56771245],
  ],
  [
    [1.8144407988010998, -1.194452667805235],
    [0.73956515, -0.45954404, 0.08285427, 0.1254107, 0.14503204],
  ],
  [
    [0.13110757611180954, 1.813339709266608],
    [1.35733652, -0.00915799, -1.1513021, -0.50559606, 0.00692167],
  ],
];

// ============================================================================
// Constants
// ============================================================================

const TAU = 2 * Math.PI;
const K1 = 0.206;
const K2 = 0.03;
const K3 = (1.0 + K1) / (1.0 + K2);
const EPSILON = 1e-10;

// ============================================================================
// Helpers
// ============================================================================

const constrainAngle = (angle: number): number => ((angle % 360) + 360) % 360;
/**
 * OKHSL toe function: maps OKLab lightness L to perceptual lightness l.
 * Exported for the OKHST tone transfers in `okhst.ts`.
 */
export const toe = (x: number): number =>
  0.5 *
  (K3 * x - K1 + Math.sqrt((K3 * x - K1) * (K3 * x - K1) + 4 * K2 * K3 * x));
/** Inverse OKHSL toe: maps perceptual lightness l back to OKLab lightness L. */
export const toeInv = (x: number): number =>
  (x ** 2 + K1 * x) / (K3 * (x + K2));
const dot3 = (a: Vec3, b: Vec3): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const dotXY = (a: [number, number], b: [number, number]): number =>
  a[0] * b[0] + a[1] * b[1];
const transform = (input: Vec3, matrix: Vec3[]): Vec3 => [
  dot3(input, matrix[0]),
  dot3(input, matrix[1]),
  dot3(input, matrix[2]),
];
const cubed3 = (lms: Vec3): Vec3 => [lms[0] ** 3, lms[1] ** 3, lms[2] ** 3];
const cbrt3 = (lms: Vec3): Vec3 => [
  Math.cbrt(lms[0]),
  Math.cbrt(lms[1]),
  Math.cbrt(lms[2]),
];
const clampVal = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));

// ============================================================================
// Internal OKHSL pipeline
// ============================================================================

const OKLabToLinearSRGB = (lab: Vec3): Vec3 => {
  const lms = transform(lab, OKLab_to_LMS_M);
  return transform(cubed3(lms), LMS_to_linear_sRGB_M);
};

const computeMaxSaturationOKLC = (a: number, b: number): number => {
  const okCoeff = OKLab_to_linear_sRGB_coefficients;
  const lmsToRgb = LMS_to_linear_sRGB_M;
  const tmp2: [number, number] = [a, b];
  const tmp3: Vec3 = [0, a, b];

  let chnlCoeff: number[];
  let chnlLMS: Vec3;

  if (dotXY(okCoeff[0][0], tmp2) > 1) {
    chnlCoeff = okCoeff[0][1];
    chnlLMS = lmsToRgb[0];
  } else if (dotXY(okCoeff[1][0], tmp2) > 1) {
    chnlCoeff = okCoeff[1][1];
    chnlLMS = lmsToRgb[1];
  } else {
    chnlCoeff = okCoeff[2][1];
    chnlLMS = lmsToRgb[2];
  }

  const [k0, k1, k2, k3, k4] = chnlCoeff;
  const [wl, wm, ws] = chnlLMS;

  let sat = k0 + k1 * a + k2 * b + k3 * (a * a) + k4 * a * b;

  const dotYZ = (mat: Vec3, vec: Vec3): number =>
    mat[1] * vec[1] + mat[2] * vec[2];

  const kl = dotYZ(OKLab_to_LMS_M[0], tmp3);
  const km = dotYZ(OKLab_to_LMS_M[1], tmp3);
  const ks = dotYZ(OKLab_to_LMS_M[2], tmp3);

  const l_ = 1.0 + sat * kl;
  const m_ = 1.0 + sat * km;
  const s_ = 1.0 + sat * ks;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  const lds = 3.0 * kl * l_ * l_;
  const mds = 3.0 * km * m_ * m_;
  const sds = 3.0 * ks * s_ * s_;

  const lds2 = 6.0 * kl * kl * l_;
  const mds2 = 6.0 * km * km * m_;
  const sds2 = 6.0 * ks * ks * s_;

  const f = wl * l + wm * m + ws * s;
  const f1 = wl * lds + wm * mds + ws * sds;
  const f2 = wl * lds2 + wm * mds2 + ws * sds2;

  sat = sat - (f * f1) / (f1 * f1 - 0.5 * f * f2);

  return sat;
};

const findCuspOKLCH = (a: number, b: number): [number, number] => {
  const S_cusp = computeMaxSaturationOKLC(a, b);
  const lab: Vec3 = [1, S_cusp * a, S_cusp * b];
  const rgb_at_max = OKLabToLinearSRGB(lab);
  const L_cusp = Math.cbrt(
    1 /
      Math.max(
        Math.max(rgb_at_max[0], rgb_at_max[1]),
        Math.max(rgb_at_max[2], 0.0),
      ),
  );
  return [L_cusp, L_cusp * S_cusp];
};

const findGamutIntersectionOKLCH = (
  a: number,
  b: number,
  l1: number,
  c1: number,
  l0: number,
  cusp: [number, number],
): number => {
  const lmsToRgb = LMS_to_linear_sRGB_M;
  const tmp3: Vec3 = [0, a, b];
  const floatMax = Number.MAX_VALUE;

  let t: number;

  const dotYZ = (mat: Vec3, vec: Vec3): number =>
    mat[1] * vec[1] + mat[2] * vec[2];
  const dotXYZ = (vec: Vec3, x: number, y: number, z: number): number =>
    vec[0] * x + vec[1] * y + vec[2] * z;

  if ((l1 - l0) * cusp[1] - (cusp[0] - l0) * c1 <= 0.0) {
    const denom = c1 * cusp[0] + cusp[1] * (l0 - l1);
    t = denom === 0 ? 0 : (cusp[1] * l0) / denom;
  } else {
    const denom = c1 * (cusp[0] - 1.0) + cusp[1] * (l0 - l1);
    t = denom === 0 ? 0 : (cusp[1] * (l0 - 1.0)) / denom;

    const dl = l1 - l0;
    const dc = c1;
    const kl = dotYZ(OKLab_to_LMS_M[0], tmp3);
    const km = dotYZ(OKLab_to_LMS_M[1], tmp3);
    const ks = dotYZ(OKLab_to_LMS_M[2], tmp3);

    const L = l0 * (1.0 - t) + t * l1;
    const C = t * c1;

    const l_ = L + C * kl;
    const m_ = L + C * km;
    const s_ = L + C * ks;

    const l = l_ ** 3;
    const m = m_ ** 3;
    const s = s_ ** 3;

    const ldt = 3 * (dl + dc * kl) * l_ * l_;
    const mdt = 3 * (dl + dc * km) * m_ * m_;
    const sdt = 3 * (dl + dc * ks) * s_ * s_;

    const ldt2 = 6 * (dl + dc * kl) ** 2 * l_;
    const mdt2 = 6 * (dl + dc * km) ** 2 * m_;
    const sdt2 = 6 * (dl + dc * ks) ** 2 * s_;

    const r_ = dotXYZ(lmsToRgb[0], l, m, s) - 1;
    const r1 = dotXYZ(lmsToRgb[0], ldt, mdt, sdt);
    const r2 = dotXYZ(lmsToRgb[0], ldt2, mdt2, sdt2);
    const ur = r1 / (r1 * r1 - 0.5 * r_ * r2);
    let tr = -r_ * ur;

    const g_ = dotXYZ(lmsToRgb[1], l, m, s) - 1;
    const g1 = dotXYZ(lmsToRgb[1], ldt, mdt, sdt);
    const g2 = dotXYZ(lmsToRgb[1], ldt2, mdt2, sdt2);
    const ug = g1 / (g1 * g1 - 0.5 * g_ * g2);
    let tg = -g_ * ug;

    const b_ = dotXYZ(lmsToRgb[2], l, m, s) - 1;
    const b1 = dotXYZ(lmsToRgb[2], ldt, mdt, sdt);
    const b2 = dotXYZ(lmsToRgb[2], ldt2, mdt2, sdt2);
    const ub = b1 / (b1 * b1 - 0.5 * b_ * b2);
    let tb = -b_ * ub;

    tr = ur >= 0.0 ? tr : floatMax;
    tg = ug >= 0.0 ? tg : floatMax;
    tb = ub >= 0.0 ? tb : floatMax;

    t += Math.min(tr, Math.min(tg, tb));
  }

  return t;
};

const computeSt = (cusp: [number, number]): [number, number] => [
  cusp[1] / cusp[0],
  cusp[1] / (1 - cusp[0]),
];

const computeStMid = (a: number, b: number): [number, number] => [
  0.11516993 +
    1.0 /
      (7.4477897 +
        4.1590124 * b +
        a *
          (-2.19557347 +
            1.75198401 * b +
            a *
              (-2.13704948 -
                10.02301043 * b +
                a * (-4.24894561 + 5.38770819 * b + 4.69891013 * a)))),
  0.11239642 +
    1.0 /
      (1.6132032 -
        0.68124379 * b +
        a *
          (0.40370612 +
            0.90148123 * b +
            a *
              (-0.27087943 +
                0.6122399 * b +
                a * (0.00299215 - 0.45399568 * b - 0.14661872 * a)))),
];

const getCs = (
  L: number,
  a: number,
  b: number,
  cusp: [number, number],
): [number, number, number] => {
  const cMax = findGamutIntersectionOKLCH(a, b, L, 1, L, cusp);
  const stMax = computeSt(cusp);
  const k = cMax / Math.min(L * stMax[0], (1 - L) * stMax[1]);
  const stMid = computeStMid(a, b);
  let ca = L * stMid[0];
  let cb = (1.0 - L) * stMid[1];
  const cMid =
    0.9 * k * Math.sqrt(Math.sqrt(1.0 / (1.0 / ca ** 4 + 1.0 / cb ** 4)));
  ca = L * 0.4;
  cb = (1.0 - L) * 0.8;
  const c0 = Math.sqrt(1.0 / (1.0 / ca ** 2 + 1.0 / cb ** 2));
  return [c0, cMid, cMax];
};

const CYAN_A = Math.cos((199.8 * Math.PI) / 180);
const CYAN_B = Math.sin((199.8 * Math.PI) / 180);
const BLUE_A = Math.cos((267.4 * Math.PI) / 180);
const BLUE_B = Math.sin((267.4 * Math.PI) / 180);

let cyanCusp: [number, number] | undefined;
let blueCusp: [number, number] | undefined;

/**
 * Computes the maximum safe OKLCH chroma that fits inside the sRGB gamut
 * for all possible hues at a given OKLab lightness `L`.
 */
export function computeSafeChromaOKLCH(L: number): number {
  if (!cyanCusp) cyanCusp = findCuspOKLCH(CYAN_A, CYAN_B);
  if (!blueCusp) blueCusp = findCuspOKLCH(BLUE_A, BLUE_B);

  const c1 = findGamutIntersectionOKLCH(CYAN_A, CYAN_B, L, 1, L, cyanCusp);
  const c2 = findGamutIntersectionOKLCH(BLUE_A, BLUE_B, L, 1, L, blueCusp);
  return Math.min(c1, c2);
}

// ============================================================================
// Public API
// ============================================================================

/** Per-hue cusp-lightness cache. The cusp is mode-independent, so keying on
 * a rounded hue is safe and keeps the cache small. */
const cuspLightnessCache = new Map<number, number>();

/**
 * OKHSL lightness of the gamut cusp for a hue — the lightness where the
 * realizable chroma peaks. Reuses the same `find_cusp` OKHSL already runs for
 * its `s` normalization (no new color math); the OKLab cusp lightness is run
 * through the OKHSL `toe` and clamped to `[0.001, 0.999]` so divisions that
 * key off it stay safe. Cached per (rounded) hue.
 *
 * @param h Hue, 0–360.
 */
export function cuspLightness(h: number): number {
  const key = Math.round(constrainAngle(h) * 100) / 100;
  const cached = cuspLightnessCache.get(key);
  if (cached !== undefined) return cached;

  const hNorm = key / 360.0;
  const cusp = findCuspOKLCH(Math.cos(TAU * hNorm), Math.sin(TAU * hNorm));
  const lc = clampVal(toe(cusp[0]), 0.001, 0.999);
  cuspLightnessCache.set(key, lc);
  return lc;
}

/**
 * Convert OKHSL (h: 0–360, s: 0–1, l: 0–1) to OKLab [L, a, b].
 */
export function okhslToOklab(
  h: number,
  s: number,
  l: number,
  pastel = false,
): [number, number, number] {
  const L = toeInv(l);
  let a = 0;
  let b = 0;

  const hNorm = constrainAngle(h) / 360.0;

  if (L !== 0.0 && L !== 1.0 && s !== 0) {
    const a_ = Math.cos(TAU * hNorm);
    const b_ = Math.sin(TAU * hNorm);

    if (pastel) {
      const c = s * computeSafeChromaOKLCH(L);
      a = c * a_;
      b = c * b_;
    } else {
      const cusp = findCuspOKLCH(a_, b_);
      const Cs = getCs(L, a_, b_, cusp);
      const [c0, cMid, cMax] = Cs;

      const mid = 0.8;
      const midInv = 1.25;
      let t: number, k0: number, k1: number, k2: number;

      if (s < mid) {
        t = midInv * s;
        k0 = 0.0;
        k1 = mid * c0;
        k2 = 1.0 - k1 / cMid;
      } else {
        t = 5 * (s - 0.8);
        k0 = cMid;
        k1 = (0.2 * cMid ** 2 * 1.25 ** 2) / c0;
        k2 = 1.0 - k1 / (cMax - cMid);
      }

      const c = k0 + (t * k1) / (1.0 - k2 * t);
      a = c * a_;
      b = c * b_;
    }
  }

  return [L, a, b];
}

/**
 * Convert OKHSL (h: 0–360, s: 0–1, l: 0–1) to linear sRGB.
 * Channels may exceed [0, 1] near gamut boundaries — caller must clamp if needed.
 */
export function okhslToLinearSrgb(
  h: number,
  s: number,
  l: number,
  pastel = false,
): [number, number, number] {
  return OKLabToLinearSRGB(okhslToOklab(h, s, l, pastel));
}

/**
 * Compute relative luminance Y from linear sRGB channels.
 * Per WCAG 2: Y = 0.2126·R + 0.7152·G + 0.0722·B
 */
export function relativeLuminanceFromLinearRgb(
  rgb: [number, number, number],
): number {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

/**
 * WCAG 2 contrast ratio from two luminance values.
 */
export function contrastRatioFromLuminance(yA: number, yB: number): number {
  const lighter = Math.max(yA, yB);
  const darker = Math.min(yA, yB);
  return (lighter + 0.05) / (darker + 0.05);
}

export const sRGBLinearToGamma = (val: number): number => {
  const sign = val < 0 ? -1 : 1;
  const abs = Math.abs(val);
  return abs > 0.0031308
    ? sign * (1.055 * Math.pow(abs, 1 / 2.4) - 0.055)
    : 12.92 * val;
};

export const sRGBGammaToLinear = (val: number): number => {
  const sign = val < 0 ? -1 : 1;
  const abs = Math.abs(val);
  return abs <= 0.04045
    ? val / 12.92
    : sign * Math.pow((abs + 0.055) / 1.055, 2.4);
};

/**
 * Convert OKHSL to gamma-encoded sRGB (clamped to 0–1).
 */
export function okhslToSrgb(
  h: number,
  s: number,
  l: number,
  pastel = false,
): [number, number, number] {
  const lin = okhslToLinearSrgb(h, s, l, pastel);
  return [
    Math.max(0, Math.min(1, sRGBLinearToGamma(lin[0]))),
    Math.max(0, Math.min(1, sRGBLinearToGamma(lin[1]))),
    Math.max(0, Math.min(1, sRGBLinearToGamma(lin[2]))),
  ];
}

/**
 * Compute WCAG 2 relative luminance from linear sRGB, matching the browser
 * rendering pipeline: gamma-encode, clamp to sRGB gamut [0,1], then linearize.
 * This avoids over/under-estimating luminance for out-of-gamut OKHSL colors.
 */
export function gamutClampedLuminance(
  linearRgb: [number, number, number],
): number {
  const r = sRGBGammaToLinear(
    Math.max(0, Math.min(1, sRGBLinearToGamma(linearRgb[0]))),
  );
  const g = sRGBGammaToLinear(
    Math.max(0, Math.min(1, sRGBLinearToGamma(linearRgb[1]))),
  );
  const b = sRGBGammaToLinear(
    Math.max(0, Math.min(1, sRGBLinearToGamma(linearRgb[2]))),
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Compute APCA screen luminance (`Ys`) from linear sRGB.
 *
 * APCA does not use the WCAG piecewise sRGB EOTF; it defines its own
 * luminance as `0.2126·R^2.4 + 0.7152·G^2.4 + 0.0722·B^2.4` over the
 * gamma-encoded (display) channels with a simple 2.4 exponent. The APCA
 * soft-clamp threshold in `apcaContrast` is calibrated against this basis,
 * so the solver must feed it `Ys`, not WCAG relative luminance. Channels
 * are gamut-clamped to [0, 1] first, matching `gamutClampedLuminance`.
 */
export function apcaLuminanceFromLinearRgb(
  linearRgb: [number, number, number],
): number {
  const r = Math.max(0, Math.min(1, sRGBLinearToGamma(linearRgb[0])));
  const g = Math.max(0, Math.min(1, sRGBLinearToGamma(linearRgb[1])));
  const b = Math.max(0, Math.min(1, sRGBLinearToGamma(linearRgb[2])));
  return (
    0.2126 * Math.pow(r, 2.4) +
    0.7152 * Math.pow(g, 2.4) +
    0.0722 * Math.pow(b, 2.4)
  );
}

// ============================================================================
// Reverse pipeline: sRGB → OKHSL
// ============================================================================

const linearSrgbToOklab = (rgb: Vec3): Vec3 => {
  const lms = transform(rgb, linear_sRGB_to_LMS_M);
  const lms_ = cbrt3(lms);
  return transform(lms_, LMS_to_OKLab_M);
};

/**
 * Convert OKLab to OKHSL.
 * Input: [L, a, b] where L: 0–1, a/b: roughly -0.5 to 0.5.
 * Returns [h, s, l] where h: 0–360, s: 0–1, l: 0–1.
 */
export const oklabToOkhsl = (lab: Vec3, pastel = false): Vec3 => {
  const L = lab[0];
  const a = lab[1];
  const b = lab[2];

  const C = Math.sqrt(a * a + b * b);

  if (C < EPSILON) {
    return [0, 0, toe(L)];
  }

  // Lightness-extreme achromatic guard.
  //
  // At L → 1 (white) and L → 0 (black) the in-gamut chroma collapses to
  // a single point: cMax, cMid, c0 all approach zero. Pure white is the
  // most visible failure case — `linearSrgbToOklab([1, 1, 1])` leaves
  // tiny floating-point residue in the a / b channels (`a ≈ 8e-11`,
  // `b ≈ 3.7e-8` → `C ≈ 3.7e-8`) that's well above `EPSILON` (`1e-10`),
  // so the chroma early-return above doesn't catch it. The chromatic
  // path then runs, the gamut at L ≈ 1 has nowhere to put any chroma,
  // and the saturation formula in `getCs` divides through ~zero values,
  // producing nonsense h/s for what is physically an achromatic color
  // (`#FFFFFF` → `okhsl(89.88 55.83% 100%)` instead of
  // `okhsl(0 0% 100%)`).
  //
  // The threshold (`1e-6`) is much wider than `EPSILON` because the fp
  // wobble in L for pure white lands at `1 - 6.5e-9` — `EPSILON = 1e-10`
  // misses it. `1e-6` is still well below any human-perceivable
  // difference in lightness (JNDs in OKHSL L are several orders of
  // magnitude larger), so we don't falsely flatten any in-gamut color.
  //
  // Treat both extremes as achromatic. The lightness window itself is
  // preserved through `toe(L)`.
  const L_EXTREME_EPSILON = 1e-6;
  if (L >= 1 - L_EXTREME_EPSILON || L <= L_EXTREME_EPSILON) {
    return [0, 0, toe(L)];
  }

  const a_ = a / C;
  const b_ = b / C;

  let h = Math.atan2(b, a) * (180 / Math.PI);
  h = constrainAngle(h);

  let s: number;

  if (pastel) {
    s = C / computeSafeChromaOKLCH(L);
  } else {
    const cusp = findCuspOKLCH(a_, b_);
    const Cs = getCs(L, a_, b_, cusp);
    const [c0, cMid, cMax] = Cs;

    const mid = 0.8;
    const midInv = 1.25;

    if (C < cMid) {
      const k1 = mid * c0;
      const k2 = 1.0 - k1 / cMid;
      const t = C / (k1 + C * k2);
      s = t / midInv;
    } else {
      const k0 = cMid;
      const k1 = (0.2 * cMid ** 2 * 1.25 ** 2) / c0;
      const k2 = 1.0 - k1 / (cMax - cMid);
      const cDiff = C - k0;
      const t = cDiff / (k1 + cDiff * k2);
      s = mid + t / 5;
    }
  }

  const l = toe(L);

  return [h, clampVal(s, 0, 1), clampVal(l, 0, 1)];
};

/**
 * Convert gamma-encoded sRGB (0–1 per channel) to OKHSL.
 * Returns [h, s, l] where h: 0–360, s: 0–1, l: 0–1.
 */
export function srgbToOkhsl(
  rgb: [number, number, number],
  pastel = false,
): [number, number, number] {
  const linear: Vec3 = [
    sRGBGammaToLinear(rgb[0]),
    sRGBGammaToLinear(rgb[1]),
    sRGBGammaToLinear(rgb[2]),
  ];
  const oklab = linearSrgbToOklab(linear);
  return oklabToOkhsl(oklab, pastel) as [number, number, number];
}

/**
 * Convert CSS HSL (sRGB-based) to gamma-encoded sRGB [r, g, b] in 0–1 range.
 * h: 0–360, s: 0–1, l: 0–1.
 *
 * Note: CSS HSL is not the same as OKHSL — it's HSL in the sRGB color space.
 * Use this when parsing `hsl(...)` strings before passing to `srgbToOkhsl`.
 */
export function hslToSrgb(
  h: number,
  s: number,
  l: number,
): [number, number, number] {
  const hh = (((h % 360) + 360) % 360) / 360;
  const ss = clampVal(s, 0, 1);
  const ll = clampVal(l, 0, 1);

  if (ss === 0) {
    return [ll, ll, ll];
  }

  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;

  const hueToChannel = (t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  return [hueToChannel(hh + 1 / 3), hueToChannel(hh), hueToChannel(hh - 1 / 3)];
}

/**
 * Parse a hex color string (#rgb or #rrggbb) to sRGB [r, g, b] in 0–1 range.
 * Returns null if the string is not a valid hex color.
 *
 * For 8-digit hex (`#rrggbbaa`) and 4-digit hex (`#rgba`) with alpha,
 * use {@link parseHexAlpha}.
 */
export function parseHex(hex: string): [number, number, number] | null {
  const result = parseHexAlpha(hex);
  if (!result || result.alpha !== undefined) return null;
  return result.rgb;
}

/**
 * Parse a hex color string (#rgb, #rrggbb, #rgba, or #rrggbbaa) to
 * sRGB [r, g, b] in 0–1 range plus an optional alpha (0–1).
 * Returns null if the string is not a valid hex color.
 */
export function parseHexAlpha(
  hex: string,
): { rgb: [number, number, number]; alpha?: number } | null {
  const h = hex.startsWith('#') ? hex.slice(1) : hex;

  if (h.length === 3) {
    const r = parseInt(h[0] + h[0], 16);
    const g = parseInt(h[1] + h[1], 16);
    const b = parseInt(h[2] + h[2], 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return { rgb: [r / 255, g / 255, b / 255] };
  }

  if (h.length === 4) {
    const r = parseInt(h[0] + h[0], 16);
    const g = parseInt(h[1] + h[1], 16);
    const b = parseInt(h[2] + h[2], 16);
    const a = parseInt(h[3] + h[3], 16);
    if (isNaN(r) || isNaN(g) || isNaN(b) || isNaN(a)) return null;
    return { rgb: [r / 255, g / 255, b / 255], alpha: a / 255 };
  }

  if (h.length === 6) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return { rgb: [r / 255, g / 255, b / 255] };
  }

  if (h.length === 8) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const a = parseInt(h.slice(6, 8), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b) || isNaN(a)) return null;
    return { rgb: [r / 255, g / 255, b / 255], alpha: a / 255 };
  }

  return null;
}

// ============================================================================
// Format functions
// ============================================================================

function fmt(value: number, decimals: number): string {
  return parseFloat(value.toFixed(decimals)).toString();
}

/**
 * Format OKHSL values as a CSS `okhsl(H S% L%)` string.
 * h: 0–360, s: 0–100, l: 0–100 (percentage scale for s and l).
 */
export function formatOkhsl(
  h: number,
  s: number,
  l: number,
  pastel = false,
): string {
  let outS = s;
  if (pastel) {
    // If it's a pastel color, we need to find the equivalent normal OKHSL `s`
    // so it renders identically in external parsers that don't know about `pastel`.
    const oklab = okhslToOklab(h, s / 100, l / 100, true);
    const normalOkhsl = oklabToOkhsl(oklab, false);
    outS = normalOkhsl[1] * 100;
  }
  return `okhsl(${fmt(h, 2)} ${fmt(outS, 2)}% ${fmt(l, 2)}%)`;
}

/**
 * Format OKHSL values as a CSS `rgb(R G B)` string.
 * Uses 2 decimal places to avoid 8-bit quantization contrast loss.
 * h: 0–360, s: 0–100, l: 0–100 (percentage scale for s and l).
 */
export function formatRgb(
  h: number,
  s: number,
  l: number,
  pastel = false,
): string {
  const [r, g, b] = okhslToSrgb(h, s / 100, l / 100, pastel);
  return `rgb(${parseFloat((r * 255).toFixed(2))} ${parseFloat((g * 255).toFixed(2))} ${parseFloat((b * 255).toFixed(2))})`;
}

/**
 * Format OKHSL values as a CSS `hsl(H S% L%)` string.
 * h: 0–360, s: 0–100, l: 0–100 (percentage scale for s and l).
 */
export function formatHsl(
  h: number,
  s: number,
  l: number,
  pastel = false,
): string {
  const [r, g, b] = okhslToSrgb(h, s / 100, l / 100, pastel);

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let hh = 0;
  let ss = 0;
  const ll = (max + min) / 2;

  if (delta > 0) {
    ss = ll > 0.5 ? delta / (2 - max - min) : delta / (max + min);

    if (max === r) {
      hh = ((g - b) / delta + (g < b ? 6 : 0)) * 60;
    } else if (max === g) {
      hh = ((b - r) / delta + 2) * 60;
    } else {
      hh = ((r - g) / delta + 4) * 60;
    }
  }

  return `hsl(${fmt(hh, 2)} ${fmt(ss * 100, 2)}% ${fmt(ll * 100, 2)}%)`;
}

/**
 * Format OKHSL values as a CSS `oklch(L C H)` string.
 * h: 0–360, s: 0–100, l: 0–100 (percentage scale for s and l).
 */
export function formatOklch(
  h: number,
  s: number,
  l: number,
  pastel = false,
): string {
  const [L, C, hh] = okhslToOklch(h, s / 100, l / 100, pastel);
  return `oklch(${fmt(L, 4)} ${fmt(C, 4)} ${fmt(hh, 2)})`;
}

// ============================================================================
// Structured (non-string) color accessors — used by the DTCG exporter.
// ============================================================================

/**
 * Convert gamma-encoded sRGB channels (0–1) to a 6-digit lowercase hex
 * string (`#rrggbb`). Channels are clamped to [0,1] and rounded to 8-bit.
 * Alpha is not encoded here — DTCG carries it as a separate `alpha` field.
 */
export function srgbToHex(rgb: [number, number, number]): `#${string}` {
  const toByte = (c: number): number =>
    Math.max(0, Math.min(255, Math.round(c * 255)));
  const r = toByte(rgb[0]);
  const g = toByte(rgb[1]);
  const b = toByte(rgb[2]);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Convert OKHSL (h: 0–360, s: 0–1, l: 0–1) to OKLCH components `[L, C, H]`.
 * L: 0–1, C: 0–~0.4 (chroma), H: 0–360 (hue). Shared by `formatOklch` and
 * the DTCG `oklch` colorSpace exporter so the two never drift apart.
 */
export function okhslToOklch(
  h: number,
  s: number,
  l: number,
  pastel = false,
): [number, number, number] {
  const [L, a, b] = okhslToOklab(h, s, l, pastel);
  const C = Math.sqrt(a * a + b * b);
  const hh = constrainAngle(Math.atan2(b, a) * (180 / Math.PI));
  return [L, C, hh];
}
