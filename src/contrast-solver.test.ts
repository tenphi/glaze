import {
  resolveMinContrast,
  resolveContrastForLevel,
  resolveContrastForMode,
  findToneForContrast,
  findValueForMixContrast,
  apcaContrast,
  metricLuminance,
} from './contrast-solver';
import type {
  FindToneForContrastOptions,
  LinearRgb,
  ResolvedContrast,
} from './contrast-solver';
import type { ContrastSpec, HCPair, ResolvedColorVariant } from './types';
import {
  okhslToLinearSrgb,
  okhslToSrgb,
  sRGBGammaToLinear,
  relativeLuminanceFromLinearRgb,
  contrastRatioFromLuminance,
  gamutClampedLuminance,
  apcaLuminanceFromLinearRgb,
} from './okhsl-color-math';
import { fromTone, REF_EPS, toneFromY, variantToOkhsl } from './okhst';
import { glaze } from './glaze';

const wcag = (target: number): ResolvedContrast => ({
  metric: 'wcag',
  target,
});

/** The overshooting target the solver searches for (WCAG ×1.01, APCA +0.5). */
const searchTargetOf = ({ metric, target }: ResolvedContrast) =>
  metric === 'wcag' ? target * 1.01 : target + 0.5;

/** Linear sRGB of an OKHST color, tone on 0–1. */
const toneRgb = (hue: number, saturation: number, tone: number): LinearRgb =>
  okhslToLinearSrgb(hue, saturation, fromTone(tone * 100, REF_EPS));

const grayBase = (tone: number) => toneRgb(0, 0, tone);

/** The solver's score: WCAG ratio, or APCA Lc magnitude in `polarity` order. */
function scoreOf(
  contrast: ResolvedContrast,
  candidate: LinearRgb,
  base: LinearRgb,
): number {
  const yc = metricLuminance(contrast.metric, candidate);
  const yb = metricLuminance(contrast.metric, base);
  if (contrast.metric === 'wcag') return contrastRatioFromLuminance(yc, yb);
  return Math.abs(
    contrast.polarity === 'bg' ? apcaContrast(yb, yc) : apcaContrast(yc, yb),
  );
}

function srgbLuminance(h: number, s: number, l: number): number {
  const [r, g, b] = okhslToSrgb(h, s, l);
  return (
    0.2126 * sRGBGammaToLinear(r) +
    0.7152 * sRGBGammaToLinear(g) +
    0.0722 * sRGBGammaToLinear(b)
  );
}

