import {
  resolveMinContrast,
  findLightnessForContrast,
} from './contrast-solver';
import {
  okhslToLinearSrgb,
  okhslToSrgb,
  srgbToOkhsl,
  sRGBGammaToLinear,
  relativeLuminanceFromLinearRgb,
  contrastRatioFromLuminance,
} from './okhsl-color-math';
import { glaze } from './glaze';

describe('contrast-solver', () => {
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

    it('returns mid-gray for l=0.5, s=0', () => {
      const [r, g, b] = okhslToLinearSrgb(0, 0, 0.5);
      // All channels should be equal for achromatic
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
      const a = contrastRatioFromLuminance(0.2, 0.8);
      const b = contrastRatioFromLuminance(0.8, 0.2);
      expect(a).toBe(b);
    });
  });

  describe('findLightnessForContrast', () => {
    it('returns preferred when already passing', () => {
      // White background (l=1, s=0) vs dark text
      const baseLinearRgb = okhslToLinearSrgb(0, 0, 0.97);
      const result = findLightnessForContrast({
        hue: 0,
        saturation: 0,
        preferredLightness: 0.2,
        baseLinearRgb,
        contrast: 'AA',
      });

      // Dark text on near-white should easily pass AA
      expect(result.met).toBe(true);
      expect(result.contrast).toBeGreaterThanOrEqual(4.5);
    });

    it('finds nearest passing lighter candidate', () => {
      // Dark background
      const baseLinearRgb = okhslToLinearSrgb(0, 0, 0.15);
      const result = findLightnessForContrast({
        hue: 0,
        saturation: 0,
        preferredLightness: 0.5,
        baseLinearRgb,
        contrast: 'AAA',
      });

      expect(result.met).toBe(true);
      expect(result.contrast).toBeGreaterThanOrEqual(7);
    });

    it('finds nearest passing darker candidate', () => {
      // Light background
      const baseLinearRgb = okhslToLinearSrgb(0, 0, 0.95);
      const result = findLightnessForContrast({
        hue: 0,
        saturation: 0,
        preferredLightness: 0.7,
        baseLinearRgb,
        contrast: 'AA',
      });

      expect(result.met).toBe(true);
      expect(result.contrast).toBeGreaterThanOrEqual(4.5);
    });

    it('returns met=false when impossible', () => {
      // Very narrow range that cannot achieve high contrast
      const baseLinearRgb = okhslToLinearSrgb(0, 0, 0.5);
      const result = findLightnessForContrast({
        hue: 0,
        saturation: 0,
        preferredLightness: 0.5,
        baseLinearRgb,
        contrast: 21, // Maximum possible contrast — only black vs white
        lightnessRange: [0.4, 0.6],
      });

      expect(result.met).toBe(false);
    });

    it('accuracy: returned candidate satisfies contrast >= target when met=true', () => {
      function srgbLuminance(h: number, s: number, l: number): number {
        const [r, g, b] = okhslToSrgb(h, s, l);
        return (
          0.2126 * sRGBGammaToLinear(r) +
          0.7152 * sRGBGammaToLinear(g) +
          0.0722 * sRGBGammaToLinear(b)
        );
      }

      const testCases = [
        {
          hue: 280,
          sat: 0.8,
          baseL: 0.97,
          prefL: 0.45,
          target: 'AAA' as const,
        },
        {
          hue: 23,
          sat: 0.7,
          baseL: 0.15,
          prefL: 0.7,
          target: 'AA' as const,
        },
        {
          hue: 157,
          sat: 0.6,
          baseL: 0.5,
          prefL: 0.9,
          target: 'AA-large' as const,
        },
      ];

      for (const tc of testCases) {
        const baseLinearRgb = okhslToLinearSrgb(tc.hue, tc.sat, tc.baseL);
        const result = findLightnessForContrast({
          hue: tc.hue,
          saturation: tc.sat,
          preferredLightness: tc.prefL,
          baseLinearRgb,
          contrast: tc.target,
        });

        if (result.met) {
          const yCandidate = srgbLuminance(tc.hue, tc.sat, result.lightness);
          const yBase = srgbLuminance(tc.hue, tc.sat, tc.baseL);
          const cr = contrastRatioFromLuminance(yCandidate, yBase);

          expect(cr).toBeGreaterThanOrEqual(resolveMinContrast(tc.target));
        }
      }
    });

    it('works with chromatic colors', () => {
      // Purple hue, high saturation
      const baseLinearRgb = okhslToLinearSrgb(280, 0.8, 0.97);
      const result = findLightnessForContrast({
        hue: 280,
        saturation: 0.8,
        preferredLightness: 0.45,
        baseLinearRgb,
        contrast: 'AAA',
      });

      expect(result.met).toBe(true);
      expect(result.contrast).toBeGreaterThanOrEqual(7);
    });

    it('meets AA contrast for high-saturation lime green on light surface', () => {
      // Reproduces the real-world case: lime theme accent-text-2 on surface-2.
      // Hue 125 at high saturation produces out-of-gamut linear sRGB (negative R).
      // Without gamut-clamped luminance the solver over-estimates contrast.
      const baseSat = (0.25 * 75) / 100;
      const baseLinearRgb = okhslToLinearSrgb(125, baseSat, 0.96);
      const candidateSat = (0.9 * 75) / 100;
      const result = findLightnessForContrast({
        hue: 125,
        saturation: candidateSat,
        preferredLightness: 0.5,
        baseLinearRgb,
        contrast: 'AA',
      });

      expect(result.met).toBe(true);

      // Verify with the real sRGB rendering pipeline
      const [cr, cg, cb] = okhslToSrgb(125, candidateSat, result.lightness);
      const yCandidate =
        0.2126 * sRGBGammaToLinear(cr) +
        0.7152 * sRGBGammaToLinear(cg) +
        0.0722 * sRGBGammaToLinear(cb);
      const [br, bg, bb] = okhslToSrgb(125, baseSat, 0.96);
      const yBase =
        0.2126 * sRGBGammaToLinear(br) +
        0.7152 * sRGBGammaToLinear(bg) +
        0.0722 * sRGBGammaToLinear(bb);
      const cr2 = contrastRatioFromLuminance(yCandidate, yBase);

      expect(cr2).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe('RGB output contrast robustness', () => {
    function rgbOutputLuminance(h: number, s: number, l: number): number {
      const [r, g, b] = okhslToSrgb(h, s, l);
      const rq = parseFloat((r * 255).toFixed(2)) / 255;
      const gq = parseFloat((g * 255).toFixed(2)) / 255;
      const bq = parseFloat((b * 255).toFixed(2)) / 255;
      return (
        0.2126 * sRGBGammaToLinear(rq) +
        0.7152 * sRGBGammaToLinear(gq) +
        0.0722 * sRGBGammaToLinear(bq)
      );
    }

    it('meets contrast targets after RGB formatting across all hues', () => {
      const colorDefs = {
        surface: { lightness: 100, saturation: 0.2 },
        'surface-2': { lightness: 96, saturation: 0.25 },
        'surface-3': { lightness: 92, saturation: 0.3 },
        text: {
          base: 'surface',
          lightness: 0,
          contrast: 'AAA' as const,
          saturation: 0.08,
        },
        'text-2': {
          base: 'surface-2',
          lightness: 0,
          contrast: 'AAA' as const,
          saturation: 0.08,
        },
        'text-3': {
          base: 'surface-3',
          lightness: 0,
          contrast: 'AAA' as const,
          saturation: 0.08,
        },
        'text-soft': {
          base: 'surface',
          lightness: 25,
          contrast: ['AA', 'AAA'] as [string, string],
          saturation: 0.05,
        },
        'text-soft-2': {
          base: 'surface-2',
          lightness: 25,
          contrast: ['AA', 'AAA'] as [string, string],
          saturation: 0.05,
        },
        'text-soft-3': {
          base: 'surface-3',
          lightness: 25,
          contrast: ['AA', 'AAA'] as [string, string],
          saturation: 0.05,
        },
        'accent-text': {
          base: 'surface',
          lightness: 50,
          contrast: ['AA', 'AAA'] as [string, string],
          saturation: 0.9,
        },
        'accent-text-2': {
          base: 'surface-2',
          lightness: 50,
          contrast: ['AA', 'AAA'] as [string, string],
          saturation: 0.9,
        },
        'accent-text-3': {
          base: 'surface-3',
          lightness: 50,
          contrast: ['AA', 'AAA'] as [string, string],
          saturation: 0.9,
        },
        'accent-surface-text': { lightness: 100, mode: 'fixed' as const },
        'accent-surface': {
          base: 'accent-surface-text',
          lightness: '-48',
          contrast: ['AA', 7] as [string, number],
          mode: 'fixed' as const,
        },
        'pop-surface': {
          base: 'accent-surface-text',
          lightness: '-48',
          contrast: ['AA', 'AAA'] as [string, string],
          mode: 'fixed' as const,
          saturation: 100,
        },
        'pop-text': {
          base: 'surface',
          lightness: '+1',
          contrast: ['AA', 'AAA'] as [string, string],
          saturation: 100,
        },
        'pop-text-2': {
          base: 'surface-2',
          lightness: '+1',
          contrast: ['AA', 'AAA'] as [string, string],
          saturation: 100,
        },
      };

      const pairsAA: [string, string][] = [
        ['surface', 'accent-text'],
        ['surface-2', 'accent-text-2'],
        ['surface-3', 'accent-text-3'],
        ['accent-surface-text', 'accent-surface'],
        ['surface', 'pop-text'],
        ['surface-2', 'pop-text-2'],
        ['accent-surface-text', 'pop-surface'],
        ['surface', 'text-soft'],
        ['surface-2', 'text-soft-2'],
        ['surface-3', 'text-soft-3'],
      ];
      const pairsAAA: [string, string][] = [
        ['surface', 'text'],
        ['surface-2', 'text-2'],
        ['surface-3', 'text-3'],
      ];

      const hues = [272, 15, 155, 70, 210, 340, 125];
      const failures: string[] = [];

      for (const hue of hues) {
        const theme = glaze(hue, 75);
        theme.colors(colorDefs);
        const resolved = theme.resolve();

        for (const scheme of [
          'light',
          'dark',
          'lightContrast',
          'darkContrast',
        ] as const) {
          const isHC = scheme.includes('Contrast');

          const check = (baseName: string, fgName: string, minCR: number) => {
            const base = resolved.get(baseName)!;
            const fg = resolved.get(fgName)!;
            const bv = base[scheme];
            const fv = fg[scheme];
            const yB = rgbOutputLuminance(bv.h, bv.s, bv.l);
            const yF = rgbOutputLuminance(fv.h, fv.s, fv.l);
            const cr = contrastRatioFromLuminance(yB, yF);
            if (cr < minCR) {
              failures.push(
                `hue=${hue} ${scheme}: ${baseName} vs ${fgName}: ${cr.toFixed(4)} < ${minCR}`,
              );
            }
          };

          for (const [b, f] of pairsAA) {
            check(b, f, isHC ? 7 : 4.5);
          }
          for (const [b, f] of pairsAAA) {
            check(b, f, 7);
          }
        }
      }

      expect(failures).toEqual([]);
    });
  });

  describe('OKHSL round-trip accuracy', () => {
    it('round-trips green-hue colors accurately (k4 coefficient regression)', () => {
      const testCases = [
        { h: 120, s: 0.8, l: 0.5 },
        { h: 140, s: 0.9, l: 0.4 },
        { h: 100, s: 0.7, l: 0.6 },
        { h: 160, s: 0.95, l: 0.3 },
        { h: 80, s: 0.85, l: 0.7 },
      ];

      for (const { h, s, l } of testCases) {
        const [r, g, b] = okhslToSrgb(h, s, l);
        const [h2, s2, l2] = srgbToOkhsl([r, g, b]);

        expect(h2).toBeCloseTo(h, 0);
        expect(s2).toBeCloseTo(s, 2);
        expect(l2).toBeCloseTo(l, 2);
      }
    });

    it('produces valid sRGB for saturated green hues', () => {
      for (let h = 80; h <= 170; h += 10) {
        const [r, g, b] = okhslToSrgb(h, 1.0, 0.5);

        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(1);
        expect(g).toBeGreaterThanOrEqual(0);
        expect(g).toBeLessThanOrEqual(1);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThanOrEqual(1);
      }
    });
  });
});
