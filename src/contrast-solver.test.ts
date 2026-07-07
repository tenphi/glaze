import {
  resolveMinContrast,
  resolveContrastForMode,
  findToneForContrast,
  apcaContrast,
} from './contrast-solver';
import type { ResolvedContrast } from './contrast-solver';
import {
  okhslToLinearSrgb,
  okhslToSrgb,
  sRGBGammaToLinear,
  relativeLuminanceFromLinearRgb,
  contrastRatioFromLuminance,
  gamutClampedLuminance,
  apcaLuminanceFromLinearRgb,
} from './okhsl-color-math';
import { fromTone, REF_EPS } from './okhst';
import { glaze } from './glaze';

const wcag = (target: number): ResolvedContrast => ({
  metric: 'wcag',
  target,
});

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
});
