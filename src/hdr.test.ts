import { glaze } from './glaze';
import { contrastFraction, numberAt } from './hc-pair';
import { computeLighting, resolveLightingTuning } from './lighting';
import {
  formatSrgbLinear,
  okhslToLinearSrgb,
  okhslToSrgb,
  relativeLuminanceFromLinearRgb,
  sRGBGammaToLinear,
} from './okhsl-color-math';
import { okhstToOkhsl, toneFromY, variantToOkhsl, yFromTone } from './okhst';
import type {
  ColorMap,
  GlazeConfigOverride,
  GlazeTheme,
  GlowTuning,
  OkhstColor,
  ResolvedColor,
  ResolvedColorVariant,
  ResolvedHdr,
} from './types';

const SCHEMES = ['light', 'dark', 'lightContrast', 'darkContrast'] as const;

/** Luminance tone the browser paints for an OKHSL color (gamut-clamped). */
function paintedTone(
  c: { h: number; s: number; l: number },
  pastel = false,
): number {
  const lin = okhslToSrgb(c.h, c.s, c.l, pastel).map(sRGBGammaToLinear) as [
    number,
    number,
    number,
  ];
  return toneFromY(relativeLuminanceFromLinearRgb(lin));
}

/** Linear sRGB of an HDR value, the way a consumer rebuilds it. */
function hdrLinear(hdr: ResolvedHdr): [number, number, number] {
  const { h, s, l } = variantToOkhsl(hdr);
  const m = 2 ** hdr.exposure;
  const [r, g, b] = okhslToLinearSrgb(h, s, l);
  return [r * m, g * m, b * m];
}

/** Luminance tone (past 100) of an HDR value. */
function hdrTone(hdr: ResolvedHdr | undefined): number {
  expect(hdr).toBeDefined();
  return toneFromY(relativeLuminanceFromLinearRgb(hdrLinear(hdr!)));
}

/** Every SDR field of a variant, for bit-identity checks. */
function sdrOf(v: ResolvedColorVariant): unknown[] {
  return [v.h, v.s, v.t, v.alpha, v.pastel];
}

let warn: ReturnType<typeof vi.spyOn>;

function warnings(match: string): string[] {
  return warn.mock.calls
    .map((c: unknown[]) => String(c[0]))
    .filter((m: string) => m.includes(match));
}

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  warn.mockRestore();
  glaze.resetConfig();
});

/**
 * The design's worked example: `glaze(280, 80)` with a white surface, a
 * neutral static surface at tone 95, and a neutral static inverse at tone 12,
 * each with a 12-tone glow.
 */
function workedExample(
  config?: GlazeConfigOverride,
): Map<string, ResolvedColor> {
  const theme = glaze(280, 80, config);
  theme.colors({
    surface: { tone: 100 },
    'surface-glow': { type: 'glow', bg: 'surface', intensity: 12 },
    near: { tone: 95, saturation: 0, mode: 'static' },
    'near-glow': { type: 'glow', bg: 'near', intensity: 12 },
    inverse: { tone: 12, saturation: 0, mode: 'static' },
    'inverse-glow': { type: 'glow', bg: 'inverse', intensity: 12 },
  });
  return theme.resolve();
}

/** A theme with several glows — over white, near-white, mid, dark, tinted, with objects. */
const DEFS: ColorMap = {
  surface: { tone: 100 },
  paper: { tone: 97, saturation: 0 },
  near: { tone: 95, mode: 'static' },
  mid: { tone: 50 },
  inverse: { tone: 12, mode: 'static' },
  chip: { hue: 40, tone: 85 },
  text: { base: 'surface', contrast: 'AA' },
  'surface-glow': { type: 'glow', bg: 'surface', intensity: 12 },
  'paper-glow': { type: 'glow', bg: 'paper', intensity: [6, 14] },
  'near-glow': { type: 'glow', bg: 'near', fg: 'chip', intensity: 12 },
  'mid-glow': {
    type: 'glow',
    bg: 'mid',
    intensity: 70,
    tuning: { reach: 0.6, tint: 0.5 },
  },
  'inverse-glow': { type: 'glow', bg: 'inverse', intensity: 12 },
  'chip-glow': { type: 'glow', bg: 'chip', fg: 'surface', intensity: 30 },
  'surface-shadow': { type: 'shadow', bg: 'surface', intensity: 8 },
};

/** `DEFS` with a per-color headroom on two of its glows. */
const TUNED_DEFS: ColorMap = {
  ...DEFS,
  'surface-glow': {
    type: 'glow',
    bg: 'surface',
    intensity: 12,
    tuning: { headroom: 2 },
  },
  'chip-glow': {
    type: 'glow',
    bg: 'chip',
    fg: 'surface',
    intensity: 30,
    tuning: { headroom: 0.5 },
  },
};

