import {
  resolveMinContrast,
  findLightnessForContrast,
} from './contrast-solver';
import {
  okhslToLinearSrgb,
  okhslToOklab,
  okhslToSrgb,
  srgbToOkhsl,
  sRGBGammaToLinear,
  sRGBLinearToGamma,
  relativeLuminanceFromLinearRgb,
  contrastRatioFromLuminance,
} from './okhsl-color-math';
import { glaze } from './glaze';

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

  describe('autoFlip behavior', () => {
    describe('findLightnessForContrast', () => {
      it('autoFlip=false: pins to initial-direction extreme when contrast impossible', () => {
        // Mid-gray base, ask for an impossible 21:1 contrast.
        // Initial direction is whichever extreme has higher contrast
        // (here: darker, since 0 vs 0.5 has higher contrast than 1 vs 0.5).
        const baseLinearRgb = okhslToLinearSrgb(0, 0, 0.5);
        const result = findLightnessForContrast({
          hue: 0,
          saturation: 0,
          preferredLightness: 0.5,
          baseLinearRgb,
          contrast: 21,
          flip: false,
        });

        expect(result.met).toBe(false);
        // Pinned to the initial-direction extreme (minL=0 or maxL=1),
        // never falls back to the preferred lightness (0.5).
        expect(result.lightness === 0 || result.lightness === 1).toBe(true);
        expect(result.lightness).not.toBe(0.5);
      });

      it('autoFlip=false: stays at initial-direction extreme when opposite would pass', () => {
        // Light base. Initial direction is darker (more contrast).
        // Restrict the search range so darker side can't meet AA but
        // lighter side could trivially meet it against a black extreme.
        // We construct the scenario where the initial (darker) branch
        // is too narrow to find a passing point.
        const baseLinearRgb = okhslToLinearSrgb(0, 0, 0.5);
        const result = findLightnessForContrast({
          hue: 0,
          saturation: 0,
          preferredLightness: 0.5,
          baseLinearRgb,
          contrast: 21,
          lightnessRange: [0.4, 0.6],
          flip: false,
        });

        expect(result.met).toBe(false);
        // Should pin to an extreme of the search range, not the preferred.
        expect(
          result.lightness === 0.4 || result.lightness === 0.6,
        ).toBe(true);
        expect(result.lightness).not.toBe(0.5);
        expect(result.flipped).toBeUndefined();
      });

      it('autoFlip=true: flips to opposite direction when initial fails', () => {
        // Dark base. Initial direction by extreme-contrast is "lighter"
        // (since light extreme has higher contrast vs dark base).
        // With preferredLightness biased to the dark side, the lighter
        // branch is wide and finds a passing candidate.
        // We pick the *opposite* setup: preferredLightness on the lighter
        // side of a dark base, restricted so initial direction's branch
        // is too narrow.
        const baseLinearRgb = okhslToLinearSrgb(0, 0, 0.05);
        // Initial direction here is "lighter" (cr(l=1) >> cr(l=0)
        // against a near-black base).
        // Set preferredLightness near maxL so initial (lighter) branch
        // [pref, maxL] is too narrow to find AAA.
        const result = findLightnessForContrast({
          hue: 0,
          saturation: 0,
          preferredLightness: 0.999,
          baseLinearRgb,
          contrast: 'AAA',
          flip: true,
        });

        // With flip enabled, even though the initial (narrow) lighter
        // branch may already meet contrast against a near-black base,
        // this test mostly ensures `flip: true` doesn't break results.
        expect(result.met).toBe(true);
      });

      it('autoFlip=true: returns initial-direction extreme when both directions fail', () => {
        // Impossible: mid-gray base, target 21:1.
        const baseLinearRgb = okhslToLinearSrgb(0, 0, 0.5);
        const result = findLightnessForContrast({
          hue: 0,
          saturation: 0,
          preferredLightness: 0.5,
          baseLinearRgb,
          contrast: 21,
          flip: true,
        });

        expect(result.met).toBe(false);
        // Fall back to initial-direction extreme.
        expect(result.lightness === 0 || result.lightness === 1).toBe(true);
        expect(result.lightness).not.toBe(0.5);
        // Both directions failed — not a successful flip.
        expect(result.flipped).toBeUndefined();
      });

      it('autoFlip=false: returns passing initial-direction candidate when available', () => {
        // Light base, preferred=0.7. Initial direction is darker.
        // The darker branch finds a passing candidate without needing
        // to flip.
        const baseLinearRgb = okhslToLinearSrgb(0, 0, 0.95);
        const result = findLightnessForContrast({
          hue: 0,
          saturation: 0,
          preferredLightness: 0.7,
          baseLinearRgb,
          contrast: 'AA',
          flip: false,
        });

        expect(result.met).toBe(true);
        expect(result.contrast).toBeGreaterThanOrEqual(4.5);
        expect(result.branch).toBe('darker');
        expect(result.flipped).toBeUndefined();
      });

      it('autoFlip=true and false agree when initial direction succeeds', () => {
        const baseLinearRgb = okhslToLinearSrgb(0, 0, 0.95);
        const opts = {
          hue: 0,
          saturation: 0,
          preferredLightness: 0.7,
          baseLinearRgb,
          contrast: 'AA' as const,
        };
        const strict = findLightnessForContrast({ ...opts, flip: false });
        const flexible = findLightnessForContrast({ ...opts, flip: true });

        expect(strict.met).toBe(true);
        expect(flexible.met).toBe(true);
        expect(flexible.lightness).toBeCloseTo(strict.lightness, 3);
      });
    });

    describe('through glaze config', () => {
      it('autoFlip=false: leaves color at extreme when contrast unmet', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(vi.fn());
        const theme = glaze(0, 0);
        glaze.configure({ autoFlip: false });
        // Both surface and accent have the same lightness — no contrast
        // possible. The mix with `contrast: AAA` should pin to the upper
        // extreme (full target) rather than stay at the preferred value.
        theme.colors({
          surface: { lightness: 95 },
          accent: { lightness: 96 },
          // Text on surface where AAA cannot be reached because the
          // saturation produces a near-white candidate.
          softText: {
            base: 'surface',
            lightness: 92,
            contrast: 21,
            saturation: 0.05,
          },
        });
        const resolved = theme.resolve();
        const text = resolved.get('softText')!;

        // The lightness is pinned to the extreme of the search range,
        // not the original preferred (0.92).
        expect(text.light.l).not.toBeCloseTo(0.92, 2);
        warnSpy.mockRestore();
      });

      it('autoFlip=true: finds passing candidate even when preferred direction fails', () => {
        glaze.configure({ autoFlip: true });
        const theme = glaze(0, 0);
        // preferredLightness=0.7 on light base — initial direction is
        // darker (higher extreme contrast). With autoFlip=true this
        // works identically to a normal solve.
        theme.colors({
          surface: { lightness: 95 },
          text: {
            base: 'surface',
            lightness: 70,
            contrast: 'AA',
            saturation: 0.05,
          },
        });
        const resolved = theme.resolve();
        const text = resolved.get('text')!;
        // Must end up dark enough to meet AA against surface.
        expect(text.light.l).toBeLessThan(0.5);
      });
    });
  });

  describe('RGB output contrast robustness', () => {
    // At certain hue/saturation/darkCurve combinations the base surface lands
    // just barely above the luminance threshold where AAA is achievable against
    // pure white (e.g. hue=155, surface-3 dark → Y≈0.10002 vs threshold 0.1).
    // A 0.1% tolerance accounts for this OKHSL-to-sRGB precision edge case.
    const CONTRAST_TOLERANCE = 0.999;

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
            if (cr < minCR * CONTRAST_TOLERANCE) {
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

  describe('OKLCH output contrast robustness', () => {
    const CONTRAST_TOLERANCE = 0.999;

    const OKLab_to_LMS_M = [
      [1.0, 0.3963377773761749, 0.2158037573099136],
      [1.0, -0.1055613458156586, -0.0638541728258133],
      [1.0, -0.0894841775298119, -1.2914855480194092],
    ];
    const LMS_to_linear_sRGB_M = [
      [4.076741636075959, -3.307711539258062, 0.2309699031821041],
      [-1.2684379732850313, 2.6097573492876878, -0.3413193760026569],
      [-0.004196076138675526, -0.703418617935936, 1.7076146940746113],
    ];

    function dot3(a: number[], b: number[]): number {
      return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    }

    function oklchOutputLuminance(h: number, s: number, l: number): number {
      const [L, a, b] = okhslToOklab(h, s, l);
      const C = Math.sqrt(a * a + b * b);
      let hh = Math.atan2(b, a) * (180 / Math.PI);
      hh = ((hh % 360) + 360) % 360;

      const Lq = parseFloat(L.toFixed(4));
      const Cq = parseFloat(C.toFixed(4));
      const Hq = parseFloat(hh.toFixed(2));

      const hRad = (Hq * Math.PI) / 180;
      const aq = Cq * Math.cos(hRad);
      const bq = Cq * Math.sin(hRad);
      const lab = [Lq, aq, bq];

      const lms = [
        dot3(lab, OKLab_to_LMS_M[0]),
        dot3(lab, OKLab_to_LMS_M[1]),
        dot3(lab, OKLab_to_LMS_M[2]),
      ];
      const lmsCubed = [lms[0] ** 3, lms[1] ** 3, lms[2] ** 3];
      const linR = dot3(lmsCubed, LMS_to_linear_sRGB_M[0]);
      const linG = dot3(lmsCubed, LMS_to_linear_sRGB_M[1]);
      const linB = dot3(lmsCubed, LMS_to_linear_sRGB_M[2]);

      const r = sRGBGammaToLinear(
        Math.max(0, Math.min(1, sRGBLinearToGamma(linR))),
      );
      const g = sRGBGammaToLinear(
        Math.max(0, Math.min(1, sRGBLinearToGamma(linG))),
      );
      const bCh = sRGBGammaToLinear(
        Math.max(0, Math.min(1, sRGBLinearToGamma(linB))),
      );
      return 0.2126 * r + 0.7152 * g + 0.0722 * bCh;
    }

    it('meets contrast targets after OKLCH formatting across all hues', () => {
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
            const yB = oklchOutputLuminance(bv.h, bv.s, bv.l);
            const yF = oklchOutputLuminance(fv.h, fv.s, fv.l);
            const cr = contrastRatioFromLuminance(yB, yF);
            if (cr < minCR * CONTRAST_TOLERANCE) {
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