describe('contrast-solver', () => {
  beforeEach(() => {
    glaze.resetConfig();
  });

  describe('resolveMinContrast', () => {
    it('maps AA to 4.5', () => {
      expect(resolveMinContrast('AA')).toBe(4.5);
    });
    it('maps AAA to 7', () => {
      expect(resolveMinContrast('AAA')).toBe(7);
    });
    it('maps AA-large to 3', () => {
      expect(resolveMinContrast('AA-large')).toBe(3);
    });
    it('maps AAA-large to 4.5', () => {
      expect(resolveMinContrast('AAA-large')).toBe(4.5);
    });
    it('passes through numeric values', () => {
      expect(resolveMinContrast(5.5)).toBe(5.5);
    });
    it('clamps numeric values to minimum 1', () => {
      expect(resolveMinContrast(0.5)).toBe(1);
    });
  });

  describe('resolveContrastForMode', () => {
    it('treats a bare number as WCAG', () => {
      expect(resolveContrastForMode(4.5, false)).toEqual({
        metric: 'wcag',
        target: 4.5,
      });
    });

    it('treats a preset as WCAG', () => {
      expect(resolveContrastForMode('AAA', false)).toEqual({
        metric: 'wcag',
        target: 7,
      });
    });

    it('resolves { wcag } with a scalar', () => {
      expect(resolveContrastForMode({ wcag: 6 }, false)).toEqual({
        metric: 'wcag',
        target: 6,
      });
    });

    it('resolves the inner { wcag } HC pair by mode', () => {
      expect(resolveContrastForMode({ wcag: [4.5, 7] }, false).target).toBe(
        4.5,
      );
      expect(resolveContrastForMode({ wcag: [4.5, 7] }, true).target).toBe(7);
    });

    it('auto-promotes a bare WCAG AA preset to AAA in HC (SC 1.4.3 -> 1.4.6)', () => {
      expect(resolveContrastForMode('AA', true).target).toBe(7);
      expect(resolveContrastForMode('AA', false).target).toBe(4.5);
      expect(resolveContrastForMode('AA-large', true).target).toBe(4.5);
      expect(resolveContrastForMode('AA-large', false).target).toBe(3);
    });

    it('leaves AAA-family WCAG presets unchanged in HC (top tier)', () => {
      expect(resolveContrastForMode('AAA', true).target).toBe(7);
      expect(resolveContrastForMode('AAA-large', true).target).toBe(4.5);
    });

    it('leaves a bare WCAG number unchanged in HC (no successor tier)', () => {
      expect(resolveContrastForMode(5.5, true).target).toBe(5.5);
      expect(resolveContrastForMode({ wcag: 6 }, true).target).toBe(6);
    });

    it('does not promote when the inner wcag pair carries an explicit HC value', () => {
      expect(resolveContrastForMode({ wcag: ['AA', 'AA'] }, true).target).toBe(
        4.5,
      );
    });

    it('does not promote when outerExplicitHC is signaled by the caller', () => {
      expect(resolveContrastForMode('AA', true, undefined, true).target).toBe(
        4.5,
      );
    });

    it('resolves { apca } with a scalar', () => {
      expect(resolveContrastForMode({ apca: 60 }, false)).toEqual({
        metric: 'apca',
        target: 60,
        polarity: 'fg',
      });
    });

    it('passes the polarity through to the APCA result', () => {
      expect(resolveContrastForMode({ apca: 60 }, false, 'bg')).toEqual({
        metric: 'apca',
        target: 60,
        polarity: 'bg',
      });
    });

    it('resolves APCA preset keywords to Lc', () => {
      expect(resolveContrastForMode({ apca: 'content' }, false).target).toBe(
        60,
      );
      expect(resolveContrastForMode({ apca: 'body' }, false).target).toBe(75);
      expect(resolveContrastForMode({ apca: 'min' }, false).target).toBe(15);
    });

    it('resolves the inner { apca } HC pair by mode', () => {
      expect(resolveContrastForMode({ apca: [45, 60] }, false).target).toBe(45);
      expect(resolveContrastForMode({ apca: [45, 60] }, true).target).toBe(60);
    });

    it('takes the magnitude of an APCA target', () => {
      expect(resolveContrastForMode({ apca: -60 }, false).target).toBe(60);
    });

    it('auto-enhances a bare APCA scalar by +15 Lc in HC (Enhanced Level)', () => {
      expect(resolveContrastForMode({ apca: 60 }, true).target).toBe(75);
      // normal mode is untouched
      expect(resolveContrastForMode({ apca: 60 }, false).target).toBe(60);
    });

    it('auto-enhances an APCA preset by +15 Lc in HC', () => {
      expect(resolveContrastForMode({ apca: 'content' }, true).target).toBe(75);
    });

    it('clamps the HC enhancement to APCA_MAX_LC', () => {
      // 'preferred' -> 90; +15 = 105, under the 106 cap
      expect(resolveContrastForMode({ apca: 'preferred' }, true).target).toBe(
        105,
      );
      // a near-max baseline clamps to 106
      expect(resolveContrastForMode({ apca: 100 }, true).target).toBe(106);
    });

    it('does not enhance when the inner apca pair carries an explicit HC value', () => {
      expect(resolveContrastForMode({ apca: [60, 60] }, true).target).toBe(60);
      expect(resolveContrastForMode({ apca: [60, 90] }, true).target).toBe(90);
    });

    it('does not enhance when outerExplicitHC is signaled by the caller', () => {
      expect(
        resolveContrastForMode({ apca: 60 }, true, 'fg', true).target,
      ).toBe(60);
    });
  });

  describe('resolveContrastForLevel', () => {
    it('delegates verbatim at the endpoints', () => {
      expect(resolveContrastForLevel('AA', 0)).toEqual(
        resolveContrastForMode('AA', false),
      );
      expect(resolveContrastForLevel('AA', 100)).toEqual(
        resolveContrastForMode('AA', true),
      );
    });

    it('interpolates the WCAG auto-promotion', () => {
      expect(resolveContrastForLevel('AA', 0).target).toBe(4.5);
      expect(resolveContrastForLevel('AA', 50).target).toBe(5.75);
      expect(resolveContrastForLevel('AA', 100).target).toBe(7);
    });

    it('interpolates the APCA Enhanced Level boost', () => {
      expect(resolveContrastForLevel({ apca: 60 }, 0).target).toBe(60);
      expect(resolveContrastForLevel({ apca: 60 }, 50).target).toBe(67.5);
      expect(resolveContrastForLevel({ apca: 60 }, 100).target).toBe(75);
    });

    it('interpolates an inner explicit pair without promoting either end', () => {
      expect(resolveContrastForLevel({ wcag: [4.5, 7] }, 0).target).toBe(4.5);
      expect(resolveContrastForLevel({ wcag: [4.5, 7] }, 50).target).toBe(5.75);
      expect(resolveContrastForLevel({ wcag: [4.5, 7] }, 100).target).toBe(7);
      // 'AA' on both ends stays 4.5 — explicit HC cancels the promotion.
      expect(resolveContrastForLevel({ wcag: ['AA', 'AA'] }, 50).target).toBe(
        4.5,
      );
    });

    it('interpolates an outer explicit pair without enhancing either end', () => {
      const spec: HCPair<ContrastSpec> = [{ apca: 60 }, { apca: 90 }];
      expect(resolveContrastForLevel(spec, 0).target).toBe(60);
      expect(resolveContrastForLevel(spec, 50).target).toBe(75);
      expect(resolveContrastForLevel(spec, 100).target).toBe(90);
    });

    it('respects the APCA_MAX_LC clamp at the high-contrast end', () => {
      expect(resolveContrastForLevel({ apca: 100 }, 0).target).toBe(100);
      expect(resolveContrastForLevel({ apca: 100 }, 50).target).toBe(103);
      expect(resolveContrastForLevel({ apca: 100 }, 100).target).toBe(106);
    });

    it('leaves a target with no escalation flat across the ramp', () => {
      for (const level of [0, 25, 50, 75, 100]) {
        expect(resolveContrastForLevel('AAA', level).target).toBe(7);
        expect(resolveContrastForLevel(5.5, level).target).toBe(5.5);
      }
    });

    it('rejects a WCAG-vs-APCA metric pair mid-ramp', () => {
      const spec: HCPair<ContrastSpec> = [4.5, { apca: 75 }];
      // No target exists between a WCAG ratio and an APCA Lc.
      expect(() => resolveContrastForLevel(spec, 50)).toThrow(
        /cannot switch metric/,
      );
      // The endpoints still resolve — each end is a single, coherent metric.
      expect(resolveContrastForLevel(spec, 0)).toEqual({
        metric: 'wcag',
        target: 4.5,
      });
      expect(resolveContrastForLevel(spec, 100)).toEqual({
        metric: 'apca',
        target: 75,
        polarity: 'fg',
      });
    });

    it('preserves polarity presence per metric mid-ramp', () => {
      // WCAG is symmetric, so it never carries polarity...
      expect(resolveContrastForLevel('AA', 50, 'bg')).toEqual({
        metric: 'wcag',
        target: 5.75,
      });
      // ...while APCA does.
      expect(resolveContrastForLevel({ apca: 60 }, 50, 'bg')).toEqual({
        metric: 'apca',
        target: 67.5,
        polarity: 'bg',
      });
    });

    it('clamps out-of-range levels', () => {
      expect(resolveContrastForLevel('AA', 150).target).toBe(7);
      expect(resolveContrastForLevel('AA', -50).target).toBe(4.5);
    });
  });

  describe('preferInitial', () => {
    // Both directions can reach a ratio of 3 from a mid-tone base, and the
    // darker result lands nearer the preferred tone — so the default tie-break
    // flips away from an explicit 'lighter'. That tie-break is what makes the
    // side unstable along a ramp of targets.
    const shared = {
      hue: 0,
      saturation: 0,
      preferredTone: 0.45,
      baseLinearRgb: okhslToLinearSrgb(0, 0, fromTone(50, REF_EPS)),
      contrast: wcag(3),
      initialDirection: 'lighter' as const,
      flip: true,
    };

    it('takes the nearest side by default', () => {
      const result = findToneForContrast(shared);
      expect(result.met).toBe(true);
      expect(result.flipped).toBe(true);
      expect(result.tone).toBeLessThan(0.45);
    });

    it('keeps the initial side when both meet', () => {
      const result = findToneForContrast({ ...shared, preferInitial: true });
      expect(result.met).toBe(true);
      expect(result.flipped).toBeUndefined();
      expect(result.tone).toBeGreaterThan(0.45);
    });

    it('still falls back when the initial side cannot reach the target', () => {
      // Against a tone-70 base, a ratio of 4.6 needs ~0.50 tone of separation:
      // reachable going darker (0.20), impossible going lighter (1.20). The
      // fallback must still fire even though 'lighter' is preferred.
      const result = findToneForContrast({
        hue: 0,
        saturation: 0,
        preferredTone: 0.75,
        baseLinearRgb: okhslToLinearSrgb(0, 0, fromTone(70, REF_EPS)),
        contrast: wcag(4.6),
        initialDirection: 'lighter',
        flip: true,
        preferInitial: true,
      });
      expect(result.met).toBe(true);
      expect(result.flipped).toBe(true);
      expect(result.tone).toBeLessThan(0.7);
    });
  });

  describe('apcaContrast', () => {
    it('is ~0 for identical colors', () => {
      expect(Math.abs(apcaContrast(0.5, 0.5))).toBeLessThan(1);
    });

    it('is positive for dark text on light bg', () => {
      // text darker than bg → normal polarity → positive Lc
      expect(apcaContrast(0.05, 0.9)).toBeGreaterThan(0);
    });

    it('is negative for light text on dark bg', () => {
      expect(apcaContrast(0.9, 0.05)).toBeLessThan(0);
    });

    it('grows with separation', () => {
      const small = Math.abs(apcaContrast(0.4, 0.6));
      const large = Math.abs(apcaContrast(0.02, 0.98));
      expect(large).toBeGreaterThan(small);
    });
  });

  describe('okhslToLinearSrgb', () => {
    it('returns black for l=0', () => {
      const [r, g, b] = okhslToLinearSrgb(0, 0, 0);
      expect(r).toBeCloseTo(0, 2);
      expect(g).toBeCloseTo(0, 2);
      expect(b).toBeCloseTo(0, 2);
    });
    it('returns white for l=1', () => {
      const [r, g, b] = okhslToLinearSrgb(0, 0, 1);
      expect(r).toBeCloseTo(1, 2);
      expect(g).toBeCloseTo(1, 2);
      expect(b).toBeCloseTo(1, 2);
    });
    it('returns achromatic gray for s=0', () => {
      const [r, g, b] = okhslToLinearSrgb(0, 0, 0.5);
      expect(r).toBeCloseTo(g, 4);
      expect(g).toBeCloseTo(b, 4);
    });
  });

  describe('relativeLuminanceFromLinearRgb', () => {
    it('returns 0 for black', () => {
      expect(relativeLuminanceFromLinearRgb([0, 0, 0])).toBe(0);
    });
    it('returns 1 for white', () => {
      expect(relativeLuminanceFromLinearRgb([1, 1, 1])).toBe(1);
    });
  });

  describe('contrastRatioFromLuminance', () => {
    it('returns 21 for black vs white', () => {
      expect(contrastRatioFromLuminance(0, 1)).toBe(21);
    });
    it('returns 1 for same luminance', () => {
      expect(contrastRatioFromLuminance(0.5, 0.5)).toBe(1);
    });
    it('is symmetric', () => {
      expect(contrastRatioFromLuminance(0.2, 0.8)).toBe(
        contrastRatioFromLuminance(0.8, 0.2),
      );
    });
  });

  describe('findToneForContrast (WCAG)', () => {
    it('returns preferred when already passing', () => {
      const baseLinearRgb = okhslToLinearSrgb(0, 0, 0.97);
      const result = findToneForContrast({
        hue: 0,
        saturation: 0,
        preferredTone: 0.2,
        baseLinearRgb,
        contrast: wcag(4.5),
      });
      expect(result.met).toBe(true);
      expect(result.contrast).toBeGreaterThanOrEqual(4.5);
    });

    it('finds a passing lighter candidate against a dark base', () => {
      const baseLinearRgb = okhslToLinearSrgb(0, 0, 0.15);
      const result = findToneForContrast({
        hue: 0,
        saturation: 0,
        preferredTone: 0.5,
        baseLinearRgb,
        contrast: wcag(7),
      });
      expect(result.met).toBe(true);
      expect(result.contrast).toBeGreaterThanOrEqual(7);
    });

    it('finds a passing darker candidate against a light base', () => {
      const baseLinearRgb = okhslToLinearSrgb(0, 0, 0.95);
      const result = findToneForContrast({
        hue: 0,
        saturation: 0,
        preferredTone: 0.7,
        baseLinearRgb,
        contrast: wcag(4.5),
      });
      expect(result.met).toBe(true);
      expect(result.contrast).toBeGreaterThanOrEqual(4.5);
    });

    it('returns met=false when the range cannot reach the target', () => {
      const baseLinearRgb = okhslToLinearSrgb(0, 0, 0.5);
      const result = findToneForContrast({
        hue: 0,
        saturation: 0,
        preferredTone: 0.5,
        baseLinearRgb,
        contrast: wcag(21),
        toneRange: [0.4, 0.6],
      });
      expect(result.met).toBe(false);
    });

    it('returned tone satisfies the target when met=true (chromatic)', () => {
      const cases = [
        { hue: 280, sat: 0.8, baseL: 0.97, prefT: 0.45, target: 7 },
        { hue: 23, sat: 0.7, baseL: 0.15, prefT: 0.7, target: 4.5 },
        { hue: 157, sat: 0.6, baseL: 0.5, prefT: 0.9, target: 3 },
      ];
      for (const tc of cases) {
        const baseLinearRgb = okhslToLinearSrgb(tc.hue, tc.sat, tc.baseL);
        const result = findToneForContrast({
          hue: tc.hue,
          saturation: tc.sat,
          preferredTone: tc.prefT,
          baseLinearRgb,
          contrast: wcag(tc.target),
        });
        if (result.met) {
          const l = fromTone(result.tone * 100, REF_EPS);
          const yCandidate = srgbLuminance(tc.hue, tc.sat, l);
          const yBase = srgbLuminance(tc.hue, tc.sat, tc.baseL);
          const cr = contrastRatioFromLuminance(yCandidate, yBase);
          expect(cr).toBeGreaterThanOrEqual(tc.target);
        }
      }
    });

    it('uses gamut-clamped luminance for out-of-gamut chromatic colors', () => {
      const baseSat = (0.25 * 75) / 100;
      const baseLinearRgb = okhslToLinearSrgb(125, baseSat, 0.96);
      const candidateSat = (0.9 * 75) / 100;
      const result = findToneForContrast({
        hue: 125,
        saturation: candidateSat,
        preferredTone: 0.5,
        baseLinearRgb,
        contrast: wcag(4.5),
      });
      expect(result.met).toBe(true);

      const l = fromTone(result.tone * 100, REF_EPS);
      const yCandidate = gamutClampedLuminance(
        okhslToLinearSrgb(125, candidateSat, l),
      );
      const yBase = gamutClampedLuminance(baseLinearRgb);
      expect(
        contrastRatioFromLuminance(yCandidate, yBase),
      ).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe('findToneForContrast (APCA)', () => {
    it('meets an APCA Lc floor against a light base', () => {
      const baseLinearRgb = okhslToLinearSrgb(0, 0, 0.98);
      const result = findToneForContrast({
        hue: 0,
        saturation: 0,
        preferredTone: 0.5,
        baseLinearRgb,
        contrast: { metric: 'apca', target: 60 },
      });
      expect(result.met).toBe(true);
      expect(result.contrast).toBeGreaterThanOrEqual(60);
    });

    it('polarity orders APCA arguments (fg vs bg converge differently)', () => {
      const baseLinearRgb = okhslToLinearSrgb(0, 0, 0.5);
      const yBase = apcaLuminanceFromLinearRgb(baseLinearRgb);

      const fg = findToneForContrast({
        hue: 0,
        saturation: 0,
        preferredTone: 0.5,
        baseLinearRgb,
        contrast: { metric: 'apca', target: 45, polarity: 'fg' },
      });
      const bg = findToneForContrast({
        hue: 0,
        saturation: 0,
        preferredTone: 0.5,
        baseLinearRgb,
        contrast: { metric: 'apca', target: 45, polarity: 'bg' },
      });

      expect(fg.met).toBe(true);
      expect(bg.met).toBe(true);
      // APCA is asymmetric, so the two argument orders converge to different tones.
      expect(Math.abs(fg.tone - bg.tone)).toBeGreaterThan(0.01);

      // Each result meets the floor measured in its own polarity order.
      const yFg = apcaLuminanceFromLinearRgb(
        okhslToLinearSrgb(0, 0, fromTone(fg.tone * 100, REF_EPS)),
      );
      expect(Math.abs(apcaContrast(yFg, yBase))).toBeGreaterThanOrEqual(45);
      const yBg = apcaLuminanceFromLinearRgb(
        okhslToLinearSrgb(0, 0, fromTone(bg.tone * 100, REF_EPS)),
      );
      expect(Math.abs(apcaContrast(yBase, yBg))).toBeGreaterThanOrEqual(45);
    });
  });

  describe('tone contrast-uniformity', () => {
    it('equal tone steps give near-constant WCAG ratio between steps (gray)', () => {
      const ratios: number[] = [];
      for (let t = 20; t <= 90; t += 10) {
        const yLo = gamutClampedLuminance(
          okhslToLinearSrgb(0, 0, fromTone(t - 10, REF_EPS)),
        );
        const yHi = gamutClampedLuminance(
          okhslToLinearSrgb(0, 0, fromTone(t, REF_EPS)),
        );
        ratios.push(contrastRatioFromLuminance(yHi, yLo));
      }
      const min = Math.min(...ratios);
      const max = Math.max(...ratios);
      // Step-to-step contrast stays within a tight band.
      expect(max / min).toBeLessThan(1.15);
    });
  });

  describe('autoFlip behavior', () => {
    it('flip=false pins to an extreme on failure, never the preferred', () => {
      const baseLinearRgb = okhslToLinearSrgb(0, 0, 0.5);
      const result = findToneForContrast({
        hue: 0,
        saturation: 0,
        preferredTone: 0.5,
        baseLinearRgb,
        contrast: wcag(21),
        flip: false,
      });
      expect(result.met).toBe(false);
      expect(result.tone === 0 || result.tone === 1).toBe(true);
      expect(result.tone).not.toBe(0.5);
    });

    it('flip=true can flip direction to meet the target', () => {
      const baseLinearRgb = okhslToLinearSrgb(0, 0, 0.97);
      const result = findToneForContrast({
        hue: 0,
        saturation: 0,
        preferredTone: 0.95,
        baseLinearRgb,
        contrast: wcag(7),
        initialDirection: 'lighter',
        flip: true,
      });
      expect(result.met).toBe(true);
      expect(result.contrast).toBeGreaterThanOrEqual(7);
    });
  });

  describe('branch sides', () => {
    const sideOf = (tone: number, baseTone: number) =>
      tone < baseTone ? 'darker' : 'lighter';

    it('keeps the seed-anchored darker solve on its side (reported repro)', () => {
      // Against a gray base near tone 0.5247, white reaches only ~4.25:1, so AA
      // is reachable going darker alone. The darker gray seed (tone ~0.0307)
      // scores exactly 4.5:1 and used to be the boundary of *both* branches,
      // so the lighter branch fell back to it: tone 0.0307, contrast
      // 4.500001, branch 'lighter', flipped — the overshoot gone and the label
      // wrong. Which bases hit it depends on the 1e-4 tone quantization, so
      // sweep the neighborhood.
      for (let i = -50; i <= 50; i++) {
        const baseTone = 0.5247 + i * 1e-5;
        const shared = {
          hue: 0,
          saturation: 0,
          preferredTone: baseTone - 0.02,
          baseLinearRgb: grayBase(baseTone),
          contrast: wcag(4.5),
          initialDirection: 'darker' as const,
        };
        const withFlip = findToneForContrast({ ...shared, flip: true });
        const withoutFlip = findToneForContrast({ ...shared, flip: false });

        expect(withFlip).toEqual(withoutFlip);
        expect(withFlip.met).toBe(true);
        expect(withFlip.branch).toBe('darker');
        expect(withFlip.flipped).toBeUndefined();
        expect(withFlip.tone).toBeLessThan(baseTone);
        expect(withFlip.contrast).toBeGreaterThanOrEqual(4.5 * 1.01);
      }
    });

    it('never answers with a preferred tone that only clears the bare target', () => {
      // Between the overshoot crossing (4.545:1, tone ~0.0274) and the seed
      // (4.5:1, tone ~0.0307) a preferred tone meets AA but not the 1%
      // overshoot, so it is searched. The lighter branch used to return that
      // preferred tone itself as its best endpoint — nearer than any darker
      // result — labeled 'lighter' and flipped while sitting below the base.
      const baseTone = 0.5247;
      for (const preferredTone of [0.0285, 0.029, 0.03, 0.0305]) {
        const shared = {
          hue: 0,
          saturation: 0,
          preferredTone,
          baseLinearRgb: grayBase(baseTone),
          contrast: wcag(4.5),
          initialDirection: 'darker' as const,
        };
        const withFlip = findToneForContrast({ ...shared, flip: true });

        expect(withFlip).toEqual(
          findToneForContrast({ ...shared, flip: false }),
        );
        expect(withFlip.branch).toBe('darker');
        expect(withFlip.tone).toBeLessThan(preferredTone);
        expect(withFlip.contrast).toBeGreaterThanOrEqual(4.5 * 1.01);
      }
    });

    it('reports the side every result sits on (gray sweep)', () => {
      const failures: string[] = [];
      for (let baseTone = 0.02; baseTone < 0.99; baseTone += 0.0123) {
        const baseLinearRgb = grayBase(baseTone);
        for (const target of [1.5, 3, 4.5, 7, 11]) {
          for (const offset of [-0.2, -0.02, 0, 0.02, 0.2]) {
            const preferredTone = Math.min(1, Math.max(0, baseTone + offset));
            for (const initialDirection of ['darker', 'lighter'] as const) {
              for (const flip of [true, false]) {
                const r = findToneForContrast({
                  hue: 0,
                  saturation: 0,
                  preferredTone,
                  baseLinearRgb,
                  contrast: wcag(target),
                  initialDirection,
                  flip,
                });
                if (r.branch === 'preferred') continue;

                const problems: string[] = [];
                if (
                  r.flipped !== (r.branch !== initialDirection || undefined)
                ) {
                  problems.push('flipped disagrees with branch');
                }
                if (r.met) {
                  if (sideOf(r.tone, baseTone) !== r.branch) {
                    problems.push('result on the other side of the base');
                  }
                  // Away from the bounds, a met result carries the overshoot.
                  const atBound = r.tone === 0 || r.tone === 1;
                  if (!atBound && r.contrast < target * 1.01) {
                    problems.push('overshoot lost');
                  }
                } else if (
                  r.branch !== initialDirection ||
                  r.tone !== (initialDirection === 'darker' ? 0 : 1)
                ) {
                  problems.push('unmet result not pinned to its extreme');
                }
                if (problems.length > 0) {
                  failures.push(
                    `base ${baseTone.toFixed(4)} target ${target} ` +
                      `preferred ${preferredTone.toFixed(4)} ` +
                      `${initialDirection} flip=${flip}: ` +
                      `${problems.join(', ')} ${JSON.stringify(r)}`,
                  );
                }
              }
            }
          }
        }
      }
      expect(failures).toEqual([]);
    });

    it('breaks an exact tie toward the initial side', () => {
      // A neutral with no tone of its own sits the same tone distance from the
      // crossing on either side (tone is contrast-uniform for grays), so
      // nearest-wins is a tie that search noise used to decide.
      const failures: string[] = [];
      for (let baseTone = 0.3; baseTone < 0.8; baseTone += 0.0037) {
        for (const target of [1.2, 1.5, 2, 3]) {
          const shared = {
            hue: 0,
            saturation: 0,
            preferredTone: baseTone,
            baseLinearRgb: grayBase(baseTone),
            contrast: wcag(target),
          };
          const darker = findToneForContrast({
            ...shared,
            initialDirection: 'darker',
          });
          const lighter = findToneForContrast({
            ...shared,
            initialDirection: 'lighter',
          });
          // Only a genuine tie: both sides reach the overshoot off the bounds.
          if (!darker.met || darker.tone === 0) continue;
          if (!lighter.met || lighter.tone === 1) continue;

          for (const initialDirection of ['darker', 'lighter'] as const) {
            const r = findToneForContrast({
              ...shared,
              initialDirection,
              flip: true,
            });
            if (r.branch !== initialDirection || r.flipped) {
              failures.push(
                `base ${baseTone.toFixed(4)} target ${target} ` +
                  `${initialDirection}: ${JSON.stringify(r)}`,
              );
            }
          }
        }
      }
      expect(failures).toEqual([]);
    });

    it('reports the side every result sits on (APCA and saturated hues)', () => {
      // Tone is only gray-uniform, so the side is judged by the metric's own
      // luminance against the base, not by tone.
      const candidates: [number, number][] = [
        [0, 0],
        [30, 1],
        [140, 1],
        [265, 1],
        [90, 0.6],
      ];
      const contrasts: ResolvedContrast[] = [
        wcag(1.5),
        wcag(3),
        wcag(4.5),
        wcag(7),
        ...[15, 30, 45, 60, 75].flatMap((target) =>
          (['fg', 'bg'] as const).map(
            (polarity): ResolvedContrast => ({
              metric: 'apca',
              target,
              polarity,
            }),
          ),
        ),
      ];
      const failures: string[] = [];
      for (const [hue, saturation] of candidates) {
        for (let baseTone = 0.03; baseTone < 0.99; baseTone += 0.0371) {
          // A gray base and a base tinted like the candidate.
          for (const baseSat of saturation === 0 ? [0] : [0, saturation]) {
            const baseLinearRgb = toneRgb(hue, baseSat, baseTone);
            for (const contrast of contrasts) {
              const yBase = metricLuminance(contrast.metric, baseLinearRgb);
              for (const offset of [-0.2, -0.02, 0, 0.02, 0.2]) {
                const preferredTone = Math.min(
                  1,
                  Math.max(0, baseTone + offset),
                );
                for (const initialDirection of ['darker', 'lighter'] as const) {
                  for (const flip of [true, false]) {
                    const r = findToneForContrast({
                      hue,
                      saturation,
                      preferredTone,
                      baseLinearRgb,
                      contrast,
                      initialDirection,
                      flip,
                    });
                    const problems: string[] = [];
                    if (r.branch === 'preferred') {
                      // Kept as-is: only when it clears the floor.
                      if (r.tone !== preferredTone || !r.met) {
                        problems.push('preferred result not met at preferred');
                      }
                    } else {
                      if (
                        r.flipped !==
                        (r.branch !== initialDirection || undefined)
                      ) {
                        problems.push('flipped disagrees with branch');
                      }
                      if (r.met) {
                        const y = metricLuminance(
                          contrast.metric,
                          toneRgb(hue, saturation, r.tone),
                        );
                        if ((y < yBase ? 'darker' : 'lighter') !== r.branch) {
                          problems.push('result on the other side of the base');
                        }
                        const atBound = r.tone === 0 || r.tone === 1;
                        if (!atBound && r.contrast < searchTargetOf(contrast)) {
                          problems.push('overshoot lost');
                        }
                      } else if (
                        r.branch !== initialDirection ||
                        r.tone !== (initialDirection === 'darker' ? 0 : 1)
                      ) {
                        problems.push('unmet result not pinned to its extreme');
                      }
                    }
                    if (problems.length > 0) {
                      failures.push(
                        `h${hue} s${saturation} base ${baseTone.toFixed(4)}` +
                          `/${baseSat} ${JSON.stringify(contrast)} ` +
                          `preferred ${preferredTone.toFixed(4)} ` +
                          `${initialDirection} flip=${flip}: ` +
                          `${problems.join(', ')} ${JSON.stringify(r)}`,
                      );
                    }
                  }
                }
              }
            }
          }
        }
      }
      expect(failures).toEqual([]);
    });

    it('keeps its side when the inputs move by float noise', () => {
      // Authored tones are round numbers, and round numbers hit exact ties:
      // tone is WCAG-uniform, so a gray base at tone 50 is exactly as far from
      // black as from white, and a neutral at its base's own tone is exactly
      // as far from either crossing. Two computation paths that agree to 1e-12
      // must still pick the same side. The direction is derived the way the
      // resolver derives it: from the sign of the tone step, none when zero.
      const contrasts: ResolvedContrast[] = [
        wcag(1.5),
        wcag(3),
        wcag(4.5),
        { metric: 'apca', target: 30, polarity: 'fg' },
        { metric: 'apca', target: 45, polarity: 'bg' },
      ];
      const failures: string[] = [];
      for (const [hue, saturation] of [
        [0, 0],
        [30, 1],
        [265, 1],
      ] as const) {
        for (let i = 20; i <= 80; i++) {
          const baseTone = i / 100;
          for (const step of [0, 0.02, -0.02, 0.1, -0.1]) {
            const preferredTone = baseTone + step;
            const initialDirection =
              step === 0 ? undefined : step < 0 ? 'darker' : 'lighter';
            for (const contrast of contrasts) {
              const solve = (base: number, preferred: number) =>
                findToneForContrast({
                  hue,
                  saturation,
                  preferredTone: preferred,
                  baseLinearRgb: toneRgb(0, 0, base),
                  contrast,
                  initialDirection,
                  flip: true,
                });
              const ref = solve(baseTone, preferredTone);
              for (const e of [1e-12, -1e-12]) {
                for (const [base, preferred] of [
                  [baseTone + e, preferredTone],
                  [baseTone, preferredTone + e],
                  [baseTone + e, preferredTone + e],
                ]) {
                  const r = solve(base, preferred);
                  if (
                    r.branch !== ref.branch ||
                    r.flipped !== ref.flipped ||
                    Math.abs(r.tone - ref.tone) > 2e-4
                  ) {
                    failures.push(
                      `h${hue} s${saturation} base ${baseTone} step ${step} ` +
                        `${JSON.stringify(contrast)} e=${e}: ` +
                        `${JSON.stringify(ref)} -> ${JSON.stringify(r)}`,
                    );
                  }
                }
              }
            }
          }
        }
      }
      expect(failures).toEqual([]);
    });

    it('starts darker from a gray base at tone 50, whatever the float noise', () => {
      // Black and white both score sqrt(21):1 against it, so the starting side
      // is a tie; both sides then meet at the same distance and keep it.
      for (const e of [0, 5e-16, -5e-16, 1e-12, -1e-12]) {
        const r = findToneForContrast({
          hue: 0,
          saturation: 0,
          preferredTone: 0.5 + e,
          baseLinearRgb: grayBase(0.5 + e),
          contrast: wcag(1.5),
          flip: true,
        });
        expect(r.met).toBe(true);
        expect(r.branch).toBe('darker');
        expect(r.tone).toBeLessThan(0.5);
      }
    });
  });

  describe('preferred tone the search cannot improve on', () => {
    // A preferred tone that clears the bare target but not the overshoot is
    // searched; when no searched side reaches the floor it is the best answer.
    // Before, the only searched side ran across the base to the far extreme
    // and returned that (or tone 0 at 18.9 Lc for a white text that passes).
    const cases: {
      label: string;
      preferredTone: number;
      baseTone: number;
      directions: ('darker' | 'lighter' | undefined)[];
    }[] = [
      {
        label: 'white on a dark base',
        preferredTone: 1,
        baseTone: 0.35,
        directions: [undefined, 'darker'],
      },
      {
        label: 'black on a light base',
        preferredTone: 0,
        baseTone: 0.8,
        directions: [undefined, 'lighter'],
      },
    ];
    const metrics: Omit<ResolvedContrast, 'target'>[] = [
      { metric: 'wcag' },
      { metric: 'apca', polarity: 'fg' },
      { metric: 'apca', polarity: 'bg' },
    ];

    for (const c of cases) {
      for (const m of metrics) {
        it(`keeps ${c.label} at its bound (${m.metric} ${m.polarity ?? ''})`, () => {
          const baseLinearRgb = grayBase(c.baseTone);
          const score = scoreOf(
            { ...m, target: 0 },
            grayBase(c.preferredTone),
            baseLinearRgb,
          );
          // Clears the bare target, misses the overshoot.
          const contrast: ResolvedContrast = {
            ...m,
            target: m.metric === 'wcag' ? score / 1.005 : score - 0.2,
          };
          // The far side can't reach it.
          expect(
            scoreOf(contrast, grayBase(1 - c.preferredTone), baseLinearRgb),
          ).toBeLessThan(contrast.target);

          for (const initialDirection of c.directions) {
            for (const flip of [false, true]) {
              expect(
                findToneForContrast({
                  hue: 0,
                  saturation: 0,
                  preferredTone: c.preferredTone,
                  baseLinearRgb,
                  contrast,
                  initialDirection,
                  flip,
                }),
              ).toEqual({
                tone: c.preferredTone,
                contrast: score,
                met: true,
                branch: 'preferred',
              });
            }
          }
        });
      }
    }

    it('keeps it when a forced direction points away and flip is off', () => {
      const baseLinearRgb = grayBase(0.1439);
      const preferredTone = 0.6468;
      const score = scoreOf(
        { metric: 'apca', target: 0, polarity: 'fg' },
        grayBase(preferredTone),
        baseLinearRgb,
      );
      const result = findToneForContrast({
        hue: 0,
        saturation: 0,
        preferredTone,
        baseLinearRgb,
        contrast: { metric: 'apca', target: score - 0.1, polarity: 'fg' },
        initialDirection: 'darker',
        flip: false,
      });
      expect(result).toEqual({
        tone: preferredTone,
        contrast: score,
        met: true,
        branch: 'preferred',
      });
    });

    it('still pins to the extreme when the preferred tone misses the bare target', () => {
      const baseLinearRgb = grayBase(0.35);
      const score = scoreOf(wcag(0), grayBase(1), baseLinearRgb);
      const result = findToneForContrast({
        hue: 0,
        saturation: 0,
        preferredTone: 1,
        baseLinearRgb,
        contrast: wcag(score * 1.005),
        flip: true,
      });
      expect(result.met).toBe(false);
      expect(result.tone).toBe(0);
      expect(result.branch).toBe('darker');
    });

    it('reports met when there is no room to search', () => {
      const baseLinearRgb = grayBase(0.35);
      const score = scoreOf(wcag(0), grayBase(0.9), baseLinearRgb);
      const shared = {
        hue: 0,
        saturation: 0,
        preferredTone: 0.9,
        baseLinearRgb,
        toneRange: [0.9, 0.9] as [number, number],
      };
      expect(
        findToneForContrast({ ...shared, contrast: wcag(score / 1.005) }),
      ).toEqual({ tone: 0.9, contrast: score, met: true, branch: 'preferred' });
      expect(
        findToneForContrast({ ...shared, contrast: wcag(score * 1.005) }).met,
      ).toBe(false);
    });
  });

  describe('WCAG gray seed', () => {
    /** The gray tone at exactly `target` against a gray base, going darker. */
    const graySeed = (baseTone: number, target: number) => {
      const yBase = gamutClampedLuminance(grayBase(baseTone));
      return toneFromY((yBase + 0.05) / target - 0.05, REF_EPS) / 100;
    };
    /** Scan down from `preferredTone` for the first tone that clears `target`. */
    const scanNearestPass = (
      opts: Omit<FindToneForContrastOptions, 'contrast'>,
      target: number,
    ) => {
      const passes = (t: number) =>
        scoreOf(
          wcag(target),
          toneRgb(opts.hue, opts.saturation, t),
          opts.baseLinearRgb,
        ) >= target;
      let coarse = opts.preferredTone;
      while (coarse > 0 && !passes(coarse)) coarse -= 1e-3;
      for (let t = Math.min(opts.preferredTone, coarse + 1e-3); ; t -= 1e-5) {
        if (t <= 0 || passes(t)) return Math.max(0, t);
      }
    };

    it('reaches a chromatic crossing between the preferred tone and the seed', () => {
      // A saturated violet reads darker than its gray tone, so the gray seed
      // (tone ~0.476) already clears AA with room to spare (5.03:1). The seed
      // used to bound the search, so the result stopped there; the violet's
      // own crossing sits ~0.03 tone nearer the preferred tone.
      const shared = {
        hue: 280,
        saturation: 1,
        preferredTone: 0.72,
        baseLinearRgb: grayBase(0.97),
        contrast: wcag(4.5),
        flip: true,
      };
      expect(
        scoreOf(
          wcag(4.5),
          toneRgb(280, 1, graySeed(0.97, 4.5)),
          shared.baseLinearRgb,
        ),
      ).toBeGreaterThan(5);

      for (const initialDirection of ['darker', undefined] as const) {
        const result = findToneForContrast({ ...shared, initialDirection });
        expect(result.met).toBe(true);
        expect(result.branch).toBe('darker');
        expect(result.contrast).toBeGreaterThanOrEqual(4.545);
        expect(result.contrast).toBeLessThan(4.56);
        expect(result.tone).toBeGreaterThan(graySeed(0.97, 4.5) + 0.02);
      }
    });

    it('lands within twice the resolution of the nearest passing tone', () => {
      // Hues darker than gray at a given tone clear the gray seed; the result
      // must still be the crossing a fine scan finds, not the seed.
      const failures: string[] = [];
      let seedCleared = 0;
      for (const hue of [20, 35, 250, 280, 320]) {
        for (const baseTone of [0.9, 0.97]) {
          for (const target of [3, 4.5]) {
            const opts = {
              hue,
              saturation: 1,
              preferredTone: baseTone - 0.2,
              baseLinearRgb: grayBase(baseTone),
              initialDirection: 'darker' as const,
              flip: true,
            };
            const seed = graySeed(baseTone, target);
            const seedScore = scoreOf(
              wcag(target),
              toneRgb(hue, 1, seed),
              opts.baseLinearRgb,
            );
            // Only the seed-cleared case is interesting here.
            if (seedScore < target * 1.01) continue;
            seedCleared++;
            const result = findToneForContrast({
              ...opts,
              contrast: wcag(target),
            });
            const nearest = scanNearestPass(opts, target * 1.01);
            if (!result.met || Math.abs(result.tone - nearest) > 2e-4) {
              failures.push(
                `h${hue} base ${baseTone} target ${target}: ` +
                  `${result.tone} vs scan ${nearest} (seed ${seed})`,
              );
            }
          }
        }
      }
      expect(seedCleared).toBeGreaterThanOrEqual(10);
      expect(failures).toEqual([]);
    });
  });

  describe('findValueForMixContrast', () => {
    // A gray mix whose luminance rises from the base (v = 0) toward white.
    const yBase = 0.2;
    const shared = {
      baseLinearRgb: [yBase, yBase, yBase] as [number, number, number],
      contrast: wcag(2),
      luminanceAtValue: (v: number) => yBase + (1 - yBase) * v * v,
    };

    it('meets the floor nearest the preferred value', () => {
      const result = findValueForMixContrast({
        ...shared,
        preferredValue: 0.3,
      });
      expect(result.met).toBe(true);
      expect(result.value).toBeGreaterThan(0.3);
      expect(result.contrast).toBeGreaterThanOrEqual(2 * 1.01);
    });

    it('keeps the overshoot when the preferred value only clears the bare target', () => {
      // 2:1 needs v >= 0.559 and the 1% overshoot v >= 0.5646; 0.56 sits in
      // between. The lower branch used to return 0.56 itself as its best
      // endpoint, which then won as the "nearest" flipped result.
      const withFlip = findValueForMixContrast({
        ...shared,
        preferredValue: 0.56,
        flip: true,
      });
      expect(withFlip).toEqual(
        findValueForMixContrast({
          ...shared,
          preferredValue: 0.56,
          flip: false,
        }),
      );
      expect(withFlip.value).toBeGreaterThan(0.56);
      expect(withFlip.contrast).toBeGreaterThanOrEqual(2 * 1.01);
      expect(withFlip.flipped).toBeUndefined();
    });

    it('pins to the starting end when neither side meets the floor', () => {
      const result = findValueForMixContrast({
        ...shared,
        contrast: wcag(10),
        preferredValue: 0.5,
        flip: true,
      });
      expect(result.met).toBe(false);
      expect(result.value).toBe(1);
    });

    it('keeps a value of 1 that clears only the bare target', () => {
      // The only open side runs back to the base (1:1), so its search used to
      // pin to value 0 — the base itself — and report a floor the pure
      // target already meets as unmet.
      const yPure = shared.luminanceAtValue(1);
      const ratio = contrastRatioFromLuminance(yPure, yBase);
      // The closure stands in for APCA `Ys` as-is; the base is read as `Ys`.
      const ysBase = metricLuminance('apca', shared.baseLinearRgb);
      const lc = Math.abs(apcaContrast(yPure, ysBase));
      for (const contrast of [
        wcag(ratio / 1.005),
        { metric: 'apca', target: lc - 0.2, polarity: 'fg' } as const,
      ]) {
        const score = contrast.metric === 'wcag' ? ratio : lc;
        for (const flip of [false, true]) {
          expect(
            findValueForMixContrast({
              ...shared,
              contrast,
              preferredValue: 1,
              flip,
            }),
          ).toEqual({ value: 1, contrast: score, met: true });
        }
      }
    });

    it('keeps a value of 0 that clears only the bare target', () => {
      // Mirrored: the far end (v = 1) is the base, v = 0 the passing end.
      const mirrored = (v: number) => shared.luminanceAtValue(1 - v);
      const ratio = contrastRatioFromLuminance(mirrored(0), yBase);
      for (const flip of [false, true]) {
        expect(
          findValueForMixContrast({
            ...shared,
            luminanceAtValue: mirrored,
            contrast: wcag(ratio / 1.005),
            preferredValue: 0,
            flip,
          }),
        ).toEqual({ value: 0, contrast: ratio, met: true });
      }
    });

    it('still falls back to the base when the pure target misses the floor', () => {
      const ratio = contrastRatioFromLuminance(
        shared.luminanceAtValue(1),
        yBase,
      );
      const result = findValueForMixContrast({
        ...shared,
        contrast: wcag(ratio * 1.005),
        preferredValue: 1,
      });
      expect(result).toEqual({ value: 0, contrast: 1, met: false });
    });

    it('keeps a value-100 mix whose pure target clears the floor by less than the overshoot', () => {
      const measure = (a: ResolvedColorVariant, b: ResolvedColorVariant) => {
        const y = (v: ResolvedColorVariant) => {
          const c = variantToOkhsl(v);
          return gamutClampedLuminance(okhslToLinearSrgb(c.h, c.s, c.l));
        };
        return contrastRatioFromLuminance(y(a), y(b));
      };
      const build = (contrast?: number) => {
        const theme = glaze(0, 0);
        theme.colors({
          // Static, so all four schemes measure the same pair.
          surface: { tone: 100, mode: 'static' },
          accent: { tone: 50.31, mode: 'static' },
          ...(contrast === undefined
            ? {}
            : {
                wash: {
                  type: 'mix',
                  base: 'surface',
                  target: 'accent',
                  value: 100,
                  contrast,
                },
                veil: {
                  type: 'mix',
                  base: 'surface',
                  target: 'accent',
                  value: 100,
                  blend: 'transparent',
                  contrast,
                },
                ramp: {
                  type: 'mix',
                  base: 'surface',
                  target: 'accent',
                  value: [80, 100],
                  contrast,
                },
              }),
        });
        return theme.resolve();
      };
      const plain = build();
      const reach = measure(
        plain.get('accent')!.light,
        plain.get('surface')!.light,
      );

      const warn = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      let resolved: ReturnType<typeof build>;
      try {
        // Met by 0.5%, inside the 1% overshoot the search aims for.
        resolved = build(reach / 1.005);
        expect(warn).not.toHaveBeenCalled();
      } finally {
        warn.mockRestore();
      }

      const schemes = [
        'light',
        'dark',
        'lightContrast',
        'darkContrast',
      ] as const;
      for (const scheme of schemes) {
        const accent = resolved.get('accent')![scheme];
        // The pure target, not the base it used to collapse to.
        expect(resolved.get('wash')![scheme].t).toBeCloseTo(accent.t, 6);
        expect(resolved.get('ramp')![scheme].t).toBeCloseTo(accent.t, 6);
        expect(resolved.get('veil')![scheme].alpha).toBe(1);
      }
    });
  });
});