const ALL_MODES = { modes: { dark: true, highContrast: true } };

/**
 * Every exporter's output, serialized so key order counts too. `splitHue`
 * needs an all-pastel theme, so it runs on a pastel twin.
 */
function exportAll(defs: ColorMap, config?: GlazeConfigOverride): string {
  const theme = themeWith(defs, config);
  const pastel = themeWith(defs, { ...config, pastel: true });
  return JSON.stringify({
    tasty: theme.tasty(ALL_MODES),
    tastyOkhst: theme.tasty({ ...ALL_MODES, format: 'okhst' }),
    tastySplitHue: pastel.tasty({ ...ALL_MODES, splitHue: true }),
    cssSplitHue: pastel.css({ splitHue: true }),
    json: theme.json(ALL_MODES),
    jsonRgb: theme.json({ ...ALL_MODES, format: 'rgb' }),
    css: theme.css(),
    cssHsl: theme.css({ format: 'hsl' }),
    tokens: theme.tokens(ALL_MODES),
    dtcg: theme.dtcg(ALL_MODES),
    dtcgResolver: theme.dtcgResolver(ALL_MODES),
    tailwind: theme.tailwind(ALL_MODES),
  });
}

function themeWith(defs: ColorMap, config?: GlazeConfigOverride): GlazeTheme {
  const theme = glaze(280, 80, config);
  theme.colors(defs);
  return theme;
}

