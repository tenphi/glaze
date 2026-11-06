import { renderStyles } from '@tenphi/tasty/core';
import type { Styles } from '@tenphi/tasty/core';
import { glaze } from './glaze';
import { contrastFraction, numberAt } from './hc-pair';
import {
  computeLighting,
  hdrToLinearSrgb,
  hdrToSrgb,
  resolveLightingTuning,
} from './lighting';
import {
  formatSrgb,
  formatSrgbLinear,
  okhslToLinearSrgb,
  okhslToSrgb,
  relativeLuminanceFromLinearRgb,
  sRGBGammaToLinear,
  sRGBLinearToGamma,
} from './okhsl-color-math';
import { okhstToOkhsl, toneFromY, variantToOkhsl, yFromTone } from './okhst';
import type {
  ColorMap,
  DtcgColorToken,
  DtcgDocument,
  GlazeConfigOverride,
  GlazeOutputModes,
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
 * needs an all-pastel theme, so it runs on a pastel twin. `extra` is merged
 * into every `modes`.
 */
function exportAll(
  defs: ColorMap,
  config?: GlazeConfigOverride,
  extra?: GlazeOutputModes,
): string {
  const theme = themeWith(defs, config);
  const pastel = themeWith(defs, { ...config, pastel: true });
  const all = { modes: { ...ALL_MODES.modes, ...extra } };
  const css = extra?.hdr !== undefined ? { hdr: extra.hdr } : {};
  return JSON.stringify({
    tasty: theme.tasty(all),
    tastyOkhst: theme.tasty({ ...all, format: 'okhst' }),
    tastySplitHue: pastel.tasty({ ...all, splitHue: true }),
    cssSplitHue: pastel.css({ ...css, splitHue: true }),
    json: theme.json(all),
    jsonRgb: theme.json({ ...all, format: 'rgb' }),
    css: theme.css(css),
    cssHsl: theme.css({ ...css, format: 'hsl' }),
    tokens: theme.tokens(all),
    dtcg: theme.dtcg(all),
    dtcgResolver: theme.dtcgResolver(all),
    tailwind: theme.tailwind(all),
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

      // `modes.hdr: false` — the default — said out loud, globally too.
      glaze.configure({ modes: { hdr: false } });
      expect(exportAll(DEFS)).toBe(sdr);
      expect(exportAll(DEFS, undefined, { hdr: false })).toBe(sdr);
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
      expect(glaze.formatHdr(v)).toBe('color(srgb 1.1813 1.1813 1.1813)');
      expect(glaze.formatHdr(v, 'srgb-linear')).toBe(
        'color(srgb-linear 1.4631 1.4631 1.4631)',
      );
    });

    it('never fires for a pigment that cannot lift a non-white surface', () => {
      // `reach: 0` parks the pigment at the surface's own tone, so SDR stays
      // transparent: exposing the bare surface would paint an opaque, brighter
      // copy of it (opaque white once clamped) where SDR shows the surface.
      const theme = glaze(0, 0, { glowTuning: { headroom: 2 } });
      theme.colors({
        mid: { tone: 50, mode: 'static' },
        'tinted-flat-glow': {
          type: 'glow',
          bg: 'mid',
          intensity: 70,
          tuning: { reach: 0, tint: 1 },
        },
        light: { tone: 70, mode: 'static' },
        'flat-glow': {
          type: 'glow',
          bg: 'light',
          intensity: 35,
          tuning: { reach: 0 },
        },
      });
      const r = theme.resolve();
      for (const name of ['tinted-flat-glow', 'flat-glow']) {
        for (const scheme of SCHEMES) {
          const v = r.get(name)![scheme];
          expect(v.alpha).toBe(0);
          expect('hdr' in v).toBe(false);
        }
      }
      // The SDR shortfall warning stays: HDR does not cover the step.
      expect(warnings('glow "tinted-flat-glow"')[0]).toBe(
        'glaze: glow "tinted-flat-glow" cannot reach a 70.0-tone step in ' +
          'light scheme (reached 0.0 at full strength). Lower the intensity, ' +
          'move the surface away from white, or raise a tuned-down `reach`.',
      );
      expect(warnings('glow "flat-glow"')).toHaveLength(SCHEMES.length);
      expect(warnings('of headroom')).toEqual([]);
      expect(theme.css({ hdr: true }).hdr).toEqual({
        light: '',
        dark: '',
        lightContrast: '',
        darkContrast: '',
      });

      // Standalone too — while a white surface still gets one at opacity 0.
      const flat = glaze.glow({
        bg: { h: 0, s: 0, t: 0.8 },
        intensity: 30,
        tuning: { reach: 0, headroom: 1 },
      });
      expect(flat.alpha).toBe(0);
      expect('hdr' in flat).toBe(false);
      const white = glaze.glow({
        bg: { h: 0, s: 0, t: 1 },
        intensity: 12,
        tuning: { reach: 0, headroom: 1 },
      });
      expect(white.alpha).toBe(0);
      expect(hdrTone(white.hdr)).toBeCloseTo(112, 9);
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
    it('caps the brightest channel at 2^headroom and warns once', () => {
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
      expect(glaze.formatHdr(v, 'srgb-linear')).toBe(
        'color(srgb-linear 2 2 2)',
      );

      const result = computeLighting(
        'glow',
        { h: 0, s: 0, l: 1 },
        undefined,
        30,
        resolveLightingTuning({ headroom: 1 }),
        false,
      );
      expect(result.hdr!.reached).toBeCloseTo(21.98, 2);

      // Light only, once across two resolves. Light high contrast is capped
      // the same way, but there the paper is a surface Glaze moved, and the
      // step fits dark high contrast, so that pass pins without a warning.
      expect(warnings('glow "cap-glow"')).toEqual([
        'glaze: glow "cap-glow" cannot reach a 30.0-tone step in light scheme ' +
          'even with 1 stop of headroom (reached 22.0). Lower the intensity ' +
          'or raise `headroom`.',
      ]);
    });

    it('warns from the passes Glaze moves when the cap binds in light and dark', () => {
      // A static white surface stays white in every scheme, so the headroom
      // cap leaves the step short in light and dark alike: the level's passes
      // and the high-contrast ones warn too, each with the headroom message.
      const theme = glaze(0, 0, {
        glowTuning: { headroom: 1 },
        contrastLevel: 50,
      });
      theme.colors({
        paper: { tone: 100, mode: 'static' },
        'level-cap-glow': { type: 'glow', bg: 'paper', intensity: 30 },
      });
      const r = theme.resolve();
      expect(r.get('level-cap-glow')!.dark.hdr!.exposure).toBeCloseTo(1, 9);

      const logged = warnings('glow "level-cap-glow"');
      expect(logged.map((m) => m.match(/in (\w+) scheme/)![1])).toEqual([
        'light',
        'lightContrast',
        'dark',
        'darkContrast',
      ]);
      for (const m of logged) {
        expect(m).toContain('even with 1 stop of headroom (reached 22.0)');
      }
    });

    it('says so when the headroom is already at its maximum', () => {
      const theme = glaze(0, 0, { glowTuning: { headroom: 2 } });
      theme.colors({
        paper: { tone: 100 },
        'max-glow': { type: 'glow', bg: 'paper', intensity: 60 },
      });
      const v = theme.resolve().get('max-glow')!.light;
      expect(v.hdr!.exposure).toBeCloseTo(2, 9);
      expect(glaze.formatHdr(v, 'srgb-linear')).toBe(
        'color(srgb-linear 4 4 4)',
      );
      expect(warnings('glow "max-glow"')[0]).toBe(
        'glaze: glow "max-glow" cannot reach a 60.0-tone step in light scheme ' +
          'even with 2 stops of headroom (reached 44.3). Lower the intensity; ' +
          '`headroom` is already at its 2-stop maximum.',
      );
    });

    it('labels the headroom with three significant digits', () => {
      glaze.glow({ bg: '#ffffff', intensity: 12, tuning: { headroom: 0.004 } });
      glaze.glow({
        bg: '#ffffff',
        intensity: 40,
        tuning: { headroom: 1.23456 },
      });
      expect(warnings('stops of headroom')).toEqual([
        'glaze: glaze.glow() cannot reach a 12.0-tone step even with 0.004 ' +
          'stops of headroom (reached 0.1). Lower the intensity or raise ' +
          '`headroom`.',
        'glaze: glaze.glow() cannot reach a 40.0-tone step even with 1.23 ' +
          'stops of headroom (reached 27.2). Lower the intensity or raise ' +
          '`headroom`.',
      ]);
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
    expect(glaze.formatHdr(last!)).toBe('color(srgb 1 1 1)');
  });

  it('jumps to the exact step past white when reach is below 1', () => {
    // The pigment sits 37% of the way to white (tone 93.7), so SDR pins there,
    // short. Past 100 the HDR value lands the whole step, not just the part
    // past white, so it starts at white rather than at the pigment.
    const bg = { h: 0, s: 0, t: 0.9 };
    const tuning = { reach: 0.37, headroom: 1 };
    const below = glaze.glow({ bg, intensity: 10 - 1e-4, tuning });
    const above = glaze.glow({ bg, intensity: 10 + 1e-4, tuning });

    expect(sdrOf(above)).toEqual(sdrOf(below));
    expect(paintedTone(variantToOkhsl(below))).toBeCloseTo(93.7, 9);
    expect('hdr' in below).toBe(false);
    expect(warnings('glaze.glow() cannot reach a 10.0-tone step')).toEqual([
      'glaze: glaze.glow() cannot reach a 10.0-tone step (reached 3.7 at ' +
        'full strength). Lower the intensity, move the surface away from ' +
        'white, or raise a tuned-down `reach`.',
    ]);

    expect(above.hdr!.t).toBeCloseTo(0.937, 9);
    expect(hdrTone(above.hdr)).toBeCloseTo(100 + 1e-4, 9);
    expect(above.hdr!.exposure).toBeCloseTo(
      Math.log2(yFromTone(100 + 1e-4) / yFromTone(93.7)),
      9,
    );
    expect(above.hdr!.exposure).toBeGreaterThan(0.29);
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

    it('shows a rejected headroom the way the tone windows do', () => {
      const message = (value: unknown) =>
        'glaze: glowTuning.headroom must be a finite number ≥ 0 — stops ' +
        `above SDR white (got ${value}).`;
      for (const [bad, shown] of [
        [[1], '[1]'],
        [BigInt(1), '1n'],
        [{}, '{}'],
        [null, 'null'],
        ['2', '"2"'],
        [NaN, 'NaN'],
      ] as const) {
        expect(() =>
          glaze.configure({
            glowTuning: { headroom: bad as unknown as number },
          }),
        ).toThrow(message(shown));
      }
    });

    it('holds the clamp warning until configure() has checked every field', () => {
      expect(() =>
        glaze.configure({ glowTuning: { headroom: 3.5 }, contrastLevel: NaN }),
      ).toThrow(/glaze: contrastLevel must be a finite number/);
      expect(glaze.getConfig().glowTuning).toBeUndefined();
      expect(warnings('headroom 3.5')).toEqual([]);

      // The corrected retry is the call that applies the clamp, and it says so.
      glaze.configure({ glowTuning: { headroom: 3.5 } });
      expect(glaze.getConfig().glowTuning).toEqual({ headroom: 2 });
      expect(warnings('glowTuning.headroom 3.5 is above')).toHaveLength(1);
    });

    it('holds the clamp warning until an instance override has passed', () => {
      const bad = glaze(0, 0, {
        glowTuning: { headroom: 2.5 },
        contrastLevel: NaN,
      });
      bad.colors({ paper: { tone: 100 } });
      expect(() => bad.resolve()).toThrow(/glaze: contrastLevel/);
      expect(warnings('headroom 2.5')).toEqual([]);

      const fixed = glaze(0, 0, { glowTuning: { headroom: 2.5 } });
      fixed.colors({ paper: { tone: 100 } });
      fixed.resolve();
      expect(warnings('glowTuning.headroom 2.5 is above')).toHaveLength(1);
    });

    it('holds per-color clamp warnings until every def has passed', () => {
      const glow: ColorMap = {
        paper: { tone: 100 },
        'held-glow': {
          type: 'glow',
          bg: 'paper',
          intensity: 60,
          tuning: { headroom: 6 },
        },
      };
      const broken = glaze(0, 0);
      broken.colors({ ...glow, orphan: { base: 'missing', tone: '+10' } });
      expect(() => broken.resolve()).toThrow(
        'glaze: color "orphan" references non-existent base "missing".',
      );
      expect(warnings('headroom 6')).toEqual([]);

      const fixed = glaze(0, 0);
      fixed.colors(glow);
      fixed.resolve();
      expect(warnings('glow "held-glow" tuning.headroom 6')).toHaveLength(1);
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

    it('formatSrgb writes 4 decimals and goes past 1', () => {
      expect(formatSrgb([1.181265, 1.2, 0.5])).toBe(
        'color(srgb 1.1813 1.2 0.5)',
      );
      expect(formatSrgb([1.82479, 1.35326, 1])).toBe(
        'color(srgb 1.8248 1.3533 1)',
      );
      expect(formatSrgb([-1e-9, 0, 1e-12])).toBe('color(srgb 0 0 0)');
    });

    it('hdrToSrgb continues the sRGB transfer function past 1', () => {
      const v = glaze.glow({
        bg: { h: 40, s: 0.6, t: 0.97 },
        intensity: 12,
        tuning: { headroom: 2, reach: 0.5, tint: 0.6 },
      });
      const linear = hdrToLinearSrgb(v.hdr!);
      const srgb = hdrToSrgb(v.hdr!);
      expect(Math.max(...srgb)).toBeGreaterThan(1);
      srgb.forEach((c, i) => {
        expect(c).toBeCloseTo(sRGBLinearToGamma(linear[i]), 12);
        expect(sRGBGammaToLinear(c)).toBeCloseTo(linear[i], 12);
      });
      // One stop over white: the extended curve at 2.
      const white = glaze.glow({
        bg: '#ffffff',
        intensity: 30,
        tuning: { headroom: 1 },
      });
      expect(hdrToSrgb(white.hdr!)[0]).toBeCloseTo(
        1.055 * 2 ** (1 / 2.4) - 0.055,
        9,
      );
    });

    it('reproduces the design worked example', () => {
      const r = workedExample({ glowTuning: { headroom: 1 } });
      const surface = r.get('surface-glow')!;
      for (const scheme of ['light', 'lightContrast'] as const) {
        expect(glaze.format(surface[scheme])).toBe('oklch(1 0 0 / 0)');
        expect(surface[scheme].hdr!.exposure).toBeCloseTo(0.549, 3);
        expect(glaze.formatHdr(surface[scheme])).toBe(
          'color(srgb 1.1813 1.1813 1.1813)',
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
        expect(glaze.formatHdr(near)).toBe('color(srgb 1.1026 1.1026 1.1026)');

        const inverse = r.get('inverse-glow')![scheme];
        expect(glaze.format(inverse)).toBe('oklch(1 0 0 / 0.1155)');
        expect(glaze.formatHdr(inverse)).toBeUndefined();
      }
    });

    it('formatHdr writes one color in either space and rejects others', () => {
      const v = glaze.glow({
        bg: { h: 40, s: 0.6, t: 0.97 },
        intensity: 12,
        tuning: { headroom: 2, reach: 0.5, tint: 0.6 },
      });
      const NUM = String.raw`\d+(\.\d{1,4})?`;
      expect(glaze.formatHdr(v, 'srgb')).toBe(glaze.formatHdr(v));
      expect(glaze.formatHdr(v)).toMatch(
        new RegExp(`^color\\(srgb ${NUM} ${NUM} ${NUM}\\)$`),
      );
      expect(glaze.formatHdr(v, 'srgb-linear')).toMatch(
        new RegExp(`^color\\(srgb-linear ${NUM} ${NUM} ${NUM}\\)$`),
      );
      // The two strings are the same color: decode one, compare the other.
      const channels = (str: string): number[] =>
        str
          .slice(str.indexOf(' ') + 1, -1)
          .split(' ')
          .map(Number);
      const gamma = channels(glaze.formatHdr(v)!);
      const linear = channels(glaze.formatHdr(v, 'srgb-linear')!);
      expect(Math.max(...gamma)).toBeGreaterThan(1);
      gamma.forEach((c, i) => {
        expect(sRGBGammaToLinear(c)).toBeCloseTo(linear[i], 3);
      });
      expect(() => glaze.formatHdr(v, 'oklch' as unknown as 'srgb')).toThrow(
        "glaze: unknown HDR format \"oklch\". Use 'srgb' or 'srgb-linear'.",
      );
      expect(glaze.formatHdr(glaze.shadow({ bg: '#fff', intensity: 4 }))).toBe(
        undefined,
      );
    });
  });
});

// ============================================================================
// Exporters
// ============================================================================

/**
 * Glows whose HDR value sits in different schemes (headroom 1):
 * - `surface-glow`: light + lightContrast (the white surface inverts in dark);
 * - `near-glow`: all four (a static near-white surface);
 * - `ink-glow`: dark + darkContrast (a near-black surface inverts to light);
 * - `paper-glow`: lightContrast only (only its HC intensity passes white);
 * - `inverse-glow`: none.
 */
const EXPORT_DEFS: ColorMap = {
  surface: { tone: 100 },
  'surface-glow': { type: 'glow', bg: 'surface', intensity: 12 },
  near: { tone: 95, saturation: 0, mode: 'static' },
  'near-glow': { type: 'glow', bg: 'near', intensity: 12 },
  ink: { tone: 3, saturation: 0 },
  'ink-glow': { type: 'glow', bg: 'ink', intensity: 12 },
  paper: { tone: 92, saturation: 0 },
  'paper-glow': { type: 'glow', bg: 'paper', intensity: [6, 14] },
  inverse: { tone: 12, saturation: 0, mode: 'static' },
  'inverse-glow': { type: 'glow', bg: 'inverse', intensity: 12 },
};

const HDR_GLOWS = ['surface-glow', 'near-glow', 'ink-glow', 'paper-glow'];

const HDR_MODES = { modes: { dark: true, highContrast: true, hdr: true } };

const WHITE_12 = 'color(srgb 1.1813 1.1813 1.1813)';
const NEAR_12 = 'color(srgb 1.1026 1.1026 1.1026)';

const DARK = '@media(prefers-color-scheme: dark)';
const HC = '@media(prefers-contrast: more)';
const HDR = '@media(dynamic-range: high)';

const EXT = 'me.tenphi.glaze';

type Scheme = (typeof SCHEMES)[number];

function exportTheme(config?: GlazeConfigOverride): GlazeTheme {
  return themeWith(EXPORT_DEFS, { glowTuning: { headroom: 1 }, ...config });
}

/** A variant's HDR string when it has one and `hdr`, else its SDR string. */
function valueOf(v: ResolvedColorVariant, hdr: boolean): string {
  return hdr && v.hdr !== undefined ? glaze.formatHdr(v)! : glaze.format(v);
}

/** The schemes of a resolved color that carry an HDR value. */
function hdrSchemes(color: ResolvedColor): Scheme[] {
  return SCHEMES.filter((scheme) => color[scheme].hdr !== undefined);
}

// A tiny evaluator for the media queries Tasty compiles state maps into.

interface MediaEnv {
  dark: boolean;
  hc: boolean;
  hdr: boolean;
}

const MEDIA_FEATURES: Record<string, keyof MediaEnv> = {
  'prefers-color-scheme: dark': 'dark',
  'prefers-contrast: more': 'hc',
  'dynamic-range: high': 'hdr',
};

const ENVS: MediaEnv[] = [false, true].flatMap((dark) =>
  [false, true].flatMap((hc) =>
    [false, true].map((hdr) => ({ dark, hc, hdr })),
  ),
);

/**
 * Whether an `@media` at-rule matches `env`. Understands the forms Tasty
 * emits — `,`-separated queries of `and`-joined `(feature)` / `(not
 * (feature))` terms — and throws on anything else rather than guessing.
 */
function mediaMatches(rule: string, env: MediaEnv): boolean {
  const query = /^@media (.+)$/.exec(rule);
  if (!query) throw new Error(`unexpected at-rule: ${rule}`);
  return query[1].split(/\s*,\s*/).some((q) =>
    q.split(/\s+and\s+/).every((term) => {
      const negated = /^\(not \((.+)\)\)$/.exec(term);
      const feature = negated ? negated[1] : /^\((.+)\)$/.exec(term)?.[1];
      const key = feature === undefined ? undefined : MEDIA_FEATURES[feature];
      if (key === undefined) throw new Error(`unexpected media term: ${term}`);
      return negated ? !env[key] : env[key];
    }),
  );
}

/** Every value Tasty's compiled CSS gives each custom property in `env`. */
function compiledValues(
  styles: Record<string, Record<string, string>>,
  env: MediaEnv,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const rule of renderStyles(styles as Styles, '.t0')) {
    if (!(rule.atRules ?? []).every((r) => mediaMatches(r, env))) continue;
    for (const decl of rule.declarations.split(';')) {
      const m = /^\s*(--[\w-]+):\s*(.+?)\s*$/.exec(decl);
      if (m) (out[m[1]] ??= []).push(m[2]);
    }
  }
  return out;
}

describe('HDR exporters', () => {
  describe('tasty()', () => {
    it('follows each SDR key with its HDR key, only where one exists', () => {
      const tokens = exportTheme().tasty(HDR_MODES);
      expect(tokens['#surface-glow']).toEqual({
        '': 'oklch(1 0 0 / 0)',
        [HDR]: WHITE_12,
        [DARK]: 'oklch(1 0 0 / 0.1237)',
        [HC]: 'oklch(1 0 0 / 0)',
        [`${HC} & ${HDR}`]: WHITE_12,
        [`${DARK} & ${HC}`]: 'oklch(1 0 0 / 0.1603)',
      });
      expect(Object.keys(tokens['#surface-glow'])).toEqual([
        '',
        HDR,
        DARK,
        HC,
        `${HC} & ${HDR}`,
        `${DARK} & ${HC}`,
      ]);
      expect(Object.keys(tokens['#near-glow'])).toEqual([
        '',
        HDR,
        DARK,
        `${DARK} & ${HDR}`,
        HC,
        `${HC} & ${HDR}`,
        `${DARK} & ${HC}`,
        `${DARK} & ${HC} & ${HDR}`,
      ]);
      expect(Object.keys(tokens['#ink-glow'])).toEqual([
        '',
        DARK,
        `${DARK} & ${HDR}`,
        HC,
        `${DARK} & ${HC}`,
        `${DARK} & ${HC} & ${HDR}`,
      ]);
      expect(Object.keys(tokens['#paper-glow'])).toEqual([
        '',
        DARK,
        HC,
        `${HC} & ${HDR}`,
        `${DARK} & ${HC}`,
      ]);
      // Without HDR anywhere, the map is the SDR one.
      expect(tokens['#inverse-glow']).toEqual(
        exportTheme().tasty(ALL_MODES)['#inverse-glow'],
      );
    });

    it('gates the HDR keys by the other modes', () => {
      const theme = exportTheme();
      expect(theme.tasty({ modes: { hdr: true } })['#near-glow']).toEqual({
        '': 'oklch(1 0 0)',
        [HDR]: NEAR_12,
        [DARK]: 'oklch(1 0 0)',
        [`${DARK} & ${HDR}`]: NEAR_12,
      });
      expect(
        theme.tasty({ modes: { dark: false, hdr: true } })['#ink-glow'],
      ).toEqual({ '': 'oklch(1 0 0 / 0.1191)' });
      const paper = theme.resolve().get('paper-glow')!.lightContrast;
      expect(
        theme.tasty({ modes: { dark: false, highContrast: true, hdr: true } })[
          '#paper-glow'
        ],
      ).toEqual({
        '': 'oklch(1 0 0 / 0.7815)',
        [HC]: glaze.format(paper),
        [`${HC} & ${HDR}`]: glaze.formatHdr(paper),
      });
    });

    it('compiles with @tenphi/tasty so each context gets its scheme value', () => {
      const theme = exportTheme();
      const resolved = theme.resolve();
      const modeSets: Required<GlazeOutputModes>[] = [
        { dark: true, highContrast: true, hdr: true },
        { dark: true, highContrast: false, hdr: true },
        { dark: false, highContrast: true, hdr: true },
        { dark: true, highContrast: true, hdr: false },
      ];
      let checked = 0;
      for (const modes of modeSets) {
        const styles = theme.tasty({ modes });
        for (const env of ENVS) {
          const values = compiledValues(styles, env);
          const dark = env.dark && modes.dark;
          const hc = env.hc && modes.highContrast;
          const scheme: Scheme = dark
            ? hc
              ? 'darkContrast'
              : 'dark'
            : hc
              ? 'lightContrast'
              : 'light';
          for (const [name, color] of resolved) {
            // Tasty's rules never overlap, so exactly one value applies:
            // later keys win, and a dark key beats the light HDR one.
            expect(values[`--${name}-color`]).toEqual([
              valueOf(color[scheme], env.hdr && modes.hdr),
            ]);
            checked++;
          }
        }
      }
      expect(checked).toBe(4 * 8 * resolved.size);
    });

    it('takes the HDR state from options, configure(), or the default', () => {
      const theme = exportTheme();
      const custom = theme.tasty({
        modes: { hdr: true },
        states: { dark: '@dark', hdr: '@hdr' },
      })['#near-glow'];
      expect(Object.keys(custom)).toEqual([
        '',
        '@hdr',
        '@dark',
        '@dark & @hdr',
      ]);

      glaze.configure({ modes: { hdr: true }, states: { hdr: '@hdr' } });
      expect(glaze.getConfig().states.hdr).toBe('@hdr');
      expect(glaze.getConfig().modes.hdr).toBe(true);
      expect(Object.keys(theme.tasty()['#near-glow'])).toEqual([
        '',
        '@hdr',
        DARK,
        `${DARK} & @hdr`,
      ]);
      // A per-call mode still turns it off.
      expect(
        Object.keys(theme.tasty({ modes: { hdr: false } })['#near-glow']),
      ).toEqual(['', DARK]);

      glaze.resetConfig();
      expect(glaze.getConfig().states.hdr).toBe(HDR);
      expect(glaze.getConfig().modes.hdr).toBe(false);
      expect(Object.keys(theme.tasty()['#near-glow'])).toEqual(['', DARK]);
    });

    it('writes HDR values as literals under splitHue', () => {
      const theme = exportTheme({ pastel: true });
      const split = theme.tasty({ ...HDR_MODES, splitHue: true });
      const plain = theme.tasty(HDR_MODES);
      let hdrKeys = 0;
      for (const name of HDR_GLOWS) {
        for (const [key, value] of Object.entries(split[`#${name}`])) {
          if (!key.includes(HDR)) continue;
          hdrKeys++;
          expect(value).toMatch(/^color\(srgb [\d. ]+\)$/);
          expect(value).toBe(plain[`#${name}`][key]);
        }
      }
      expect(hdrKeys).toBe(9);
      expect(split['#surface-glow'][HDR]).toBe(WHITE_12);
    });

    it('writes extended srgb whatever the SDR format', () => {
      const light = exportTheme().resolve().get('surface-glow')!.light;
      for (const format of ['okhsl', 'okhst', 'rgb', 'hsl'] as const) {
        const tokens = exportTheme().tasty({ ...HDR_MODES, format });
        expect(tokens['#surface-glow'][HDR]).toBe(WHITE_12);
        expect(tokens['#surface-glow']['']).toBe(glaze.format(light, format));
      }
    });
  });

  describe('json()', () => {
    it('adds a sparse <scheme>Hdr key after each SDR key that has one', () => {
      const json = exportTheme().json(HDR_MODES);
      expect(json['surface-glow']).toEqual({
        light: 'oklch(1 0 0 / 0)',
        lightHdr: WHITE_12,
        dark: 'oklch(1 0 0 / 0.1237)',
        lightContrast: 'oklch(1 0 0 / 0)',
        lightContrastHdr: WHITE_12,
        darkContrast: 'oklch(1 0 0 / 0.1603)',
      });
      expect(Object.keys(json['near-glow'])).toEqual([
        'light',
        'lightHdr',
        'dark',
        'darkHdr',
        'lightContrast',
        'lightContrastHdr',
        'darkContrast',
        'darkContrastHdr',
      ]);
      expect(Object.keys(json['ink-glow'])).toEqual([
        'light',
        'dark',
        'darkHdr',
        'lightContrast',
        'darkContrast',
        'darkContrastHdr',
      ]);
      expect(json['inverse-glow']).toEqual(
        exportTheme().json(ALL_MODES)['inverse-glow'],
      );
    });

    it('gates the HDR keys by the other modes and ignores the format', () => {
      const json = exportTheme().json({ modes: { hdr: true }, format: 'rgb' });
      expect(Object.keys(json['near-glow'])).toEqual([
        'light',
        'lightHdr',
        'dark',
        'darkHdr',
      ]);
      expect(json['near-glow'].light).toMatch(/^rgb\(/);
      expect(json['near-glow'].lightHdr).toBe(NEAR_12);
      expect(Object.keys(json['paper-glow'])).toEqual(['light', 'dark']);
    });
  });

  describe('tokens()', () => {
    it('adds a dense <scheme>Hdr map after each scheme', () => {
      const theme = exportTheme();
      const tokens = theme.tokens(HDR_MODES);
      const sdr = theme.tokens(ALL_MODES);
      expect(Object.keys(tokens)).toEqual([
        'light',
        'lightHdr',
        'dark',
        'darkHdr',
        'lightContrast',
        'lightContrastHdr',
        'darkContrast',
        'darkContrastHdr',
      ]);
      const resolved = theme.resolve();
      for (const scheme of SCHEMES) {
        // The SDR maps don't change.
        expect(tokens[scheme]).toEqual(sdr[scheme]);
        const hdrMap = tokens[`${scheme}Hdr`];
        expect(Object.keys(hdrMap)).toEqual(HDR_GLOWS);
        for (const name of HDR_GLOWS) {
          expect(hdrMap[name]).toBe(valueOf(resolved.get(name)![scheme], true));
        }
      }
      expect(tokens.darkHdr).toEqual({
        'surface-glow': 'oklch(1 0 0 / 0.1237)',
        'near-glow': NEAR_12,
        'ink-glow': glaze.formatHdr(resolved.get('ink-glow')!.dark),
        'paper-glow': glaze.format(resolved.get('paper-glow')!.dark),
      });
    });

    it('counts only the emitted schemes toward the dense set', () => {
      const tokens = exportTheme().tokens({ modes: { hdr: true } });
      expect(Object.keys(tokens)).toEqual([
        'light',
        'lightHdr',
        'dark',
        'darkHdr',
      ]);
      // `paper-glow` has HDR only in lightContrast, which isn't emitted.
      expect(Object.keys(tokens.lightHdr)).toEqual([
        'surface-glow',
        'near-glow',
        'ink-glow',
      ]);
      expect(
        Object.keys(
          exportTheme().tokens({ modes: { dark: false, hdr: true } }),
        ),
      ).toEqual(['light', 'lightHdr']);
    });

    it('emits empty HDR maps when nothing passes white', () => {
      const tokens = themeWith(EXPORT_DEFS).tokens({ modes: { hdr: true } });
      expect(tokens.lightHdr).toEqual({});
      expect(tokens.darkHdr).toEqual({});
    });

    it('drops the HDR maps of a mirrored high-contrast tier with it', () => {
      glaze.configure({ contrastLevel: 100 });
      expect(Object.keys(exportTheme().tokens(HDR_MODES))).toEqual([
        'light',
        'lightHdr',
        'dark',
        'darkHdr',
      ]);
    });
  });

  describe('css()', () => {
    it('adds dense hdr blocks with the hdr option', () => {
      const theme = exportTheme();
      const { hdr, ...sdr } = theme.css({ hdr: true });
      expect(sdr).toEqual(theme.css());
      expect('hdr' in theme.css()).toBe(false);

      const resolved = theme.resolve();
      const decl = (name: string, value: string) =>
        `--${name}-color: ${value};`;
      for (const scheme of SCHEMES) {
        expect(hdr![scheme]).toBe(
          HDR_GLOWS.map((name) =>
            decl(name, valueOf(resolved.get(name)![scheme], true)),
          ).join('\n'),
        );
      }
      expect(hdr!.light).toBe(
        [
          decl('surface-glow', WHITE_12),
          decl('near-glow', NEAR_12),
          decl('ink-glow', 'oklch(1 0 0 / 0.1191)'),
          decl('paper-glow', 'oklch(1 0 0 / 0.7815)'),
        ].join('\n'),
      );
    });

    it('matches the design worked example', () => {
      const theme = glaze(280, 80, { glowTuning: { headroom: 1 } });
      theme.colors({
        surface: { tone: 100 },
        'surface-glow': { type: 'glow', bg: 'surface', intensity: 12 },
        near: { tone: 95, saturation: 0, mode: 'static' },
        'near-glow': { type: 'glow', bg: 'near', intensity: 12 },
        inverse: { tone: 12, saturation: 0, mode: 'static' },
        'inverse-glow': { type: 'glow', bg: 'inverse', intensity: 12 },
      });
      const near = `--near-glow-color: ${NEAR_12};`;
      expect(theme.css({ hdr: true }).hdr).toEqual({
        light: `--surface-glow-color: ${WHITE_12};\n${near}`,
        dark: `--surface-glow-color: oklch(1 0 0 / 0.1237);\n${near}`,
        lightContrast: `--surface-glow-color: ${WHITE_12};\n${near}`,
        darkContrast: `--surface-glow-color: oklch(1 0 0 / 0.1603);\n${near}`,
      });
    });

    it('falls back to the global modes.hdr', () => {
      const theme = exportTheme();
      glaze.configure({ modes: { hdr: true } });
      expect(theme.css().hdr).toEqual(theme.css({ hdr: true }).hdr);
      expect('hdr' in theme.css({ hdr: false })).toBe(false);
    });

    it('re-declares the SDR line verbatim under splitHue', () => {
      // A tinted glow over a chromatic surface: a chromatic SDR fallback.
      const theme = themeWith(
        {
          ...EXPORT_DEFS,
          chip: { tone: 99 },
          'chip-glow': {
            type: 'glow',
            bg: 'chip',
            intensity: 20,
            tuning: { reach: 0.6, tint: 0.8 },
          },
        },
        { glowTuning: { headroom: 1 }, pastel: true },
      );
      const css = theme.css({ hdr: true, splitHue: true, suffix: '' });
      expect(css.light).toContain(
        '--chip: oklch(0.9899 0.0037 var(--theme-hue));',
      );
      for (const scheme of SCHEMES) {
        const sdr = css[scheme].split('\n');
        const lines = css.hdr![scheme].split('\n');
        expect(lines.map((line) => line.split(':')[0])).toEqual(
          [...HDR_GLOWS, 'chip-glow'].map((name) => `--${name}`),
        );
        for (const line of lines) {
          if (line.includes('color(srgb ')) continue;
          expect(sdr).toContain(line);
        }
      }
      expect(css.hdr!.dark).toMatch(/--chip-glow: oklch\([\d.]+ [\d.]+ 280 \//);
      expect(css.hdr!.light).toContain(`--surface-glow: ${WHITE_12};`);
      // Hue vars stay in the SDR blocks.
      for (const scheme of SCHEMES) {
        expect(css.hdr![scheme]).not.toMatch(/-hue:/);
      }
    });

    it('writes empty blocks when nothing passes white', () => {
      expect(themeWith(EXPORT_DEFS).css({ hdr: true }).hdr).toEqual({
        light: '',
        dark: '',
        lightContrast: '',
        darkContrast: '',
      });
    });
  });

  describe('tailwind()', () => {
    it('appends dense HDR blocks after every SDR block', () => {
      const theme = exportTheme();
      const sdr = theme.tailwind(ALL_MODES);
      const css = theme.tailwind(HDR_MODES);
      expect(css.startsWith(`${sdr}\n\n`)).toBe(true);
      const resolved = theme.resolve();
      const block = (selector: string, scheme: Scheme) =>
        `@media (dynamic-range: high) {\n  ${selector} {\n` +
        HDR_GLOWS.map(
          (name) =>
            `    --color-${name}: ${valueOf(resolved.get(name)![scheme], true)};`,
        ).join('\n') +
        '\n  }\n}';
      expect(css.slice(sdr.length + 2)).toBe(
        [
          block(':root', 'light'),
          block('.dark', 'dark'),
          block('.high-contrast', 'lightContrast'),
          block('.dark.high-contrast', 'darkContrast'),
        ].join('\n\n'),
      );
    });

    it('honors hdrSelector and the other selectors', () => {
      const css = exportTheme().tailwind({
        modes: { hdr: true },
        darkSelector: '@media (prefers-color-scheme: dark)',
        hdrSelector: '.hdr',
      });
      expect(css).toContain(`.hdr {\n  --color-surface-glow: ${WHITE_12};`);
      expect(css).toContain(
        '@media (prefers-color-scheme: dark) {\n  .hdr {\n' +
          '    --color-surface-glow: oklch(1 0 0 / 0.1237);',
      );
      expect(css).not.toContain('dynamic-range');
      expect(css).not.toContain('high-contrast');
    });

    it('gates the HDR blocks by the other modes', () => {
      const lightOnly = exportTheme().tailwind({
        modes: { dark: false, hdr: true },
      });
      expect(lightOnly.match(/dynamic-range/g)).toHaveLength(1);
      expect(lightOnly).not.toContain('.dark');
      // Nothing past white: no HDR blocks at all.
      expect(themeWith(EXPORT_DEFS).tailwind(HDR_MODES)).toBe(
        themeWith(EXPORT_DEFS).tailwind(ALL_MODES),
      );
    });
  });

  describe('dtcg() / dtcgResolver()', () => {
    it('carries HDR in $extensions only in the scheme documents that have it', () => {
      const theme = exportTheme();
      const doc = theme.dtcg(HDR_MODES);
      const sdr = theme.dtcg(ALL_MODES);
      const resolved = theme.resolve();
      for (const scheme of SCHEMES) {
        for (const [name, color] of resolved) {
          const token: DtcgColorToken = doc[scheme]![name];
          if (color[scheme].hdr === undefined) {
            expect(token).toEqual(sdr[scheme]![name]);
          } else {
            expect(token.$value).toEqual(sdr[scheme]![name].$value);
            expect(Object.keys(token)).toEqual([
              '$type',
              '$value',
              '$extensions',
            ]);
            expect(Object.keys(token.$extensions!)).toEqual([EXT]);
          }
        }
      }
      for (const name of HDR_GLOWS) {
        expect(
          SCHEMES.filter((s) => doc[s]![name].$extensions !== undefined),
        ).toEqual(hdrSchemes(resolved.get(name)!));
      }
    });

    it('writes exposure, tone, the sRGB base and the extended value', () => {
      const doc = exportTheme().dtcg(HDR_MODES);
      expect(doc.light['surface-glow'].$extensions![EXT].hdr).toEqual({
        exposure: 0.548987,
        tone: 112,
        base: { colorSpace: 'srgb', components: [1, 1, 1], hex: '#ffffff' },
        value: {
          colorSpace: 'srgb',
          components: [1.181265, 1.181265, 1.181265],
        },
      });
      const near = doc.dark!['near-glow'].$extensions![EXT].hdr;
      expect(near.exposure).toBeCloseTo(0.3212, 4);
      expect(near.tone).toBe(107);
      expect(near.value.components).toEqual([1.102565, 1.102565, 1.102565]);
      // The components are the numbers of the CSS string.
      expect(formatSrgb(near.value.components)).toBe(NEAR_12);

      // The base is sRGB whatever `colorSpace`; `$value` follows it.
      const oklch = exportTheme().dtcg({ ...HDR_MODES, colorSpace: 'oklch' });
      expect(oklch.light['near-glow'].$value.colorSpace).toBe('oklch');
      expect(oklch.light['near-glow'].$extensions![EXT].hdr).toEqual(
        doc.light['near-glow'].$extensions![EXT].hdr,
      );
    });

    it('rebuilds the HDR value from a tinted base', () => {
      const theme = glaze(40, 60, { glowTuning: { headroom: 2 } });
      theme.colors({
        chip: { tone: 97 },
        'chip-glow': {
          type: 'glow',
          bg: 'chip',
          intensity: 20,
          tuning: { reach: 0.6, tint: 0.6 },
        },
      });
      const v = theme.resolve().get('chip-glow')!.light;
      const hdr =
        theme.dtcg(HDR_MODES).light['chip-glow'].$extensions![EXT].hdr;
      expect(hdr.value.components[0]).not.toBe(hdr.value.components[2]);
      const gain = 2 ** hdr.exposure;
      hdr.base.components.forEach((c, i) => {
        expect(sRGBGammaToLinear(c) * gain).toBeCloseTo(
          sRGBGammaToLinear(hdr.value.components[i]),
          4,
        );
      });
      expect(hdr.tone).toBeGreaterThan(100);
      expect(hdr.tone).toBeCloseTo(hdrTone(v.hdr), 3);
    });

    it('can land a capped saturated base below tone 100', () => {
      // The per-channel cap binds on the red channel first, so the luminance
      // tone stays under 100 even though that channel passes 1.
      const theme = glaze(30, 100, {
        glowTuning: { headroom: 0.1, tint: 1, reach: 0.5 },
      });
      theme.colors({
        chip: { tone: 90, saturation: 1 },
        'chip-glow': { type: 'glow', bg: 'chip', intensity: 30 },
      });
      const hdr =
        theme.dtcg(HDR_MODES).light['chip-glow'].$extensions![EXT].hdr;
      expect(hdr.exposure).toBeCloseTo(0.1, 5);
      expect(hdr.tone).toBeLessThan(100);
      expect(sRGBGammaToLinear(Math.max(...hdr.value.components))).toBeCloseTo(
        2 ** 0.1,
        5,
      );
      expect(Math.min(...hdr.value.components)).toBeLessThan(1);
      expect(theme.json(HDR_MODES)['chip-glow'].lightHdr).toBe(
        'color(srgb 1.0309 0.9418 0.9256)',
      );
    });

    it('places the extensions in the resolver contexts', () => {
      const doc = exportTheme().dtcgResolver(HDR_MODES);
      const base = doc.sets.base.sources[0] as DtcgDocument;
      const ctx = (name: string) =>
        doc.modifiers.scheme.contexts[name][0] as DtcgDocument;
      expect(base['surface-glow'].$extensions![EXT].hdr.tone).toBe(112);
      expect(ctx('dark')['surface-glow'].$extensions).toBeUndefined();
      expect(ctx('dark')['ink-glow'].$extensions).toBeDefined();
      expect(ctx('lightContrast')['paper-glow'].$extensions).toBeDefined();
      expect(ctx('darkContrast')['paper-glow'].$extensions).toBeUndefined();
      expect(
        JSON.stringify(
          exportTheme().dtcgResolver({
            modes: { ...ALL_MODES.modes, hdr: false },
          }),
        ),
      ).toBe(JSON.stringify(exportTheme().dtcgResolver(ALL_MODES)));
    });
  });

  describe('palettes', () => {
    function palette(primary?: string) {
      const brand = exportTheme();
      const accent = glaze(40, 60, { glowTuning: { headroom: 1 } });
      accent.colors(EXPORT_DEFS);
      return glaze.palette({ brand, accent }, { primary });
    }

    it('prefixes HDR entries and duplicates them for the primary', () => {
      const p = palette('brand');
      const tasty = p.tasty(HDR_MODES);
      for (const key of [
        '#brand-surface-glow',
        '#surface-glow',
        '#accent-surface-glow',
      ]) {
        expect(tasty[key][HDR]).toBe(WHITE_12);
      }
      expect(tasty['#surface-glow']).toEqual(tasty['#brand-surface-glow']);

      const tokens = p.tokens(HDR_MODES);
      expect(Object.keys(tokens.lightHdr)).toEqual([
        ...HDR_GLOWS.map((n) => `brand-${n}`),
        ...HDR_GLOWS,
        ...HDR_GLOWS.map((n) => `accent-${n}`),
      ]);
      expect(tokens.darkHdr['ink-glow']).toBe(tokens.darkHdr['brand-ink-glow']);

      const css = p.css({ hdr: true });
      expect(css.hdr!.light).toContain(
        `--brand-surface-glow-color: ${WHITE_12};`,
      );
      expect(css.hdr!.light).toContain(`\n--surface-glow-color: ${WHITE_12};`);
      expect(css.hdr!.dark).toContain(
        '--brand-surface-glow-color: oklch(1 0 0 / 0.1237);',
      );
      expect(css.hdr!.dark).toMatch(
        /\n--accent-surface-glow-color: oklch\(1 0 0 \/ [\d.]+\);/,
      );
      const { hdr, ...sdrCss } = css;
      expect(hdr).toBeDefined();
      expect(sdrCss).toEqual(p.css());
      expect('hdr' in p.css()).toBe(false);

      const tailwind = p.tailwind(HDR_MODES);
      expect(tailwind.startsWith(`${p.tailwind(ALL_MODES)}\n\n`)).toBe(true);
      expect(tailwind).toContain(`--color-brand-near-glow: ${NEAR_12};`);
      expect(tailwind).toContain(`--color-near-glow: ${NEAR_12};`);
      expect(tailwind.match(/dynamic-range/g)).toHaveLength(4);

      const dtcg = p.dtcg(HDR_MODES);
      expect(dtcg.light['accent-surface-glow'].$extensions).toBeDefined();
      expect(dtcg.light['surface-glow']).toEqual(
        dtcg.light['brand-surface-glow'],
      );
      expect(dtcg.dark!['surface-glow'].$extensions).toBeUndefined();
      const resolver = p.dtcgResolver(HDR_MODES);
      expect(
        (resolver.sets.base.sources[0] as DtcgDocument)['surface-glow'],
      ).toEqual(dtcg.light['surface-glow']);

      const json = p.json(HDR_MODES);
      expect(json.brand['surface-glow'].lightHdr).toBe(WHITE_12);
      expect(json.accent['ink-glow'].darkHdr).toBeDefined();
    });

    it('applies prefix maps and primary: false to HDR entries', () => {
      const tokens = palette().tokens({
        ...HDR_MODES,
        prefix: { brand: 'b-', accent: 'a-' },
      });
      expect(Object.keys(tokens.lightHdr)).toEqual([
        ...HDR_GLOWS.map((n) => `b-${n}`),
        ...HDR_GLOWS.map((n) => `a-${n}`),
      ]);
      const tasty = palette('brand').tasty({ ...HDR_MODES, primary: false });
      expect(tasty['#surface-glow']).toBeUndefined();
      expect(tasty['#brand-surface-glow'][HDR]).toBe(WHITE_12);
    });

    it('follows the SDR collision filter', () => {
      const tokens = palette('brand').tokens({
        ...HDR_MODES,
        prefix: false,
        primary: false,
      });
      expect(warnings('collides')).not.toEqual([]);
      // The accent theme's colors collide with the brand's and are skipped.
      expect(Object.keys(tokens.lightHdr)).toEqual(HDR_GLOWS);
      expect(tokens.lightHdr).toEqual(exportTheme().tokens(HDR_MODES).lightHdr);
    });
  });

  it('leaves glaze.color() tokens untouched — they are never glows', () => {
    const token = glaze.color({ hue: 280, saturation: 80, tone: 97 });
    const all = () =>
      JSON.stringify([
        token.tasty(ALL_MODES),
        token.json(ALL_MODES),
        token.css({ name: 'brand' }),
        token.dtcg(ALL_MODES),
        token.dtcgResolver({ ...ALL_MODES, name: 'brand' }),
        token.tailwind({ ...ALL_MODES, name: 'brand' }),
      ]);
    const off = all();
    glaze.configure({ modes: { hdr: true } });
    expect(all()).toBe(off);
  });
});