describe('HDR glows', () => {
  describe('the SDR result is untouched', () => {
    it('leaves h / s / t / alpha bit-identical at headroom 1 and 0 over a sweep', () => {
      const surfaces = [0, 0.6];
      const objects: (OkhstColor | undefined)[] = [
        undefined,
        { h: 150, s: 0.7, t: 0.2 },
        { h: 30, s: 0.4, t: 0.95 },
      ];
      const tunings: GlowTuning[] = [
        {},
        { tint: 0.5, reach: 0.6 },
        { tint: 0.3, reach: 0.85, hueBleed: 0.5 },
      ];
      const mismatches: string[] = [];
      let withHdr = 0;
      let total = 0;
      for (let tone = 0; tone <= 100; tone += 5) {
        for (let intensity = 0; intensity <= 40; intensity += 4) {
          for (const sat of surfaces) {
            for (const fg of objects) {
              for (const tuning of tunings) {
                const input = {
                  bg: { h: 260, s: sat, t: tone / 100 },
                  fg,
                  intensity,
                };
                const sdr = glaze.glow({
                  ...input,
                  tuning: { ...tuning, headroom: 0 },
                });
                const hdr = glaze.glow({
                  ...input,
                  tuning: { ...tuning, headroom: 1 },
                });
                total++;
                if ('hdr' in sdr)
                  mismatches.push(`hdr at 0: ${tone}/${intensity}`);
                if (hdr.hdr) withHdr++;
                const a = JSON.stringify(sdrOf(sdr));
                const b = JSON.stringify(sdrOf(hdr));
                if (a !== b) {
                  mismatches.push(`${tone}/${intensity}/${sat}: ${a} vs ${b}`);
                }
              }
            }
          }
        }
      }
      expect(mismatches).toEqual([]);
      expect(total).toBe(21 * 11 * 2 * 3 * 3);
      // The sweep crosses white often enough to exercise the HDR branch.
      expect(withHdr).toBeGreaterThan(200);
    });

    it('leaves every resolved variant bit-identical across schemes and HC pairs', () => {
      const a = themeWith(DEFS).resolve();
      const b = themeWith(DEFS, { glowTuning: { headroom: 1 } }).resolve();
      for (const [name, color] of a) {
        for (const scheme of SCHEMES) {
          expect(sdrOf(b.get(name)![scheme])).toEqual(sdrOf(color[scheme]));
          expect('hdr' in color[scheme]).toBe(false);
        }
      }
      expect(b.get('surface-glow')!.light.hdr).toBeDefined();
    });

    it('keeps every exporter byte-identical with headroom set', () => {
      const sdr = exportAll(DEFS);

      expect(exportAll(DEFS, { glowTuning: { headroom: 1 } })).toBe(sdr);
      expect(exportAll(DEFS, { glowTuning: { headroom: 2 } })).toBe(sdr);
      expect(exportAll(TUNED_DEFS)).toBe(sdr);

      glaze.configure({ glowTuning: { headroom: 1.5 } });
      expect(
        themeWith(DEFS).resolve().get('near-glow')!.light.hdr,
      ).toBeDefined();
      expect(exportAll(DEFS)).toBe(sdr);
    });
  });

  describe('exact steps', () => {
    it('lands white + 12 at tone 112 and 95 + 12 at tone 107', () => {
      const r = workedExample({ glowTuning: { headroom: 1 } });
      for (const scheme of ['light', 'lightContrast'] as const) {
        expect(hdrTone(r.get('surface-glow')![scheme].hdr)).toBeCloseTo(112, 9);
      }
      for (const scheme of SCHEMES) {
        expect(hdrTone(r.get('near-glow')![scheme].hdr)).toBeCloseTo(107, 9);
      }
    });

    it('lands tinted steps to 1e-9', () => {
      const cases: [OkhstColor, GlowTuning, number][] = [
        [{ h: 40, s: 0.6, t: 0.97 }, { reach: 0.5, tint: 0.6 }, 12],
        [{ h: 150, s: 0.8, t: 0.9 }, { reach: 0.7, tint: 0.4 }, 20],
        [{ h: 260, s: 0.9, t: 0.6 }, { reach: 0.8, tint: 0.5 }, 48],
        [{ h: 320, s: 0.3, t: 0.99 }, { reach: 0.9, tint: 1 }, 6],
      ];
      for (const [bg, tuning, intensity] of cases) {
        const v = glaze.glow({
          bg,
          intensity,
          tuning: { ...tuning, headroom: 2 },
        });
        expect(v.hdr!.s).toBeGreaterThan(0);
        expect(hdrTone(v.hdr) - paintedTone(okhstToOkhsl(bg))).toBeCloseTo(
          intensity,
          9,
        );
      }
    });

    it('stores a pastel tinted base as standard OKHSL and lands its step', () => {
      const theme = glaze(280, 80, {
        pastel: true,
        glowTuning: { headroom: 2 },
      });
      theme.colors({
        mid: { tone: 50 },
        'mid-glow': {
          type: 'glow',
          bg: 'mid',
          intensity: 70,
          tuning: { reach: 0.6, tint: 0.5 },
        },
      });
      const r = theme.resolve();
      const glow = r.get('mid-glow')!.light;
      expect(glow.pastel).toBe(true);
      expect(glow.alpha).toBe(1);
      // The base is the pinned pigment, re-expressed outside pastel space.
      expect(glow.hdr!.h).toBeCloseTo(glow.h, 6);
      expect(glow.hdr!.s).toBeLessThan(glow.s);
      expect(glow.hdr!.t).toBeCloseTo(glow.t, 9);
      const surface = variantToOkhsl(r.get('mid')!.light);
      expect(hdrTone(glow.hdr) - paintedTone(surface, true)).toBeCloseTo(70, 9);
    });

    it('lands an object-scaled tinted step to 1e-9', () => {
      const bg = okhstToOkhsl({ h: 40, s: 0.6, t: 0.95 });
      const fg = okhstToOkhsl({ h: 200, s: 0.5, t: 0.99 });
      const tuning = resolveLightingTuning({
        reach: 0.7,
        tint: 0.5,
        hueBleed: 0.5,
        headroom: 2,
      });
      const result = computeLighting('glow', bg, fg, 12, tuning, false);
      expect(result.step).toBeGreaterThan(12);
      expect(result.hdr!.reached).toBeCloseTo(result.step, 9);

      const v = glaze.glow({
        bg: { h: 40, s: 0.6, t: 0.95 },
        fg: { h: 200, s: 0.5, t: 0.99 },
        intensity: 12,
        tuning: { reach: 0.7, tint: 0.5, hueBleed: 0.5, headroom: 2 },
      });
      expect(hdrTone(v.hdr) - paintedTone(bg)).toBeCloseTo(result.step, 9);
    });
  });

  describe('trigger', () => {
    it('appears exactly when the target tone passes 100', () => {
      const bg = { h: 0, s: 0, t: 0.9 };
      const below = glaze.glow({
        bg,
        intensity: 10 - 1e-6,
        tuning: { headroom: 1 },
      });
      const above = glaze.glow({
        bg,
        intensity: 10 + 1e-6,
        tuning: { headroom: 1 },
      });
      expect('hdr' in below).toBe(false);
      expect(above.hdr!.exposure).toBeGreaterThan(0);
      expect(above.hdr!.exposure).toBeLessThan(1e-6);
    });

    it('fires on a white theme surface, where SDR stays transparent', () => {
      const r = workedExample({ glowTuning: { headroom: 1 } });
      const light = r.get('surface-glow')!.light;
      expect(light.alpha).toBe(0);
      expect(light.hdr!.t).toBe(1);
      // Dark inverts the surface; the glow stays below white there.
      expect('hdr' in r.get('surface-glow')!.dark).toBe(false);
      expect('hdr' in r.get('surface-glow')!.darkContrast).toBe(false);
    });

    it("fires on a standalone '#ffffff', where SDR pins opaque", () => {
      const v = glaze.glow({
        bg: '#ffffff',
        intensity: 12,
        tuning: { headroom: 1 },
      });
      expect(v.alpha).toBe(1);
      expect(v.hdr!.exposure).toBeCloseTo(0.549, 3);
      expect(glaze.formatHdr(v)).toBe(
        'color(srgb-linear 1.4631 1.4631 1.4631)',
      );
    });

    it('never fires below white, for shadows, or at the default headroom', () => {
      const r = workedExample({ glowTuning: { headroom: 1 } });
      for (const scheme of SCHEMES) {
        expect('hdr' in r.get('inverse-glow')![scheme]).toBe(false);
      }
      const shadow = themeWith(DEFS, { glowTuning: { headroom: 2 } })
        .resolve()
        .get('surface-shadow')!;
      for (const scheme of SCHEMES) {
        expect('hdr' in shadow[scheme]).toBe(false);
      }
      for (const [, color] of workedExample()) {
        for (const scheme of SCHEMES) {
          expect('hdr' in color[scheme]).toBe(false);
        }
      }
      expect('hdr' in glaze.glow({ bg: '#ffffff', intensity: 12 })).toBe(false);
    });

    it('returns hdr from glaze.glow() with a global glowTuning headroom', () => {
      glaze.configure({ glowTuning: { headroom: 1 } });
      const v = glaze.glow({ bg: { h: 0, s: 0, t: 0.95 }, intensity: 12 });
      expect(hdrTone(v.hdr)).toBeCloseTo(107, 9);
      // A per-call headroom wins over the global one.
      const off = glaze.glow({
        bg: { h: 0, s: 0, t: 0.95 },
        intensity: 12,
        tuning: { headroom: 0 },
      });
      expect('hdr' in off).toBe(false);
    });
  });

  describe('headroom cap', () => {
    it('caps the brightest channel at 2^headroom and warns once per scheme', () => {
      const resolveCapped = () => {
        const theme = glaze(0, 0, { glowTuning: { headroom: 1 } });
        theme.colors({
          paper: { tone: 100 },
          'cap-glow': { type: 'glow', bg: 'paper', intensity: 30 },
        });
        return theme.resolve();
      };
      const v = resolveCapped().get('cap-glow')!.light;
      resolveCapped();

      expect(v.hdr!.exposure).toBeCloseTo(1, 9);
      expect(hdrTone(v.hdr) - 100).toBeCloseTo(21.98, 2);
      expect(glaze.formatHdr(v)).toBe('color(srgb-linear 2 2 2)');

      const result = computeLighting(
        'glow',
        { h: 0, s: 0, l: 1 },
        undefined,
        30,
        resolveLightingTuning({ headroom: 1 }),
        false,
      );
      expect(result.hdr!.reached).toBeCloseTo(21.98, 2);

      expect(warnings('glow "cap-glow"')).toEqual([
        'glaze: glow "cap-glow" cannot reach a 30.0-tone step in light scheme ' +
          'even with 1 stop of headroom (reached 22.0). Lower the intensity ' +
          'or raise `headroom`.',
        'glaze: glow "cap-glow" cannot reach a 30.0-tone step in lightContrast ' +
          'scheme even with 1 stop of headroom (reached 22.0). Lower the ' +
          'intensity or raise `headroom`.',
      ]);
    });

    it('says so when the headroom is already at its maximum', () => {
      const theme = glaze(0, 0, { glowTuning: { headroom: 2 } });
      theme.colors({
        paper: { tone: 100 },
        'max-glow': { type: 'glow', bg: 'paper', intensity: 60 },
      });
      const v = theme.resolve().get('max-glow')!.light;
      expect(v.hdr!.exposure).toBeCloseTo(2, 9);
      expect(glaze.formatHdr(v)).toBe('color(srgb-linear 4 4 4)');
      expect(warnings('glow "max-glow"')[0]).toBe(
        'glaze: glow "max-glow" cannot reach a 60.0-tone step in light scheme ' +
          'even with 2 stops of headroom (reached 44.3). Lower the intensity; ' +
          '`headroom` is already at its 2-stop maximum.',
      );
    });

    it('caps per channel on a tinted base', () => {
      const v = glaze.glow({
        bg: { h: 30, s: 0.9, t: 0.97 },
        intensity: 40,
        tuning: { reach: 0.6, tint: 0.9, headroom: 0.5 },
      });
      const peak = Math.max(...hdrLinear(v.hdr!));
      expect(peak).toBeCloseTo(2 ** 0.5, 9);
      expect(
        warnings('glaze.glow() cannot reach a 40.0-tone step'),
      ).toHaveLength(1);
    });

    it('suppresses the SDR shortfall warning when HDR covers the step', () => {
      const resolveNear = (name: string, headroom: number) => {
        const theme = glaze(0, 0, { glowTuning: { headroom } });
        theme.colors({
          near: { tone: 95, mode: 'static' },
          [name]: { type: 'glow', bg: 'near', intensity: 12 },
        });
        return theme.resolve().get(name)!;
      };
      expect(resolveNear('quiet-glow', 1).light.hdr).toBeDefined();
      expect(warnings('quiet-glow')).toEqual([]);

      // At headroom 0 the SDR warning keeps its old text.
      expect('hdr' in resolveNear('loud-glow', 0).light).toBe(false);
      expect(warnings('glow "loud-glow"')[0]).toBe(
        'glaze: glow "loud-glow" cannot reach a 12.0-tone step in light scheme ' +
          '(reached 5.0 at full strength). Lower the intensity, move the ' +
          'surface away from white, or raise a tuned-down `reach`.',
      );
    });
  });

  it('exposure goes to 0⁺ as the target goes to 100⁺', () => {
    const bg = { h: 0, s: 0, t: 0.9 };
    let previous = Infinity;
    let last: ResolvedColorVariant | undefined;
    for (const delta of [1, 1e-1, 1e-2, 1e-4, 1e-6, 1e-8]) {
      last = glaze.glow({ bg, intensity: 10 + delta, tuning: { headroom: 1 } });
      const exposure = last.hdr!.exposure;
      expect(exposure).toBeGreaterThan(0);
      expect(exposure).toBeLessThan(previous);
      expect(exposure).toBeCloseTo(Math.log2(yFromTone(100 + delta)), 9);
      previous = exposure;
    }
    expect(previous).toBeLessThan(1e-9);
    // The HDR value meets the SDR result — opaque white — at the boundary.
    expect(last!.alpha).toBe(1);
    expect(glaze.format(last!)).toBe('oklch(1 0 0)');
    expect(glaze.formatHdr(last!)).toBe('color(srgb-linear 1 1 1)');
  });

  describe('theme behavior', () => {
    it('solves each HC pass with its own intensity and the same headroom', () => {
      const theme = glaze(0, 0, {
        lightTone: false,
        darkTone: false,
        glowTuning: { headroom: 1 },
      });
      theme.colors({
        paper: { tone: 92 },
        'pair-glow': { type: 'glow', bg: 'paper', intensity: [6, 14] },
        'big-glow': { type: 'glow', bg: 'paper', intensity: [12, 40] },
      });
      const r = theme.resolve();
      const pair = r.get('pair-glow')!;
      expect('hdr' in pair.light).toBe(false);
      expect(hdrTone(pair.lightContrast.hdr)).toBeCloseTo(106, 9);
      expect('hdr' in pair.dark).toBe(false);
      expect('hdr' in pair.darkContrast).toBe(false);

      const big = r.get('big-glow')!;
      expect(hdrTone(big.light.hdr)).toBeCloseTo(104, 9);
      expect(big.lightContrast.hdr!.exposure).toBeCloseTo(1, 9);
    });

    it('interpolates intensity per pass under a manual contrastLevel', () => {
      let hdrLevels = 0;
      for (const level of [0, 25, 50, 75, 100]) {
        const theme = glaze(0, 0, {
          lightTone: false,
          darkTone: false,
          contrastLevel: level,
          glowTuning: { headroom: 1 },
        });
        theme.colors({
          paper: { tone: 92 },
          'level-glow': { type: 'glow', bg: 'paper', intensity: [6, 14] },
        });
        const glow = theme.resolve().get('level-glow')!;
        const intensity = numberAt(
          [6, 14],
          contrastFraction({ contrastLevel: level })!,
        );
        if (92 + intensity > 100) {
          hdrLevels++;
          expect(hdrTone(glow.light.hdr)).toBeCloseTo(92 + intensity, 9);
        } else {
          expect('hdr' in glow.light).toBe(false);
        }
        // The HC tier is the 'auto' one at every level.
        expect(hdrTone(glow.lightContrast.hdr)).toBeCloseTo(106, 9);
      }
      expect(hdrLevels).toBeGreaterThanOrEqual(2);
    });

    it('extend() inherits glow tuning and per-color headroom', () => {
      const parent = glaze(280, 80, { glowTuning: { headroom: 1 } });
      parent.colors({
        surface: { tone: 100 },
        'surface-glow': { type: 'glow', bg: 'surface', intensity: 12 },
        'tuned-glow': {
          type: 'glow',
          bg: 'surface',
          intensity: 30,
          tuning: { headroom: 2 },
        },
      });

      const child = parent.extend({ hue: 40 }).resolve();
      expect(hdrTone(child.get('surface-glow')!.light.hdr)).toBeCloseTo(112, 9);
      expect(hdrTone(child.get('tuned-glow')!.light.hdr)).toBeCloseTo(130, 9);

      const sdrChild = parent
        .extend({ config: { glowTuning: { headroom: 0 } } })
        .resolve();
      expect('hdr' in sdrChild.get('surface-glow')!.light).toBe(false);
      // The per-color headroom still wins over the child's global one.
      expect(hdrTone(sdrChild.get('tuned-glow')!.light.hdr)).toBeCloseTo(
        130,
        9,
      );
    });

    it('resolves HDR in palette themes and keeps palette exports byte-identical', () => {
      const build = (headroom: number) => {
        const brand = themeWith(DEFS, { glowTuning: { headroom } });
        const accent = glaze(40, 60, { glowTuning: { headroom } });
        accent.colors(DEFS);
        return glaze.palette({ brand, accent }, { primary: 'brand' });
      };
      const sdr = build(0);
      const hdr = build(1);

      expect(
        hdrTone(hdr.theme('brand')!.resolve().get('surface-glow')!.light.hdr),
      ).toBeCloseTo(112, 9);
      expect(
        hdrTone(hdr.theme('accent')!.resolve().get('surface-glow')!.light.hdr),
      ).toBeCloseTo(112, 9);
      expect(
        'hdr' in sdr.theme('brand')!.resolve().get('surface-glow')!.light,
      ).toBe(false);

      const exportPalette = (p: typeof sdr) =>
        JSON.stringify({
          tasty: p.tasty(ALL_MODES),
          json: p.json(ALL_MODES),
          css: p.css(),
          tokens: p.tokens(ALL_MODES),
          dtcg: p.dtcg(ALL_MODES),
          dtcgResolver: p.dtcgResolver(ALL_MODES),
          tailwind: p.tailwind(ALL_MODES),
        });
      expect(exportPalette(hdr)).toBe(exportPalette(sdr));
    });

    it('round-trips headroom through export() → themeFrom / paletteFrom', () => {
      const theme = glaze(280, 80, { glowTuning: { headroom: 1.5 } });
      theme.colors({
        surface: { tone: 100 },
        'surface-glow': { type: 'glow', bg: 'surface', intensity: 40 },
        'tuned-glow': {
          type: 'glow',
          bg: 'surface',
          intensity: 30,
          tuning: { headroom: 0.25 },
        },
      });
      const snapshot = JSON.parse(JSON.stringify(theme.export()));
      expect(snapshot.config.glowTuning).toEqual({ headroom: 1.5 });
      expect(snapshot.colors['tuned-glow'].tuning).toEqual({ headroom: 0.25 });

      const restored = glaze.themeFrom(snapshot).resolve();
      const original = theme.resolve();
      for (const name of ['surface-glow', 'tuned-glow']) {
        for (const scheme of SCHEMES) {
          expect(restored.get(name)![scheme]).toEqual(
            original.get(name)![scheme],
          );
        }
      }
      expect(original.get('surface-glow')!.light.hdr!.exposure).toBeCloseTo(
        1.5,
        9,
      );
      expect(original.get('tuned-glow')!.light.hdr!.exposure).toBeCloseTo(
        0.25,
        9,
      );

      // A global headroom is frozen into the snapshot and survives a reset.
      glaze.configure({ glowTuning: { headroom: 1 } });
      const global = glaze(0, 0);
      global.colors({
        paper: { tone: 100 },
        'paper-glow': { type: 'glow', bg: 'paper', intensity: 12 },
      });
      const frozen = JSON.parse(
        JSON.stringify(glaze.palette({ main: global }).export()),
      );
      glaze.resetConfig();
      expect('hdr' in global.resolve().get('paper-glow')!.light).toBe(false);
      const back = glaze.paletteFrom(frozen).theme('main')!.resolve();
      expect(hdrTone(back.get('paper-glow')!.light.hdr)).toBeCloseTo(112, 9);
    });

    it('resetConfig() drops a global headroom', () => {
      glaze.configure({ glowTuning: { headroom: 1 } });
      expect(glaze.getConfig().glowTuning).toEqual({ headroom: 1 });
      const theme = glaze(0, 0);
      theme.colors({
        paper: { tone: 100 },
        'reset-glow': { type: 'glow', bg: 'paper', intensity: 12 },
      });
      expect(theme.resolve().get('reset-glow')!.light.hdr).toBeDefined();
      glaze.resetConfig();
      expect(glaze.getConfig().glowTuning).toBeUndefined();
      expect('hdr' in theme.resolve().get('reset-glow')!.light).toBe(false);
    });
  });

  describe('validation', () => {
    it('rejects a non-finite or negative global headroom and keeps the config', () => {
      glaze.configure({ glowTuning: { headroom: 1 } });
      for (const bad of [-1, NaN, Infinity, '1']) {
        expect(() =>
          glaze.configure({
            glowTuning: { headroom: bad as number },
          }),
        ).toThrow(/glaze: glowTuning\.headroom must be a finite number ≥ 0/);
      }
      expect(glaze.getConfig().glowTuning).toEqual({ headroom: 1 });
      expect(() => glaze.configure({ glowTuning: { headroom: -0.5 } })).toThrow(
        'glaze: glowTuning.headroom must be a finite number ≥ 0 — stops above SDR white (got -0.5).',
      );
    });

    it('clamps a headroom above 2 stops with a one-time warning', () => {
      glaze.configure({ glowTuning: { headroom: 4 } });
      glaze.configure({ glowTuning: { headroom: 4 } });
      expect(glaze.getConfig().glowTuning).toEqual({ headroom: 2 });
      expect(warnings('headroom 4')).toEqual([
        'glaze: glowTuning.headroom 4 is above the 2-stop maximum; using 2. ' +
          "Headroom counts stops (doublings of SDR white's luminance), not a " +
          'ratio: 1 stop is 2× white, 2 stops 4×.',
      ]);
    });

    it('rejects a headroom on shadow tuning', () => {
      expect(() =>
        glaze.configure({
          shadowTuning: { headroom: 1 } as GlowTuning,
        }),
      ).toThrow(
        "glaze: shadowTuning.headroom is not supported — a shadow darkens toward black, and nothing goes below black. Headroom is for glows (glowTuning or a glow's tuning).",
      );
      // `undefined` counts as unset.
      expect(() =>
        glaze.configure({
          shadowTuning: { headroom: undefined } as GlowTuning,
        }),
      ).not.toThrow();
    });

    it('validates instance overrides at resolve', () => {
      const bad = glaze(0, 0, { glowTuning: { headroom: -1 } });
      bad.colors({ paper: { tone: 100 } });
      expect(() => bad.resolve()).toThrow(
        /glaze: glowTuning\.headroom must be a finite number ≥ 0/,
      );

      const shadow = glaze(0, 0, {
        shadowTuning: { headroom: 1 } as GlowTuning,
      });
      shadow.colors({ paper: { tone: 100 } });
      expect(() => shadow.resolve()).toThrow(
        /glaze: shadowTuning\.headroom is not supported/,
      );

      const big = glaze(0, 0, { glowTuning: { headroom: 3 } });
      big.colors({
        paper: { tone: 100 },
        'override-glow': { type: 'glow', bg: 'paper', intensity: 60 },
      });
      expect(
        big.resolve().get('override-glow')!.light.hdr!.exposure,
      ).toBeCloseTo(2, 9);
      expect(warnings('glowTuning.headroom 3 is above')).toHaveLength(1);
    });

    it('validates per-color tuning', () => {
      const resolveWith = (defs: ColorMap) => {
        const theme = glaze(0, 0);
        theme.colors({ paper: { tone: 100 }, ...defs });
        return theme.resolve();
      };
      expect(() =>
        resolveWith({
          s: {
            type: 'shadow',
            bg: 'paper',
            intensity: 4,
            tuning: { headroom: 1 } as GlowTuning,
          },
        }),
      ).toThrow(
        'glaze: shadow "s" tuning.headroom is not supported — a shadow darkens toward black',
      );
      expect(() =>
        resolveWith({
          g: {
            type: 'glow',
            bg: 'paper',
            intensity: 4,
            tuning: { headroom: NaN },
          },
        }),
      ).toThrow(
        'glaze: glow "g" tuning.headroom must be a finite number ≥ 0 — stops above SDR white (got NaN).',
      );

      const r = resolveWith({
        'wide-glow': {
          type: 'glow',
          bg: 'paper',
          intensity: 60,
          tuning: { headroom: 5 },
        },
      });
      expect(r.get('wide-glow')!.light.hdr!.exposure).toBeCloseTo(2, 9);
      expect(warnings('glow "wide-glow" tuning.headroom 5')).toEqual([
        'glaze: glow "wide-glow" tuning.headroom 5 is above the 2-stop ' +
          "maximum; using 2. Headroom counts stops (doublings of SDR white's " +
          'luminance), not a ratio: 1 stop is 2× white, 2 stops 4×.',
      ]);
    });

    it('validates standalone tuning', () => {
      expect(() =>
        glaze.shadow({
          bg: '#ffffff',
          intensity: 4,
          tuning: { headroom: 1 } as GlowTuning,
        }),
      ).toThrow(/glaze: glaze\.shadow\(\) tuning\.headroom is not supported/);
      expect(() =>
        glaze.glow({ bg: '#ffffff', intensity: 4, tuning: { headroom: -2 } }),
      ).toThrow(
        /glaze: glaze\.glow\(\) tuning\.headroom must be a finite number ≥ 0/,
      );
      const v = glaze.glow({
        bg: '#ffffff',
        intensity: 60,
        tuning: { headroom: 8 },
      });
      expect(v.hdr!.exposure).toBeCloseTo(2, 9);
      expect(warnings('glaze.glow() tuning.headroom 8')).toHaveLength(1);
    });
  });

  describe('formatting', () => {
    it('formatSrgbLinear writes 4 decimals and goes past 1', () => {
      expect(formatSrgbLinear([1.463149, 1.2, 0.5])).toBe(
        'color(srgb-linear 1.4631 1.2 0.5)',
      );
      expect(formatSrgbLinear([4, 2.00004, 1])).toBe(
        'color(srgb-linear 4 2 1)',
      );
      expect(formatSrgbLinear([-1e-9, 0, 1e-12])).toBe(
        'color(srgb-linear 0 0 0)',
      );
    });

    it('reproduces the design worked example', () => {
      const r = workedExample({ glowTuning: { headroom: 1 } });
      const surface = r.get('surface-glow')!;
      for (const scheme of ['light', 'lightContrast'] as const) {
        expect(glaze.format(surface[scheme])).toBe('oklch(1 0 0 / 0)');
        expect(surface[scheme].hdr!.exposure).toBeCloseTo(0.549, 3);
        expect(glaze.formatHdr(surface[scheme])).toBe(
          'color(srgb-linear 1.4631 1.4631 1.4631)',
        );
      }
      expect(glaze.format(surface.dark)).toBe('oklch(1 0 0 / 0.1237)');
      expect(glaze.format(surface.darkContrast)).toBe('oklch(1 0 0 / 0.1603)');
      expect(glaze.formatHdr(surface.dark)).toBeUndefined();
      expect(glaze.formatHdr(surface.darkContrast)).toBeUndefined();

      for (const scheme of SCHEMES) {
        const near = r.get('near-glow')![scheme];
        expect(glaze.format(near)).toBe('oklch(1 0 0)');
        expect(near.hdr!.exposure).toBeCloseTo(0.3212, 4);
        expect(glaze.formatHdr(near)).toBe(
          'color(srgb-linear 1.2494 1.2494 1.2494)',
        );

        const inverse = r.get('inverse-glow')![scheme];
        expect(glaze.format(inverse)).toBe('oklch(1 0 0 / 0.1155)');
        expect(glaze.formatHdr(inverse)).toBeUndefined();
      }
    });

    it('formatHdr ignores the SDR format and rejects unknown HDR formats', () => {
      const v = glaze.glow({
        bg: { h: 40, s: 0.6, t: 0.97 },
        intensity: 12,
        tuning: { headroom: 2, reach: 0.5, tint: 0.6 },
      });
      expect(glaze.formatHdr(v, 'srgb-linear')).toBe(glaze.formatHdr(v));
      expect(glaze.formatHdr(v)).toMatch(
        /^color\(srgb-linear \d+(\.\d{1,4})? \d+(\.\d{1,4})? \d+(\.\d{1,4})?\)$/,
      );
      expect(() =>
        glaze.formatHdr(v, 'oklch' as unknown as 'srgb-linear'),
      ).toThrow('glaze: unknown HDR format "oklch". Use \'srgb-linear\'.');
      expect(glaze.formatHdr(glaze.shadow({ bg: '#fff', intensity: 4 }))).toBe(
        undefined,
      );
    });
  });
});
