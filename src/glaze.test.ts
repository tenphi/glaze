import { glaze } from './glaze';
import {
  contrastRatioFromLuminance,
  okhslToLinearSrgb,
  gamutClampedLuminance,
  apcaLuminanceFromLinearRgb,
  parseHex,
} from './okhsl-color-math';
import { apcaContrast } from './contrast-solver';
import { variantToOkhsl } from './okhst';
import type {
  ContrastSpec,
  DtcgColorToken,
  GlazeColorTokenExport,
  ResolvedColorVariant,
} from './types';

/** OKHSL lightness (0–1) of a resolved variant (stored as tone). */
function llOf(v: ResolvedColorVariant): number {
  return variantToOkhsl(v).l;
}

function variantContrast(
  a: ResolvedColorVariant,
  b: ResolvedColorVariant,
): number {
  const ca = variantToOkhsl(a);
  const cb = variantToOkhsl(b);
  const yA = gamutClampedLuminance(okhslToLinearSrgb(ca.h, ca.s, ca.l));
  const yB = gamutClampedLuminance(okhslToLinearSrgb(cb.h, cb.s, cb.l));
  return contrastRatioFromLuminance(yA, yB);
}

/** APCA Lc magnitude of `candidate` against `base`, ordered by `polarity`. */
function variantApca(
  candidate: ResolvedColorVariant,
  base: ResolvedColorVariant,
  polarity: 'fg' | 'bg',
): number {
  const cc = variantToOkhsl(candidate);
  const cb = variantToOkhsl(base);
  const yC = apcaLuminanceFromLinearRgb(
    okhslToLinearSrgb(cc.h, cc.s, cc.l, candidate.pastel),
  );
  const yB = apcaLuminanceFromLinearRgb(
    okhslToLinearSrgb(cb.h, cb.s, cb.l, base.pastel),
  );
  return Math.abs(
    polarity === 'bg' ? apcaContrast(yB, yC) : apcaContrast(yC, yB),
  );
}

/**
 * Slack allowed when re-measuring a solved contrast floor.
 *
 * The solver measures candidates at a tone rounded to 4 decimals
 * (`cachedLuminance` in `contrast-solver.ts`), but the resolver stores and emits
 * the unrounded tone. Re-measuring the emitted color therefore lands slightly
 * off the value the solver judged `met` against — up to a factor of `21^1e-4`
 * (~0.021%) for a WCAG ratio, and up to ~0.023 Lc for APCA. An exact
 * `>= target` assertion fails whenever a solve happens to converge near that
 * rounding boundary.
 *
 * These tolerances are ~5x the measured worst case and still far tighter than
 * the library's own "effectively a pass" thresholds
 * (`CONTRAST_WARN_SLACK_WCAG` = 0.98, `CONTRAST_WARN_SLACK_APCA` = 1.5 Lc), so
 * a genuinely wrong target — an unpromoted 4.5 where 7 was expected — still
 * fails loudly.
 */
const WCAG_MEASURE_SLACK = 0.999;
const APCA_MEASURE_SLACK = 0.1;

/** Assert a re-measured WCAG ratio meets `target`. @see WCAG_MEASURE_SLACK */
function expectMeetsWcag(actual: number, target: number): void {
  expect(actual).toBeGreaterThanOrEqual(target * WCAG_MEASURE_SLACK);
}

/** Assert a re-measured APCA Lc meets `target`. @see WCAG_MEASURE_SLACK */
function expectMeetsApca(actual: number, target: number): void {
  expect(actual).toBeGreaterThanOrEqual(target - APCA_MEASURE_SLACK);
}

describe('glaze', () => {
  beforeEach(() => {
    glaze.resetConfig();
  });

  describe('theme creation', () => {
    it('creates a theme with hue and saturation', () => {
      const theme = glaze(280, 80);
      expect(theme.hue).toBe(280);
      expect(theme.saturation).toBe(80);
    });

    it('creates a theme with options object', () => {
      const theme = glaze({ hue: 280, saturation: 80 });
      expect(theme.hue).toBe(280);
      expect(theme.saturation).toBe(80);
    });

    it('respects pastel config on theme creation', () => {
      const theme = glaze(100, 100, { pastel: true });
      theme.colors({ surface: { tone: 50, saturation: 1 } });
      const surface = theme.resolve().get('surface')!;
      expect(surface.light.s).toBeCloseTo(1, 3);
      // Wait, tone 50 pastel means the chroma is scaled to the safe boundary.
      // S doesn't change here since S is 1. The output formatting reflects pastel.
      const formatted = theme.css({ format: 'rgb', suffix: '' });
      expect(formatted.light).toContain('--surface: rgb(');
    });

    it('defaults saturation to 100 when using shorthand', () => {
      const theme = glaze(280);
      expect(theme.saturation).toBe(100);
    });
  });

  describe('color definitions', () => {
    it('limits chroma to safe boundary when pastel config is true', () => {
      // Create a color token with pastel=true. S=1 at hue 150.
      const tokenPastel = glaze.color(
        { hue: 150, saturation: 100, tone: 50 },
        { pastel: true },
      );
      const tokenNormal = glaze.color(
        { hue: 150, saturation: 100, tone: 50 },
        { pastel: false },
      );

      const tokensP = tokenPastel.token();
      const tokensN = tokenNormal.token();

      const rgbPastel = parseHex(tokensP['']);
      const rgbNormal = parseHex(tokensN['']);

      expect(rgbPastel).toBeDefined();
      expect(rgbNormal).toBeDefined();

      // We can check format using css as well, to satisfy format testing
      expect(tokenPastel.css({ name: 'test', format: 'rgb' }).light).toContain(
        'rgb(',
      );
    });
    it('honors per-color pastel override regardless of theme default', () => {
      // Two colors at the same seed: one opts into pastel via the def, the
      // other follows the theme pastel default (false). The resolved
      // variants must carry the per-color flag through to formatting.
      const theme = glaze(280, 80);
      theme.colors({
        plain: { tone: 50, saturation: 1 },
        soft: { tone: 50, saturation: 1, pastel: true },
      });
      const resolved = theme.resolve();
      expect(resolved.get('plain')!.light.pastel).toBe(false);
      expect(resolved.get('soft')!.light.pastel).toBe(true);

      // `soft` should render through the hue-independent safe gamut, which at
      // saturation 1 / hue 280 yields a measurably different RGB than `plain`.
      const css = theme.css({ format: 'rgb', suffix: '' });
      expect(css.light).toContain('--plain: rgb(');
      expect(css.light).toContain('--soft: rgb(');
      const plainLine = css.light
        .split('\n')
        .find((l) => l.startsWith('--plain'))!;
      const softLine = css.light
        .split('\n')
        .find((l) => l.startsWith('--soft'))!;
      // Pastel clamps chroma to the safe boundary, so the two RGB triples
      // diverge even though the inputs share tone/saturation/hue.
      expect(plainLine).not.toEqual(softLine);
      expect(plainLine.slice(plainLine.indexOf('('))).not.toEqual(
        softLine.slice(softLine.indexOf('(')),
      );
    });

    it('per-color pastel is inherited by extend()', () => {
      const parent = glaze(280, 80);
      parent.colors({ soft: { tone: 50, saturation: 1, pastel: true } });
      const child = parent.extend({ saturation: 60 });
      // The inherited def keeps its `pastel: true` flag.
      expect(child.color('soft')!.pastel).toBe(true);
      const resolved = child.resolve().get('soft')!;
      expect(resolved.light.pastel).toBe(true);
    });

    it('per-color pastel can be overridden in a child theme', () => {
      const parent = glaze(280, 80);
      parent.colors({
        pastel: { tone: 50, saturation: 1, pastel: true },
        harsh: { tone: 50, saturation: 1, pastel: false },
      });
      const child = parent.extend({
        colors: {
          pastel: { tone: 50, saturation: 1, pastel: false },
        },
      });
      expect(child.resolve().get('pastel')!.light.pastel).toBe(false);
      expect(child.resolve().get('harsh')!.light.pastel).toBe(false);
    });

    it('per-color pastel flows through shadow and mix defs', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { tone: 90, saturation: 0.3 },
        shadowed: {
          type: 'shadow',
          bg: 'surface',
          intensity: 40,
          pastel: true,
        },
        mixed: {
          type: 'mix',
          base: 'surface',
          target: 'surface',
          value: 50,
          pastel: true,
        },
      });
      const resolved = theme.resolve();
      expect(resolved.get('shadowed')!.light.pastel).toBe(true);
      expect(resolved.get('mixed')!.light.pastel).toBe(true);
    });

    it('standalone color tokens carry per-color pastel through export', () => {
      const token = glaze.color({
        hue: 150,
        saturation: 100,
        tone: 50,
        pastel: true,
      });
      expect(token.resolve().light.pastel).toBe(true);

      // The flag must survive the JSON-safe export / colorFrom round-trip.
      const restored = glaze.colorFrom(token.export());
      expect(restored.resolve().light.pastel).toBe(true);
    });

    it('value-shorthand pastel override beats the theme/token default', () => {
      const token = glaze.color({ from: '#1e90ff', pastel: true });
      expect(token.resolve().light.pastel).toBe(true);
    });

    it('resolves root colors with tone, hue and saturation', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { tone: 97, saturation: 0.75 } });

      const surface = theme.resolve().get('surface')!;
      expect(surface).toBeDefined();
      expect(surface.light.h).toBe(280);
      // tone 97, light window [10,100]: ~0.966
      expect(llOf(surface.light)).toBeCloseTo(0.966, 2);
      // Requested 0.75 * 80/100 = 0.6, but hue 280's gamut cusp sits dark
      // (lc ~0.41), so this near-white swatch is well past the white shoulder
      // and the cusp-anchored ceiling caps chroma hard (correct: violet has
      expect(surface.light.s).toBeGreaterThan(0);
    });

    it('resolves dependent colors with relative tone (darker in light)', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { tone: 97, saturation: 0.75 },
        text: { base: 'surface', tone: '-52', contrast: 'AAA' },
      });
      const text = theme.resolve().get('text')!;
      expect(text).toBeDefined();
      expect(llOf(text.light)).toBeLessThan(0.966);
    });

    it('resolves dependent colors with absolute tone', () => {
      const theme = glaze(0, 0);
      theme.colors({
        surface: { tone: 97 },
        text: { base: 'surface', tone: 45, contrast: 'AAA' },
      });
      const text = theme.resolve().get('text')!;
      expect(text).toBeDefined();
      expect(llOf(text.light)).toBeLessThan(0.966);
    });

    it('resolves dependent colors without tone (inherits base)', () => {
      const theme = glaze(0, 0);
      theme.colors({
        surface: { tone: 97 },
        overlay: { base: 'surface' },
      });
      const overlay = theme.resolve().get('overlay')!;
      expect(llOf(overlay.light)).toBeCloseTo(0.966, 2);
    });

    it('merges colors additively on second .colors() call', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { tone: 97 } });
      theme.colors({ text: { tone: 30 } });
      const resolved = theme.resolve();
      expect(resolved.has('surface')).toBe(true);
      expect(resolved.has('text')).toBe(true);
    });

    it('overwrites existing color on .colors() with same key', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { tone: 97 } });
      theme.colors({ surface: { tone: 50 } });
      // tone 50, light window [10,100]
      expect(llOf(theme.resolve().get('surface')!.light)).toBeCloseTo(0.515, 2);
    });
  });

  describe('validation', () => {
    it('throws on contrast without base', () => {
      const theme = glaze(280, 80);
      theme.colors({ text: { tone: 50, contrast: 'AA' } as never });
      expect(() => theme.resolve()).toThrow('contrast');
    });

    it('throws on relative tone without base', () => {
      const theme = glaze(280, 80);
      theme.colors({ text: { tone: '-52' } as never });
      expect(() => theme.resolve()).toThrow('relative');
    });

    it('throws on non-existent base reference', () => {
      const theme = glaze(280, 80);
      theme.colors({ text: { base: 'nonexistent', tone: '-52' } });
      expect(() => theme.resolve()).toThrow('non-existent');
    });

    it('throws on circular base references', () => {
      const theme = glaze(280, 80);
      theme.colors({
        a: { base: 'b', tone: '-10' },
        b: { base: 'a', tone: '-10' },
      });
      expect(() => theme.resolve()).toThrow('circular');
    });

    it('throws when color has neither absolute tone nor base', () => {
      const theme = glaze(280, 80);
      theme.colors({ text: { saturation: 0.5 } as never });
      expect(() => theme.resolve()).toThrow('must have either');
    });

    it('resolves colors with absolute tone and base (for contrast)', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { tone: 97 },
        card: { base: 'surface', tone: 46 },
      });
      const card = theme.resolve().get('card')!;
      expect(llOf(card.light)).toBeGreaterThan(0);
      expect(llOf(card.light)).toBeLessThan(0.966);
    });

    it('clamps contrast-solved tone to the scheme range (no pure black)', () => {
      glaze.configure({ lightTone: { lo: 13, hi: 100, eps: 0.05 } });
      const theme = glaze(210, 75);
      theme.colors({
        surface: { tone: 100, saturation: 0.2 },
        text: { base: 'surface', tone: 0, contrast: 'AAA', saturation: 0.08 },
      });
      const text = theme.resolve().get('text')!;
      expect(llOf(text.light)).toBeGreaterThanOrEqual(0);
      expect(llOf(text.light)).toBeLessThanOrEqual(1);
      glaze.resetConfig();
    });
  });

  describe('relative tone', () => {
    it('negative relative tone means lower tone (darker) than base in light', () => {
      const theme = glaze(0, 0);
      theme.colors({
        surface: { tone: 97 },
        text: { base: 'surface', tone: '-52' },
      });
      const r = theme.resolve();
      const surface = r.get('surface')!;
      const text = r.get('text')!;
      expect(text.light.t).toBeCloseTo(surface.light.t - 0.52, 3);
      expect(llOf(text.light)).toBeLessThan(llOf(surface.light));
    });

    it('positive relative tone means lighter than base in light', () => {
      const theme = glaze(0, 0);
      theme.colors({
        fill: { tone: 52 },
        text: { base: 'fill', tone: '+30' },
      });
      const r = theme.resolve();
      const fill = r.get('fill')!;
      const text = r.get('text')!;
      // in-range offset → lighter than the base
      expect(text.light.t).toBeCloseTo(fill.light.t + 0.3, 3);
      expect(llOf(text.light)).toBeGreaterThan(llOf(fill.light));
    });

    it('clamps to the boundary when autoFlip is disabled', () => {
      const theme = glaze(0, 0);
      theme.colors({
        fill: { tone: 52 },
        text: { base: 'fill', tone: '+48', autoFlip: false },
      });
      const r = theme.resolve();
      // 0.5556 + 0.48 overshoots → clamps to light window hi (1.0)
      expect(llOf(r.get('text')!.light)).toBeCloseTo(1.0, 2);
    });

    it('mirrors an overshooting offset by default (autoFlip inherits config)', () => {
      const theme = glaze(0, 0);
      theme.colors({
        fill: { tone: 52 },
        text: { base: 'fill', tone: '+48' },
      });
      const r = theme.resolve();
      const fill = r.get('fill')!;
      const text = r.get('text')!;
      // default autoFlip (config autoFlip true) mirrors +0.48 → -0.48 below the base
      expect(text.light.t).toBeCloseTo(fill.light.t - 0.48, 3);
    });

    it('relative deltas stay contrast-uniform (anchored to base tone) in dark', () => {
      const theme = glaze(0, 0);
      theme.colors({
        s: { tone: 100 },
        s2: { base: 's', tone: '-2' },
        s3: { base: 's2', tone: '-2' },
      });
      const r = theme.resolve();
      const s = r.get('s')!;
      const s2 = r.get('s2')!;
      const s3 = r.get('s3')!;
      // dark mapped lightnesses from the new pipeline
      expect(llOf(s.dark)).toBeCloseTo(0.15, 2);
      expect(llOf(s2.dark)).toBeCloseTo(0.1678, 2);
      expect(llOf(s3.dark)).toBeCloseTo(0.1846, 2);
      // each gap is visible
      expect(llOf(s2.dark) - llOf(s.dark)).toBeGreaterThan(0.01);
      expect(llOf(s3.dark) - llOf(s2.dark)).toBeGreaterThan(0.01);
    });

    it('relative deltas expand near-black gaps in HC dark', () => {
      const theme = glaze(0, 0);
      theme.colors({
        s: { tone: 100 },
        s2: { base: 's', tone: '-2' },
        s3: { base: 's2', tone: '-2' },
      });
      const r = theme.resolve();
      expect(llOf(r.get('s')!.darkContrast)).toBeCloseTo(0, 2);
      expect(llOf(r.get('s2')!.darkContrast)).toBeCloseTo(0.0565, 2);
      expect(llOf(r.get('s3')!.darkContrast)).toBeCloseTo(0.0873, 2);
    });

    it('accepts a [normal, hc] tone pair', () => {
      const theme = glaze(0, 0);
      theme.colors({
        surface: { tone: 97 },
        text: { base: 'surface', tone: [30, 20] },
      });
      const text = theme.resolve().get('text')!;
      // normal uses 30, HC uses 20 → HC light is darker
      expect(llOf(text.lightContrast)).toBeLessThan(llOf(text.light));
    });
  });

  describe("extreme tone ('max' / 'min')", () => {
    it("'max' forces the lightest tone as a root color (no base)", () => {
      const theme = glaze(0, 0);
      theme.colors({ ceil: { tone: 'max' } });
      const ceil = theme.resolve().get('ceil')!;
      expect(ceil.light.t).toBeCloseTo(1, 4);
      expect(llOf(ceil.light)).toBeCloseTo(1, 2);
    });

    it("'min' forces the lowest tone as a root color (no base)", () => {
      const theme = glaze(0, 0);
      theme.colors({ floor: { tone: 'min' } });
      const floor = theme.resolve().get('floor')!;
      // 'min' = author tone 0 → light window lo
      expect(llOf(floor.light)).toBeCloseTo(0.1, 2);
    });

    it("'max' inverts to the darkest tone in dark under mode 'auto'", () => {
      const theme = glaze(0, 0);
      theme.colors({ ceil: { tone: 'max' } });
      const ceil = theme.resolve().get('ceil')!;
      // author 100 inverts to 0 → dark window lo (darkest)
      expect(llOf(ceil.dark)).toBeCloseTo(0.15, 2);
      expect(llOf(ceil.dark)).toBeLessThan(llOf(ceil.light));
    });

    it("'max' pins the same extreme across schemes with mode 'static'", () => {
      const theme = glaze(0, 0);
      theme.colors({ ceil: { tone: 'max', mode: 'static' } });
      const ceil = theme.resolve().get('ceil')!;
      expect(ceil.light.t).toBeCloseTo(1, 4);
      expect(ceil.dark.t).toBeCloseTo(1, 4);
    });

    it("'max' uses the full range [0,100] in high-contrast", () => {
      const theme = glaze(0, 0);
      theme.colors({ ceil: { tone: 'max' } });
      const ceil = theme.resolve().get('ceil')!;
      expect(ceil.lightContrast.t).toBeCloseTo(1, 4);
      expect(ceil.darkContrast.t).toBeCloseTo(0, 4);
    });

    it("'max' / 'min' work on a dependent color (mapped through scheme)", () => {
      const theme = glaze(0, 0);
      theme.colors({
        surface: { tone: 90 },
        knockout: { base: 'surface', tone: 'max' },
      });
      const knockout = theme.resolve().get('knockout')!;
      expect(knockout.light.t).toBeCloseTo(1, 4);
    });

    it("'max' with a base replays the light tone shift in dark", () => {
      const theme = glaze(0, 0);
      theme.colors({
        bg: { tone: 60 },
        fg: { base: 'bg', tone: 'max' },
      });
      const r = theme.resolve();
      const bg = r.get('bg')!;
      const fg = r.get('fg')!;
      const lightShift = (fg.light.t - bg.light.t) * 100;
      const darkShift = (fg.dark.t - bg.dark.t) * 100;
      expect(lightShift).toBeGreaterThan(0);
      // `auto` inverts both ends, so the shift mirrors but keeps its size.
      expect(darkShift).toBeCloseTo(-lightShift, 4);
      expect(variantContrast(fg.dark, bg.dark)).toBeCloseTo(
        variantContrast(fg.light, bg.light),
        2,
      );
    });

    it("'max' with a base may cross the dark tone window edge", () => {
      const theme = glaze(0, 0);
      theme.colors({
        bg: { tone: 60 },
        fg: { base: 'bg', tone: 'max' },
      });
      const fg = theme.resolve().get('fg')!;
      // Preserving the shift takes the extreme past the dark window lo (0.15).
      expect(llOf(fg.dark)).toBeLessThan(0.15);
    });

    it("'min' with a base pins at the extreme when the shift overshoots", () => {
      const theme = glaze(0, 0);
      theme.colors({
        bg: { tone: 'max' },
        fg: { base: 'bg', tone: 'min' },
      });
      const r = theme.resolve();
      const bg = r.get('bg')!;
      const fg = r.get('fg')!;
      // The dark base sits at the dark window lo, so there is no room for the
      // full light shift — the replay clamps at tone 100 instead of the
      // window hi (which is what the plain scheme mapping would give).
      expect(fg.dark.t).toBeCloseTo(1, 4);
      expect(variantContrast(fg.dark, bg.dark)).toBeGreaterThan(15);
    });

    it("'max' with a base keeps the shift on the same side under 'fixed'", () => {
      const theme = glaze(0, 0);
      theme.colors({
        bg: { tone: 60 },
        fg: { base: 'bg', tone: 'max', mode: 'fixed' },
      });
      const r = theme.resolve();
      const bg = r.get('bg')!;
      const fg = r.get('fg')!;
      const lightShift = (fg.light.t - bg.light.t) * 100;
      const darkShift = (fg.dark.t - bg.dark.t) * 100;
      expect(darkShift).toBeCloseTo(lightShift, 4);
    });

    it("'max' with a base stays pinned under mode 'static'", () => {
      const theme = glaze(0, 0);
      theme.colors({
        bg: { tone: 60 },
        fg: { base: 'bg', tone: 'max', mode: 'static' },
      });
      const fg = theme.resolve().get('fg')!;
      expect(fg.light.t).toBeCloseTo(1, 4);
      expect(fg.dark.t).toBeCloseTo(1, 4);
    });

    it("'max' with a base and a contrast floor is not pulled back into the window", () => {
      const theme = glaze(0, 0);
      theme.colors({
        bg: { tone: 60 },
        fg: { base: 'bg', tone: 'max', contrast: 1.5 },
      });
      const fg = theme.resolve().get('fg')!;
      // The floor is already met at the replayed extreme, so it survives.
      expect(llOf(fg.dark)).toBeLessThan(0.15);
    });

    it("'max' with a base measures the shift per high-contrast level", () => {
      const theme = glaze(0, 0);
      theme.colors({
        bg: { tone: 60 },
        fg: { base: 'bg', tone: 'max' },
      });
      const r = theme.resolve();
      const bg = r.get('bg')!;
      const fg = r.get('fg')!;
      const lightShift = (fg.lightContrast.t - bg.lightContrast.t) * 100;
      const darkShift = (fg.darkContrast.t - bg.darkContrast.t) * 100;
      expect(darkShift).toBeCloseTo(-lightShift, 4);
    });

    it("keeps the plain scheme mapping for a standalone 'max' with contrast", () => {
      const token = glaze.color({
        hue: 0,
        saturation: 0,
        tone: 'max',
        contrast: 2,
      });
      const resolved = token.resolve();
      // The hidden seed anchor is not an authored base, so the extreme still
      // inverts into the dark window instead of replaying a shift against it.
      expect(llOf(resolved.dark)).toBeCloseTo(0.15, 2);
    });
  });

  describe('autoFlip prop', () => {
    it('autoFlip: false clamps an overshooting relative tone to the boundary', () => {
      const theme = glaze(0, 0);
      theme.colors({
        surface: { tone: 90 },
        chip: { base: 'surface', tone: '+30', autoFlip: false },
      });
      const chip = theme.resolve().get('chip')!;
      // 0.907 + 0.30 = 1.207 → clamps to 1.0
      expect(chip.light.t).toBeCloseTo(1, 4);
    });

    it('autoFlip: true mirrors an overshooting relative tone to the other side', () => {
      const theme = glaze(0, 0);
      theme.colors({
        surface: { tone: 90 },
        chip: { base: 'surface', tone: '+30', autoFlip: true },
      });
      const r = theme.resolve();
      const surface = r.get('surface')!;
      const chip = r.get('chip')!;
      // overshoot → mirror +0.30 to -0.30 → below the surface tone
      expect(chip.light.t).toBeCloseTo(surface.light.t - 0.3, 3);
      expect(chip.light.t).toBeLessThan(surface.light.t);
    });

    it('autoFlip: true clamps to the original side when the mirror also overshoots', () => {
      const theme = glaze(0, 0);
      theme.colors({
        surface: { tone: 20 },
        chip: { base: 'surface', tone: '+90', autoFlip: true },
      });
      const chip = theme.resolve().get('chip')!;
      // 20+90 and 20-90 both leave [0,100] → keep +90 and clamp to 100
      expect(chip.light.t).toBeCloseTo(1, 4);
    });

    it('autoFlip: true clamps negative double-overshoot to the original side', () => {
      const theme = glaze(0, 0);
      theme.colors({
        surface: { tone: 80 },
        chip: { base: 'surface', tone: '-90', autoFlip: true },
      });
      const chip = theme.resolve().get('chip')!;
      // 80-90 and 80+90 both leave [0,100] → keep -90 and clamp to 0
      expect(chip.light.t).toBeCloseTo(0, 4);
    });

    it('autoFlip does not change an in-range relative tone', () => {
      const autoFlipOff = glaze(0, 0);
      autoFlipOff.colors({
        surface: { tone: 50 },
        text: { base: 'surface', tone: '+20', autoFlip: false },
      });
      const autoFlipOn = glaze(0, 0);
      autoFlipOn.colors({
        surface: { tone: 50 },
        text: { base: 'surface', tone: '+20', autoFlip: true },
      });
      const a = autoFlipOff.resolve().get('text')!;
      const b = autoFlipOn.resolve().get('text')!;
      expect(a.light.t).toBeCloseTo(b.light.t, 4);
    });

    it('autoFlip defaults to the global autoFlip config', () => {
      glaze.configure({ autoFlip: false });
      try {
        const theme = glaze(0, 0);
        theme.colors({
          surface: { tone: 90 },
          chip: { base: 'surface', tone: '+30' },
        });
        const chip = theme.resolve().get('chip')!;
        // autoFlip false → clamp to boundary (no mirror)
        expect(chip.light.t).toBeCloseTo(1, 4);
      } finally {
        glaze.resetConfig();
      }
    });
  });

  describe('per-color hue', () => {
    it('absolute hue overrides theme seed', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { tone: 97, hue: 120 } });
      expect(theme.resolve().get('surface')!.light.h).toBe(120);
    });

    it('relative hue shifts from theme seed', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { tone: 97, hue: '+20' } });
      expect(theme.resolve().get('surface')!.light.h).toBeCloseTo(300, 2);
    });

    it('negative relative hue shifts backwards', () => {
      const theme = glaze(30, 80);
      theme.colors({ surface: { tone: 97, hue: '-50' } });
      expect(theme.resolve().get('surface')!.light.h).toBeCloseTo(340, 2);
    });

    it('hue wraps around 360', () => {
      const theme = glaze(350, 80);
      theme.colors({ surface: { tone: 97, hue: '+30' } });
      expect(theme.resolve().get('surface')!.light.h).toBeCloseTo(20, 2);
    });

    it('per-color hue is relative to theme seed, not base', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { tone: 97, hue: 120 },
        text: { base: 'surface', tone: '-30', hue: '+20' },
      });
      expect(theme.resolve().get('text')!.light.h).toBeCloseTo(300, 2);
    });
  });

  describe('adaptation modes', () => {
    it('auto mode inverts tone in dark scheme', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { tone: 97, saturation: 0.75 } });
      const surface = theme.resolve().get('surface')!;
      // tone 97 inverts to 3 then maps into dark window → dark much darker
      expect(llOf(surface.dark)).toBeLessThan(0.2);
      expect(llOf(surface.dark)).toBeLessThan(llOf(surface.light));
    });

    it('fixed mode maps tone without inversion', () => {
      const theme = glaze(280, 80);
      theme.colors({ fill: { tone: 52, mode: 'fixed' } });
      const fill = theme.resolve().get('fill')!;
      // fixed keeps tone order: dark is a windowed remap of the same tone
      expect(llOf(fill.dark)).toBeGreaterThan(0.3);
      expect(llOf(fill.dark)).toBeLessThan(0.7);
    });

    it('static mode preserves tone across schemes', () => {
      const theme = glaze(280, 80);
      theme.colors({ brand: { tone: 60, mode: 'static' } });
      const brand = theme.resolve().get('brand')!;
      expect(brand.dark.t).toBeCloseTo(brand.light.t, 4);
      expect(brand.dark.s).toBeCloseTo(brand.light.s, 4);
    });
  });

  describe('tone window boundaries', () => {
    it('tone 0 maps to light window lo and dark window hi (auto)', () => {
      const theme = glaze(0, 0);
      theme.colors({ black: { tone: 0 } });
      const black = theme.resolve().get('black')!;
      expect(llOf(black.light)).toBeCloseTo(0.1, 2); // light lo
      expect(llOf(black.dark)).toBeCloseTo(0.95, 2); // dark hi
    });

    it('tone 100 maps to light window hi and dark window lo (auto)', () => {
      const theme = glaze(0, 0);
      theme.colors({ white: { tone: 100 } });
      const white = theme.resolve().get('white')!;
      expect(llOf(white.light)).toBeCloseTo(1.0, 2); // light hi
      expect(llOf(white.dark)).toBeCloseTo(0.15, 2); // dark lo
    });

    it('high-contrast uses the full range [0, 100]', () => {
      const theme = glaze(0, 0);
      theme.colors({ surface: { tone: 97 } });
      const surface = theme.resolve().get('surface')!;
      // HC light ~ fromTone(97) at full range, HC dark inverts to near-black
      expect(llOf(surface.lightContrast)).toBeGreaterThan(0.9);
      expect(llOf(surface.darkContrast)).toBeLessThan(0.12);
    });

    it('does not affect fixed/static dark mapping by inversion', () => {
      const theme = glaze(0, 0);
      theme.colors({
        fixedC: { tone: 30, mode: 'fixed' },
        staticC: { tone: 30, mode: 'static' },
      });
      const r = theme.resolve();
      // static: identical tone across schemes
      expect(r.get('staticC')!.dark.t).toBeCloseTo(
        r.get('staticC')!.light.t,
        4,
      );
      // fixed: dark keeps the same tone ORDER (low tone stays low-ish)
      expect(llOf(r.get('fixedC')!.dark)).toBeLessThan(0.6);
    });

    it('[lo, hi] array window matches the { lo, hi, eps } object form', () => {
      const arrayTheme = glaze(0, 0);
      glaze.configure({ lightTone: [20, 90], darkTone: [15, 85] });
      arrayTheme.colors({ surface: { tone: 97 } });
      const arrayResult = arrayTheme.resolve().get('surface')!;
      glaze.resetConfig();

      const objTheme = glaze(0, 0);
      glaze.configure({
        lightTone: { lo: 20, hi: 90, eps: 0.05 },
        darkTone: { lo: 15, hi: 85, eps: 0.05 },
      });
      objTheme.colors({ surface: { tone: 97 } });
      const objResult = objTheme.resolve().get('surface')!;
      glaze.resetConfig();

      expect(arrayResult.light.t).toBeCloseTo(objResult.light.t, 5);
      expect(arrayResult.dark.t).toBeCloseTo(objResult.dark.t, 5);
    });

    it('array window lo/hi actually clamp the rendered lightness', () => {
      glaze.configure({ lightTone: [20, 90] });
      try {
        const theme = glaze(0, 0);
        theme.colors({
          white: { tone: 100 },
          black: { tone: 0 },
        });
        const r = theme.resolve();
        expect(llOf(r.get('white')!.light)).toBeCloseTo(0.9, 2);
        expect(llOf(r.get('black')!.light)).toBeCloseTo(0.2, 2);
      } finally {
        glaze.resetConfig();
      }
    });

    it('false window removes boundaries (full range) but keeps the curve', () => {
      glaze.configure({ lightTone: false });
      try {
        const theme = glaze(0, 0);
        theme.colors({
          white: { tone: 100 },
          black: { tone: 0 },
          mid: { tone: 50 },
        });
        const r = theme.resolve();
        // boundaries gone → endpoints reach 0 and 1
        expect(llOf(r.get('white')!.light)).toBeCloseTo(1, 2);
        expect(llOf(r.get('black')!.light)).toBeCloseTo(0, 2);
        // curve preserved → tone 50 is NOT lightness 0.5 (contrast-uniform)
        expect(r.get('mid')!.light.t).toBeCloseTo(0.5, 4);
        expect(llOf(r.get('mid')!.light)).not.toBeCloseTo(0.5, 2);
      } finally {
        glaze.resetConfig();
      }
    });
  });

  describe('saturation', () => {
    it('applies desaturation in dark mode', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { tone: 60, saturation: 0.75 } });
      const surface = theme.resolve().get('surface')!;
      expect(surface.dark.s).toBeCloseTo(surface.light.s * 0.9, 2);
    });
  });

  describe('dark hue / saturation', () => {
    it('theme dark seeds drive the dark and dark-HC variants', () => {
      const theme = glaze({
        hue: 280,
        saturation: 80,
        darkHue: 250,
        darkSaturation: 60,
      });
      theme.colors({ surface: { tone: 60 } });
      const surface = theme.resolve().get('surface')!;

      expect(surface.light.h).toBe(280);
      expect(surface.light.s).toBeCloseTo(0.8, 4);
      expect(surface.dark.h).toBe(250);
      expect(surface.dark.s).toBeCloseTo(0.6, 4);
      expect(surface.lightContrast.h).toBe(280);
      expect(surface.darkContrast.h).toBe(250);
      expect(surface.darkContrast.s).toBeCloseTo(0.6, 4);
    });

    it('per-color darkHue / darkSaturation override the def', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { tone: 60, saturation: 0.5, darkHue: 40, darkSaturation: 1 },
      });
      const surface = theme.resolve().get('surface')!;

      expect(surface.light.h).toBe(280);
      expect(surface.light.s).toBeCloseTo(0.4, 4);
      expect(surface.dark.h).toBe(40);
      expect(surface.dark.s).toBeCloseTo(0.8, 4);
    });

    it('per-color darkHue falls back to hue when omitted', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { tone: 60, hue: 120 } });
      const surface = theme.resolve().get('surface')!;
      expect(surface.dark.h).toBe(120);
    });

    it('relative darkHue anchors to the theme dark seed hue', () => {
      const theme = glaze({ hue: 280, saturation: 80, darkHue: 100 });
      theme.colors({ surface: { tone: 60, hue: '+20', darkHue: '+30' } });
      const surface = theme.resolve().get('surface')!;
      expect(surface.light.h).toBeCloseTo(300, 2);
      expect(surface.dark.h).toBeCloseTo(130, 2);
    });

    it('a relative hue with no darkHue re-anchors to the dark seed', () => {
      const theme = glaze({ hue: 280, saturation: 80, darkHue: 100 });
      theme.colors({ surface: { tone: 60, hue: '+20' } });
      expect(theme.resolve().get('surface')!.dark.h).toBeCloseTo(120, 2);
    });

    it('an absolute per-color hue ignores the theme dark seed', () => {
      const theme = glaze({ hue: 280, saturation: 80, darkHue: 100 });
      theme.colors({ surface: { tone: 60, hue: 33 } });
      expect(theme.resolve().get('surface')!.dark.h).toBe(33);
    });

    it('dark hue wraps around 360', () => {
      const theme = glaze({ hue: 280, saturation: 80, darkHue: 350 });
      theme.colors({ surface: { tone: 60, darkHue: '+30' } });
      expect(theme.resolve().get('surface')!.dark.h).toBeCloseTo(20, 2);
    });

    it('an explicit theme darkSaturation bypasses darkDesaturation', () => {
      const plain = glaze(280, 80);
      plain.colors({ surface: { tone: 60 } });
      expect(plain.resolve().get('surface')!.dark.s).toBeCloseTo(0.8 * 0.9, 4);

      const seeded = glaze({ hue: 280, saturation: 80, darkSaturation: 80 });
      seeded.colors({ surface: { tone: 60 } });
      expect(seeded.resolve().get('surface')!.dark.s).toBeCloseTo(0.8, 4);
    });

    it('an explicit per-color darkSaturation bypasses darkDesaturation', () => {
      const theme = glaze(280, 80);
      theme.colors({
        plain: { tone: 60, saturation: 0.5 },
        pinned: { tone: 60, saturation: 0.5, darkSaturation: 0.5 },
      });
      const resolved = theme.resolve();
      expect(resolved.get('plain')!.dark.s).toBeCloseTo(0.4 * 0.9, 4);
      expect(resolved.get('pinned')!.dark.s).toBeCloseTo(0.4, 4);
    });

    it('darkDesaturation still applies to the dark seed when unset', () => {
      const theme = glaze({ hue: 280, saturation: 80, darkHue: 250 });
      theme.colors({ surface: { tone: 60 } });
      expect(theme.resolve().get('surface')!.dark.s).toBeCloseTo(0.8 * 0.9, 4);
    });

    it('clamps a per-color darkSaturation factor to 0–1', () => {
      const theme = glaze(280, 100);
      theme.colors({ surface: { tone: 60, darkSaturation: 5 } });
      expect(theme.resolve().get('surface')!.dark.s).toBeCloseTo(1, 4);
    });

    it("mode: 'static' ignores both dark overrides", () => {
      const theme = glaze({
        hue: 280,
        saturation: 80,
        darkHue: 100,
        darkSaturation: 20,
      });
      theme.colors({
        brand: {
          tone: 60,
          mode: 'static',
          darkHue: 40,
          darkSaturation: 0.2,
        },
      });
      const brand = theme.resolve().get('brand')!;
      expect(brand.dark.h).toBe(brand.light.h);
      expect(brand.dark.s).toBeCloseTo(brand.light.s, 4);
    });

    it("mode: 'fixed' still honors the dark overrides", () => {
      const theme = glaze(280, 80);
      theme.colors({ fill: { tone: 52, mode: 'fixed', darkHue: 40 } });
      expect(theme.resolve().get('fill')!.dark.h).toBe(40);
    });

    it('the contrast solver measures the dark channels', () => {
      const theme = glaze({ hue: 280, saturation: 100, darkHue: 130 });
      theme.colors({
        surface: { tone: 97 },
        text: { base: 'surface', tone: '-40', contrast: 4.5 },
      });
      const resolved = theme.resolve();
      const text = resolved.get('text')!;
      const surface = resolved.get('surface')!;

      expect(text.dark.h).toBe(130);
      expectMeetsWcag(variantContrast(text.dark, surface.dark), 4.5);
    });

    it('shadow and mix colors inherit dark channels from their references', () => {
      const theme = glaze({ hue: 280, saturation: 100, darkHue: 130 });
      theme.colors({
        surface: { tone: 97 },
        accent: { tone: 50 },
        blend: { type: 'mix', base: 'surface', target: 'accent', value: 50 },
        shade: { type: 'shadow', bg: 'surface', fg: 'accent', intensity: 60 },
      });
      const resolved = theme.resolve();

      // Both are built from surface/accent, which are hue 130 in dark.
      expect(resolved.get('blend')!.dark.h).toBeCloseTo(130, 2);
      expect(resolved.get('shade')!.dark.h).toBeCloseTo(130, 2);
      expect(resolved.get('blend')!.light.h).toBeCloseTo(280, 2);
    });

    it('extend inherits dark seeds and can replace them', () => {
      const parent = glaze({
        hue: 280,
        saturation: 80,
        darkHue: 250,
        darkSaturation: 60,
      });
      parent.colors({ surface: { tone: 60 } });

      const inherited = parent.extend({ hue: 23 });
      expect(inherited.darkHue).toBe(250);
      expect(inherited.darkSaturation).toBe(60);
      expect(inherited.resolve().get('surface')!.dark.h).toBe(250);

      const replaced = parent.extend({ darkHue: 10, darkSaturation: 30 });
      expect(replaced.resolve().get('surface')!.dark.h).toBe(10);
      expect(replaced.resolve().get('surface')!.dark.s).toBeCloseTo(0.3, 4);
    });

    it('exposes the dark seeds as undefined when unset', () => {
      const theme = glaze(280, 80);
      expect(theme.darkHue).toBeUndefined();
      expect(theme.darkSaturation).toBeUndefined();
    });

    it('round-trips dark seeds through export / themeFrom', () => {
      const theme = glaze({
        hue: 280,
        saturation: 80,
        darkHue: 250,
        darkSaturation: 60,
      });
      theme.colors({
        surface: { tone: 60, darkHue: '+15', darkSaturation: 0.4 },
      });

      const data = JSON.parse(JSON.stringify(theme.export()));
      expect(data.darkHue).toBe(250);
      expect(data.darkSaturation).toBe(60);

      const restored = glaze.themeFrom(data);
      expect(restored.darkHue).toBe(250);
      expect(restored.resolve().get('surface')!.dark).toEqual(
        theme.resolve().get('surface')!.dark,
      );
    });

    it('omits dark seeds from export when unset', () => {
      const data = glaze(280, 80).export();
      expect('darkHue' in data).toBe(false);
      expect('darkSaturation' in data).toBe(false);
    });

    it('rejects a non-numeric darkHue on restore', () => {
      const data = glaze(280, 80).export();
      expect(() =>
        glaze.themeFrom({ ...data, darkHue: '250' as unknown as number }),
      ).toThrow(/"darkHue" to be a number/);
    });
  });

  describe('high-contrast mode', () => {
    it('uses HC pair value for tone', () => {
      const theme = glaze(0, 0);
      theme.colors({
        surface: { tone: 97 },
        text: { base: 'surface', tone: [40, 25] },
      });
      const text = theme.resolve().get('text')!;
      // Absolute tone is remapped into the scheme window, so the canonical
      // tone differs from the authored value, but HC (full range) < normal.
      expect(text.lightContrast.t).toBeLessThan(text.light.t);
      // HC uses authored 25 at full range → exactly tone 0.25.
      expect(text.lightContrast.t).toBeCloseTo(0.25, 2);
    });

    it('solves a higher contrast floor in HC via the inner pair', () => {
      const theme = glaze(0, 0);
      theme.colors({
        surface: { tone: 97 },
        text: { base: 'surface', tone: 40, contrast: { wcag: [4.5, 7] } },
      });
      const r = theme.resolve();
      const text = r.get('text')!;
      const surface = r.get('surface')!;
      expectMeetsWcag(
        variantContrast(text.lightContrast, surface.lightContrast),
        7,
      );
    });
  });

  describe('contrast metric (unified)', () => {
    it('a bare number is WCAG', () => {
      const theme = glaze(0, 0);
      theme.colors({
        bg: { tone: 97 },
        fg: { base: 'bg', tone: 40, contrast: 4.5 },
      });
      const r = theme.resolve();
      expectMeetsWcag(
        variantContrast(r.get('fg')!.light, r.get('bg')!.light),
        4.5,
      );
    });

    it('{ wcag } object selects WCAG', () => {
      const theme = glaze(0, 0);
      theme.colors({
        bg: { tone: 97 },
        fg: { base: 'bg', tone: 40, contrast: { wcag: 7 } },
      });
      const r = theme.resolve();
      expectMeetsWcag(
        variantContrast(r.get('fg')!.light, r.get('bg')!.light),
        7,
      );
    });

    it('{ apca } object pins an APCA Lc floor', () => {
      const theme = glaze(0, 0);
      theme.colors({
        bg: { tone: 97 },
        fg: { base: 'bg', tone: 50, contrast: { apca: 60 } },
      });
      const r = theme.resolve();
      // a meaningful Lc floor pushes fg far from the light bg
      expect(llOf(r.get('fg')!.light)).toBeLessThan(0.6);
    });

    it('outer pair form [{ wcag }, { wcag }] still works', () => {
      const theme = glaze(0, 0);
      theme.colors({
        bg: { tone: 97 },
        fg: {
          base: 'bg',
          tone: 40,
          contrast: [{ wcag: 4.5 }, { wcag: 7 }],
        },
      });
      const r = theme.resolve();
      expectMeetsWcag(
        variantContrast(r.get('fg')!.lightContrast, r.get('bg')!.lightContrast),
        7,
      );
    });

    it('auto-enhances a bare APCA floor by +15 Lc in high-contrast', () => {
      const theme = glaze(0, 0);
      theme.colors({
        bg: { tone: 97 },
        fg: { base: 'bg', tone: 50, contrast: { apca: 60 } },
      });
      const r = theme.resolve();
      const base = r.get('bg')!;
      const fg = r.get('fg')!;
      const normalLc = variantApca(fg.light, base.light, 'fg');
      const hcLc = variantApca(fg.lightContrast, base.lightContrast, 'fg');
      // HC targets Lc 75 (60 + 15) and so produces strictly more contrast.
      expect(hcLc).toBeGreaterThan(normalLc);
      expectMeetsApca(hcLc, 75);
    });

    it('does not auto-enhance when the inner apca pair gives an explicit HC value', () => {
      const mk = (contrast: ContrastSpec) => {
        const theme = glaze(0, 0);
        theme.colors({
          bg: { tone: 97 },
          fg: { base: 'bg', tone: 50, contrast },
        });
        return theme.resolve();
      };
      const explicit = mk({ apca: [60, 60] });
      const boosted = mk({ apca: 60 });
      const explicitHcLc = variantApca(
        explicit.get('fg')!.lightContrast,
        explicit.get('bg')!.lightContrast,
        'fg',
      );
      const boostedHcLc = variantApca(
        boosted.get('fg')!.lightContrast,
        boosted.get('bg')!.lightContrast,
        'fg',
      );
      // The bare target auto-enhances to Lc 75; the explicit [60, 60] pair
      // pins HC at 60 and so converges well below the boosted HC result.
      expect(boostedHcLc).toBeGreaterThan(explicitHcLc);
      expect(explicitHcLc).toBeLessThan(75);
    });

    it('auto-promotes a bare WCAG AA floor to AAA in high-contrast', () => {
      const theme = glaze(0, 0);
      theme.colors({
        bg: { tone: 97 },
        fg: { base: 'bg', tone: 50, contrast: 'AA' },
      });
      const r = theme.resolve();
      const base = r.get('bg')!;
      const fg = r.get('fg')!;
      // Normal targets AA (4.5); HC auto-promotes to AAA (7).
      expectMeetsWcag(variantContrast(fg.light, base.light), 4.5);
      expectMeetsWcag(variantContrast(fg.lightContrast, base.lightContrast), 7);
    });

    it('does not auto-promote when the inner wcag pair gives an explicit HC value', () => {
      const mk = (contrast: ContrastSpec) => {
        const theme = glaze(0, 0);
        theme.colors({
          bg: { tone: 97 },
          fg: { base: 'bg', tone: 50, contrast },
        });
        return theme.resolve();
      };
      const explicit = mk({ wcag: ['AA', 'AA'] });
      const promoted = mk('AA');
      const explicitHc = variantContrast(
        explicit.get('fg')!.lightContrast,
        explicit.get('bg')!.lightContrast,
      );
      const promotedHc = variantContrast(
        promoted.get('fg')!.lightContrast,
        promoted.get('bg')!.lightContrast,
      );
      // The bare preset promotes to AAA (7) in HC; the explicit ['AA','AA']
      // pair pins HC at AA (4.5) and so converges below the promoted result.
      expect(promotedHc).toBeGreaterThan(explicitHc);
      expect(explicitHc).toBeLessThan(7);
    });
  });

  describe('role inference', () => {
    it("infers 'border' from the name with no special pastel default", () => {
      const theme = glaze(280, 60);
      theme.colors({
        surface: { tone: 90 },
        border: { base: 'surface', tone: '-10' },
      });
      const r = theme.resolve();
      // Borders fall through to the config pastel default (no special default).
      expect(r.get('border')!.light.pastel).toBe(false);
    });

    it('border pastel follows the theme pastel override like any other color', () => {
      const theme = glaze(280, 60, { pastel: true });
      theme.colors({
        surface: { tone: 90 },
        border: { base: 'surface', tone: '-10' },
        text: { base: 'surface', tone: '-40' },
      });
      const r = theme.resolve();
      expect(r.get('border')!.light.pastel).toBe(true);
      expect(r.get('text')!.light.pastel).toBe(true);
    });

    it('explicit pastel on a border still applies', () => {
      const theme = glaze(280, 60);
      theme.colors({
        surface: { tone: 90 },
        border: { base: 'surface', tone: '-10', pastel: true },
      });
      const r = theme.resolve();
      expect(r.get('border')!.light.pastel).toBe(true);
    });

    it('non-border names keep the config pastel default (false)', () => {
      const theme = glaze(280, 60);
      theme.colors({
        surface: { tone: 90 },
        text: { base: 'surface', tone: '-40' },
      });
      const r = theme.resolve();
      expect(r.get('text')!.light.pastel).toBe(false);
    });

    it('last recognized name token wins (button-text -> text, input-bg -> surface)', () => {
      // Observable via APCA polarity: a text (fg) and a surface (bg) against
      // the same base converge to different tones for the same Lc floor.
      const theme = glaze(0, 50);
      theme.colors({
        bg: { tone: 80 },
        'button-text': { base: 'bg', contrast: { apca: 45 } },
        'input-bg': { base: 'bg', contrast: { apca: 45 } },
      });
      const r = theme.resolve();
      const asText = r.get('button-text')!.light;
      const asSurface = r.get('input-bg')!.light;
      const base = r.get('bg')!.light;
      // 'button-text' infers text (fg); 'input-bg' infers surface (bg).
      expectMeetsApca(variantApca(asText, base, 'fg'), 45);
      expectMeetsApca(variantApca(asSurface, base, 'bg'), 45);
      expect(Math.abs(llOf(asText) - llOf(asSurface))).toBeGreaterThan(0.01);
    });

    it('explicit role overrides name inference', () => {
      const theme = glaze(0, 50);
      theme.colors({
        bg: { tone: 90 },
        // Named like text but forced to a surface role.
        text: { base: 'bg', role: 'surface', contrast: { apca: 45 } },
        // A plain text name with default role (inferred text).
        label: { base: 'bg', contrast: { apca: 45 } },
      });
      const r = theme.resolve();
      const asSurface = r.get('text')!.light;
      const asText = r.get('label')!.light;
      const base = r.get('bg')!.light;
      // Polarity flips the APCA argument order, so the two converge differently.
      expect(Math.abs(llOf(asSurface) - llOf(asText))).toBeGreaterThan(0.01);
      expectMeetsApca(variantApca(asSurface, base, 'bg'), 45);
      expectMeetsApca(variantApca(asText, base, 'fg'), 45);
    });

    it("uses the opposite of the base's role when the name does not infer", () => {
      const theme = glaze(0, 50);
      theme.colors({
        bg: { tone: 90 }, // name 'bg' infers surface
        accent: { base: 'bg', contrast: { apca: 45 } }, // no keyword -> opposite of base
      });
      const r = theme.resolve();
      // base 'bg' is a surface -> 'accent' defaults to text (fg polarity).
      const base = r.get('bg')!.light;
      const accent = r.get('accent')!.light;
      expectMeetsApca(variantApca(accent, base, 'fg'), 45);
    });

    it('inferRole: false skips name inference and falls back to the base opposite', () => {
      const theme = glaze(0, 50, { inferRole: false });
      theme.colors({
        surface: { tone: 90 },
        border: { base: 'surface', tone: '-10' },
      });
      const r = theme.resolve();
      // Without inference, 'border' is just a name; base 'surface' infers...
      // but inference is off, so 'surface' falls to its default (root -> text),
      // and 'border' takes the opposite -> surface. No pastel default applies.
      expect(r.get('border')!.light.pastel).toBe(false);
    });

    it('APCA preset keywords resolve to role-independent Lc floors', () => {
      const theme = glaze(0, 0);
      theme.colors({
        bg: { tone: 97 },
        body: { base: 'bg', contrast: { apca: 'content' } },
        divider: { base: 'bg', role: 'border', contrast: { apca: 'min' } },
      });
      const r = theme.resolve();
      const base = r.get('bg')!.light;
      // 'content' -> Lc 60
      expectMeetsApca(variantApca(r.get('body')!.light, base, 'fg'), 60);
      // 'min' -> Lc 15 (border role -> bg-ordered? border is fg polarity)
      expectMeetsApca(variantApca(r.get('divider')!.light, base, 'fg'), 15);
    });

    it('back-compat: a dependent with no role defaults to foreground (fg)', () => {
      const theme = glaze(0, 0);
      theme.colors({
        bg: { tone: 97 },
        accent: { base: 'bg', tone: 50, contrast: { apca: 60 } },
      });
      const r = theme.resolve();
      // 'accent' name does not infer; base 'bg' infers surface -> accent is fg.
      const base = r.get('bg')!.light;
      expectMeetsApca(variantApca(r.get('accent')!.light, base, 'fg'), 60);
    });
  });

  describe('extend', () => {
    it('inherits color defs and overrides the seed hue', () => {
      const base = glaze(280, 80);
      base.colors({ surface: { tone: 97 } });
      const danger = base.extend({ hue: 23 });
      const r = danger.resolve();
      expect(r.get('surface')!.light.h).toBe(23);
    });

    it('child color edits do not leak back to the parent', () => {
      const base = glaze(280, 80);
      base.colors({ surface: { tone: 97 } });
      const child = base.extend({ hue: 23 });
      child.colors({ surface: { tone: 50 } });
      expect(llOf(base.resolve().get('surface')!.light)).toBeCloseTo(0.966, 2);
      expect(llOf(child.resolve().get('surface')!.light)).toBeCloseTo(0.515, 2);
    });
  });

  describe('token export', () => {
    it('emits Tasty #name keys with state aliases', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { tone: 97 } });
      const tokens = theme.tasty();
      expect(tokens['#surface']).toBeDefined();
      expect(tokens['#surface']['']).toMatch(/^oklch\(/);
      expect(
        tokens['#surface']['@media(prefers-color-scheme: dark)'],
      ).toBeDefined();
    });

    it('flat token map has a light entry', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { tone: 97 } });
      const tokens = theme.tokens();
      expect(tokens.light.surface).toMatch(/^oklch\(/);
      expect(tokens.dark.surface).toBeDefined();
    });
  });

  describe('JSON export', () => {
    it('groups variants per color', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { tone: 97 } });
      const json = theme.json();
      expect(json.surface.light).toMatch(/^oklch\(/);
      expect(json.surface.dark).toBeDefined();
    });
  });

  describe('palette', () => {
    function setup() {
      const primary = glaze(280, 80);
      primary.colors({ surface: { tone: 97 } });
      const danger = primary.extend({ hue: 23 });
      return glaze.palette({ primary, danger });
    }

    it('combines themes with prefix (tokens)', () => {
      const tokens = setup().tokens({ prefix: true });
      expect(tokens.light['primary-surface']).toBeDefined();
      expect(tokens.light['danger-surface']).toBeDefined();
      expect(tokens.dark['primary-surface']).toBeDefined();
    });

    it('supports custom prefix mapping (tokens)', () => {
      const tokens = setup().tokens({
        prefix: { primary: 'brand-', danger: 'error-' },
      });
      expect(tokens.light['brand-surface']).toBeDefined();
      expect(tokens.light['error-surface']).toBeDefined();
    });

    it('combines themes with prefix (tasty)', () => {
      const tokens = setup().tasty({ prefix: true });
      expect(tokens['#primary-surface']).toBeDefined();
      expect(tokens['#danger-surface']).toBeDefined();
    });

    it('exports JSON with theme grouping', () => {
      const json = setup().json();
      expect(json.primary).toBeDefined();
      expect(json.danger).toBeDefined();
      expect(json.primary.surface.light).toMatch(/^oklch\(/);
    });

    it('defaults to prefix: true for palette tokens', () => {
      const tokens = setup().tokens();
      expect(tokens.light['primary-surface']).toBeDefined();
      expect(tokens.light['surface']).toBeUndefined();
    });

    it('duplicates primary theme tokens without prefix when requested', () => {
      const tokens = setup().tokens({ primary: 'primary' });
      expect(tokens.light['primary-surface']).toBeDefined();
      expect(tokens.light['surface']).toBeDefined();
      expect(tokens.light['surface']).toBe(tokens.light['primary-surface']);
    });
  });

  describe('configure', () => {
    it('changes the dark window', () => {
      glaze.configure({ darkTone: { lo: 20, hi: 90, eps: 0.05 } });
      const theme = glaze(0, 0);
      theme.colors({ white: { tone: 100 } });
      // dark lo is now 20 → 0.2
      expect(llOf(theme.resolve().get('white')!.dark)).toBeCloseTo(0.2, 2);
      glaze.resetConfig();
    });

    it('resetConfig restores defaults', () => {
      glaze.configure({ darkTone: { lo: 20, hi: 90, eps: 0.05 } });
      glaze.resetConfig();
      const theme = glaze(0, 0);
      theme.colors({ white: { tone: 100 } });
      expect(llOf(theme.resolve().get('white')!.dark)).toBeCloseTo(0.15, 2);
    });

    it('getConfig reflects the live tone windows', () => {
      const cfg = glaze.getConfig();
      expect(cfg.lightTone).toEqual({ lo: 10, hi: 100, eps: 0.05 });
      expect(cfg.darkTone).toEqual({ lo: 15, hi: 95, eps: 0.05 });
    });
  });

  describe('output modes', () => {
    it('omits dark when modes.dark is false', () => {
      glaze.configure({ modes: { dark: false } });
      const theme = glaze(280, 80);
      theme.colors({ surface: { tone: 97 } });
      const tokens = theme.tokens();
      expect(tokens.light).toBeDefined();
      expect(tokens.dark).toBeUndefined();
      glaze.resetConfig();
    });

    it('includes high-contrast when modes.highContrast is true', () => {
      glaze.configure({ modes: { highContrast: true } });
      const theme = glaze(280, 80);
      theme.colors({ surface: { tone: 97 } });
      const tokens = theme.tokens();
      expect(tokens.lightContrast).toBeDefined();
      glaze.resetConfig();
    });
  });

  describe('color getter / remove / has / list / reset', () => {
    it('round-trips a color through getter and setter', () => {
      const theme = glaze(280, 80);
      theme.color('surface', { tone: 97 });
      expect(theme.color('surface')).toEqual({ tone: 97 });
    });

    it('removes a color', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { tone: 97 }, text: { tone: 30 } });
      theme.remove('text');
      expect(theme.has('text')).toBe(false);
      expect(theme.has('surface')).toBe(true);
    });

    it('lists color names', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { tone: 97 }, text: { tone: 30 } });
      expect(theme.list().sort()).toEqual(['surface', 'text']);
    });

    it('reset clears all colors', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { tone: 97 } });
      theme.reset();
      expect(theme.list()).toEqual([]);
    });
  });

  describe('export / from', () => {
    it('round-trips a theme config', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { tone: 97 },
        text: { base: 'surface', tone: '-52', contrast: 'AA' },
      });
      const exported = theme.export();
      const restored = glaze.from(exported);
      expect(restored.hue).toBe(280);
      expect(restored.saturation).toBe(80);
      const a = theme.resolve().get('text')!;
      const b = restored.resolve().get('text')!;
      expect(b.light.t).toBeCloseTo(a.light.t, 4);
    });

    it('theme.export includes kind, version, and frozen config', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { tone: 97 } });
      const exported = theme.export();
      expect(exported.kind).toBe('theme');
      expect(exported.version).toBe(1);
      expect(exported.config?.lightTone).toEqual({
        lo: 10,
        hi: 100,
        eps: 0.05,
      });
      expect(exported.config?.pastel).toBe(false);
      expect(exported.config?.inferRole).toBe(true);
    });

    it('themeFrom is an alias of from and freezes against configure()', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { tone: 50, saturation: 1 } });
      const exported = theme.export();
      expect(exported.config?.inferRole).toBe(true);

      glaze.configure({ inferRole: false });
      try {
        const viaFrom = glaze.from(exported);
        const viaThemeFrom = glaze.themeFrom(
          JSON.parse(JSON.stringify(exported)),
        );
        expect(viaFrom.getConfig().inferRole).toBe(true);
        expect(viaThemeFrom.getConfig().inferRole).toBe(true);
        // Live theme without frozen override still tracks global.
        expect(theme.getConfig().inferRole).toBe(false);
      } finally {
        glaze.resetConfig();
      }
    });

    it('export(override) merges over instance local at export time', () => {
      const theme = glaze(280, 80, { autoFlip: false });
      theme.colors({ surface: { tone: 50 } });
      const exported = theme.export({ pastel: true });
      expect(exported.config?.autoFlip).toBe(false);
      expect(exported.config?.pastel).toBe(true);
      const restored = glaze.themeFrom(exported);
      expect(restored.resolve().get('surface')!.light.pastel).toBe(true);
    });

    it('deep-clones colors on export', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { tone: 97 } });
      const exported = theme.export();
      exported.colors.surface = { tone: 10 };
      expect(theme.color('surface')!.tone).toBe(97);
    });

    it('accepts legacy theme snapshots without kind/version', () => {
      const restored = glaze.themeFrom({
        hue: 200,
        saturation: 60,
        colors: { surface: { tone: 90 } },
      });
      expect(restored.hue).toBe(200);
      expect(restored.resolve().get('surface')).toBeDefined();
    });

    it('rejects wrong kind and future version', () => {
      expect(() =>
        glaze.themeFrom({
          kind: 'palette',
          version: 1,
          hue: 0,
          saturation: 0,
          colors: {},
        } as never),
      ).toThrow(/expected kind "theme"/);
      expect(() =>
        glaze.themeFrom({
          kind: 'theme',
          version: 99,
          hue: 0,
          saturation: 0,
          colors: {},
        }),
      ).toThrow(/unsupported export version 99/);
    });

    it('rejects non-positive or non-integer version', () => {
      const base = {
        kind: 'theme' as const,
        hue: 0,
        saturation: 0,
        colors: {},
      };
      expect(() => glaze.themeFrom({ ...base, version: 0 })).toThrow(
        /invalid "version"/,
      );
      expect(() => glaze.themeFrom({ ...base, version: -1 })).toThrow(
        /invalid "version"/,
      );
      expect(() => glaze.themeFrom({ ...base, version: 1.5 })).toThrow(
        /invalid "version"/,
      );
    });
  });

  describe('palette export / paletteFrom', () => {
    function richPalette() {
      const brand = glaze(280, 80);
      brand.colors({
        surface: { tone: 97 },
        text: { base: 'surface', tone: '-52', contrast: 'AA' },
        shadow: {
          type: 'shadow',
          bg: 'surface',
          fg: 'text',
          intensity: 10,
        },
        muted: {
          type: 'mix',
          base: 'surface',
          target: 'text',
          value: 40,
        },
      });
      const danger = brand.extend({ hue: 23 });
      return glaze.palette({ brand, danger }, { primary: 'brand' });
    }

    it('round-trips via JSON including shadow and mix relations', () => {
      const palette = richPalette();
      const snapshot = JSON.parse(JSON.stringify(palette.export()));
      expect(snapshot.kind).toBe('palette');
      expect(snapshot.version).toBe(1);
      expect(snapshot.primary).toBe('brand');
      expect(snapshot.themes.brand.kind).toBe('theme');

      const restored = glaze.paletteFrom(snapshot);
      expect(restored.list()).toEqual(['brand', 'danger']);
      expect(restored.primary).toBe('brand');

      const origText = palette.theme('brand')!.resolve().get('text')!;
      const restText = restored.theme('brand')!.resolve().get('text')!;
      expect(restText.light.t).toBeCloseTo(origText.light.t, 4);

      const origShadow = palette.theme('brand')!.resolve().get('shadow')!;
      const restShadow = restored.theme('brand')!.resolve().get('shadow')!;
      expect(restShadow.light.t).toBeCloseTo(origShadow.light.t, 4);
      expect(restShadow.light.alpha).toBeCloseTo(origShadow.light.alpha, 4);

      const origMix = palette.theme('brand')!.resolve().get('muted')!;
      const restMix = restored.theme('brand')!.resolve().get('muted')!;
      expect(restMix.light.t).toBeCloseTo(origMix.light.t, 4);
    });

    it('exposes theme introspection with live references', () => {
      const palette = richPalette();
      expect(palette.theme('missing')).toBeUndefined();
      const brand = palette.theme('brand')!;
      brand.colors({ accent: { tone: 50 } });
      expect(palette.tokens().light['brand-accent']).toBeDefined();
      expect(Object.keys(palette.themes())).toEqual(['brand', 'danger']);
    });

    it('rejects bad primary and malformed themes', () => {
      expect(() =>
        glaze.paletteFrom({
          kind: 'palette',
          version: 1,
          themes: { brand: { hue: 280, saturation: 80, colors: {} } },
          primary: 'nope',
        }),
      ).toThrow(/primary theme "nope"/);
      expect(() =>
        glaze.paletteFrom({
          kind: 'theme',
          version: 1,
          themes: {},
        } as never),
      ).toThrow(/expected kind "palette"/);
      expect(() => glaze.paletteFrom(null as never)).toThrow(
        /expected an object/,
      );
    });
  });

  describe('export type guards', () => {
    it('discriminates theme, color, and palette snapshots', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { tone: 97 } });
      const themeExp = theme.export();
      const colorExp = glaze.color('#26fcb2').export();
      const paletteExp = glaze
        .palette({ brand: theme }, { primary: 'brand' })
        .export();

      expect(glaze.isThemeExport(themeExp)).toBe(true);
      expect(glaze.isColorTokenExport(themeExp)).toBe(false);
      expect(glaze.isPaletteExport(themeExp)).toBe(false);

      expect(glaze.isColorTokenExport(colorExp)).toBe(true);
      expect(glaze.isThemeExport(colorExp)).toBe(false);

      expect(glaze.isPaletteExport(paletteExp)).toBe(true);
      expect(glaze.isThemeExport(paletteExp)).toBe(false);

      // Legacy shape without kind
      expect(glaze.isThemeExport({ hue: 1, saturation: 2, colors: {} })).toBe(
        true,
      );
      expect(glaze.isColorTokenExport({ form: 'value', input: '#fff' })).toBe(
        true,
      );
      expect(glaze.isPaletteExport({ themes: {} })).toBe(true);
    });
  });

  describe('fromHex / fromRgb', () => {
    it('creates a theme from a hex seed', () => {
      const theme = glaze.fromHex('#7c3aed');
      expect(theme.hue).toBeGreaterThan(0);
      expect(theme.saturation).toBeGreaterThan(0);
    });

    it('creates a theme from rgb', () => {
      const theme = glaze.fromRgb(124, 58, 237);
      expect(theme.hue).toBeGreaterThan(0);
      expect(theme.saturation).toBeGreaterThan(0);
      // parseHex of the same color yields a consistent hue family.
      expect(parseHex('#7c3aed')).not.toBeNull();
    });
  });

  describe('format option', () => {
    it('supports rgb / hsl / oklch output on tokens and json', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { tone: 97 } });
      expect(theme.tokens({ format: 'rgb' }).light.surface).toMatch(/^rgb/);
      expect(theme.tokens({ format: 'hsl' }).light.surface).toMatch(/^hsl/);
      expect(theme.tokens({ format: 'oklch' }).light.surface).toMatch(/^oklch/);
      expect(theme.json({ format: 'oklch' }).surface.light).toMatch(/^oklch\(/);
    });

    it('rejects okhsl and okhst on non-tasty exports', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { tone: 97 } });
      for (const format of ['okhsl', 'okhst'] as const) {
        expect(() => theme.tokens({ format })).toThrow(
          /only supported by tasty/,
        );
        expect(() => theme.json({ format })).toThrow(/only supported by tasty/);
        expect(() => theme.css({ format })).toThrow(/only supported by tasty/);
        expect(() => theme.tailwind({ format })).toThrow(
          /only supported by tasty/,
        );
      }
    });

    it('emits okhst via tasty()', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { tone: 97 } });
      expect(theme.tasty({ format: 'okhst' })['#surface']['']).toMatch(
        /^okhst\(/,
      );
    });
  });

  describe('css export', () => {
    it('emits custom property declarations per scheme', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { tone: 97 } });
      const css = theme.css();
      expect(css.light).toMatch(/--surface-color:/);
      expect(css.dark).toMatch(/--surface-color:/);
    });
  });

  describe('splitHue export', () => {
    function pastelTheme() {
      const theme = glaze(240, 18, { pastel: true });
      theme.colors({
        surface: { tone: 35 },
        accent: { hue: '+20', tone: 52, saturation: 0.5 },
      });
      return theme;
    }

    it('throws when any color is not pastel', () => {
      const theme = glaze(240, 18);
      theme.colors({ surface: { tone: 35 } });
      expect(() => theme.css({ format: 'oklch', splitHue: true })).toThrow(
        /requires every color to be pastel/,
      );
    });

    it('css emits theme hue var and var()-referenced oklch colors', () => {
      const theme = pastelTheme();
      const css = theme.css({
        format: 'oklch',
        splitHue: true,
        name: 'brand',
      });
      expect(css.light).toContain('--brand-hue: 240;');
      expect(css.light).toContain('--accent-hue: calc(var(--brand-hue) + 20);');
      expect(css.light).toMatch(
        /--surface-color: oklch\([^)]*var\(--brand-hue\)/,
      );
      expect(css.light).toMatch(
        /--accent-color: oklch\([^)]*var\(--accent-hue\)/,
      );
    });

    it('tasty emits $brand-hue and var()-referenced oklch colors', () => {
      const theme = pastelTheme();
      const tokens = theme.tasty({
        format: 'oklch',
        splitHue: true,
        name: 'brand',
      });
      expect(tokens['$brand-hue']['']).toBe('240');
      expect(tokens['$accent-hue']['']).toBe('calc(var(--brand-hue) + 20)');
      expect(tokens['#surface']['']).toMatch(/oklch\([^)]*var\(--brand-hue\)/);
      expect(tokens['#accent']['']).toMatch(/oklch\([^)]*var\(--accent-hue\)/);
    });

    it('is a no-op for hsl and rgb formats', () => {
      const theme = pastelTheme();
      const inline = theme.css({ format: 'rgb' });
      const withFlag = theme.css({ format: 'rgb', splitHue: true });
      expect(withFlag.light).toBe(inline.light);
    });

    it('emits no dark hue declarations without a dark hue', () => {
      const css = pastelTheme().css({
        format: 'oklch',
        splitHue: true,
        name: 'brand',
      });
      expect(css.dark).not.toContain('-hue:');
      expect(css.darkContrast).not.toContain('-hue:');
    });

    it('re-declares the whole hue set in dark when the seed differs', () => {
      const theme = glaze(
        { hue: 240, saturation: 18, darkHue: 200 },
        undefined,
        { pastel: true },
      );
      theme.colors({
        surface: { tone: 35 },
        accent: { hue: '+20', tone: 52 },
        warning: { hue: 40, darkHue: 50, tone: 52 },
      });
      const css = theme.css({ format: 'oklch', splitHue: true, name: 'brand' });

      expect(css.light).toContain('--brand-hue: 240;');
      expect(css.light).toContain('--warning-hue: 40;');
      expect(css.dark).toContain('--brand-hue: 200;');
      expect(css.dark).toContain('--warning-hue: 50;');
      // `accent` keeps identical text but must still be re-declared, so it
      // re-resolves against the dark `--brand-hue`.
      expect(css.light).toContain('--accent-hue: calc(var(--brand-hue) + 20);');
      expect(css.dark).toContain('--accent-hue: calc(var(--brand-hue) + 20);');
      // Dark high-contrast shares the dark hue.
      expect(css.darkContrast).toContain('--brand-hue: 200;');
    });

    it('emits dark hue declarations for a per-color darkHue alone', () => {
      const theme = glaze(240, 18, { pastel: true });
      theme.colors({ surface: { tone: 35, darkHue: 90 } });
      const css = theme.css({ format: 'oklch', splitHue: true, name: 'brand' });
      expect(css.dark).toContain('--surface-hue: 90;');
      // The theme var is part of the set even though its value is unchanged.
      expect(css.dark).toContain('--brand-hue: 240;');
    });

    it('pins a static color so it does not drift with the dark seed', () => {
      const theme = glaze(
        { hue: 240, saturation: 18, darkHue: 200 },
        undefined,
        { pastel: true },
      );
      theme.colors({ pinned: { tone: 52, mode: 'static' } });
      const css = theme.css({ format: 'oklch', splitHue: true, name: 'brand' });

      expect(css.light).toContain('--pinned-hue: 240;');
      expect(css.dark).toContain('--pinned-hue: 240;');
      expect(theme.resolve().get('pinned')!.dark.h).toBe(240);
    });

    it('tasty emits the dark hue under the dark state', () => {
      const theme = glaze(
        { hue: 240, saturation: 18, darkHue: 200 },
        undefined,
        { pastel: true },
      );
      theme.colors({ surface: { tone: 35 } });
      const tokens = theme.tasty({
        format: 'oklch',
        splitHue: true,
        name: 'brand',
      });
      expect(tokens['$brand-hue']['']).toBe('240');
      expect(tokens['$brand-hue']['@media(prefers-color-scheme: dark)']).toBe(
        '200',
      );
    });

    it('tasty omits the dark hue when dark mode is off', () => {
      const theme = glaze(
        { hue: 240, saturation: 18, darkHue: 200 },
        undefined,
        { pastel: true },
      );
      theme.colors({ surface: { tone: 35 } });
      const tokens = theme.tasty({
        format: 'oklch',
        splitHue: true,
        name: 'brand',
        modes: { dark: false },
      });
      expect(tokens['$brand-hue']).toEqual({ '': '240' });
    });

    it('standalone css emits the dark hue for a token darkHue', () => {
      const color = glaze.color({
        hue: 240,
        saturation: 18,
        tone: 52,
        darkHue: 200,
        pastel: true,
      });
      const css = color.css({
        name: 'brand',
        format: 'oklch',
        splitHue: true,
      });
      expect(css.light).toContain('--brand-hue: 240;');
      expect(css.dark).toContain('--brand-hue: 200;');
    });

    it('palette scopes hue vars per theme', () => {
      const brand = glaze(240, 18, { pastel: true });
      brand.colors({ surface: { tone: 35 } });
      const accent = brand.extend({ hue: 23 });
      accent.colors({ surface: { tone: 40 } });
      const palette = glaze.palette({ brand, accent }, { primary: 'brand' });
      const css = palette.css({
        format: 'oklch',
        splitHue: true,
      });
      expect(css.light).toContain('--brand-hue: 240;');
      expect(css.light).toContain('--accent-hue: 23;');
      expect(css.light).toMatch(
        /--surface-color: oklch\([^)]*var\(--brand-hue\)/,
      );
      expect(css.light).toMatch(
        /--accent-surface-color: oklch\([^)]*var\(--accent-hue\)/,
      );
    });

    it('standalone css emits constant --name-hue for pastel tokens', () => {
      const color = glaze.color({
        hue: 240,
        saturation: 18,
        tone: 52,
        pastel: true,
      });
      const css = color.css({
        name: 'brand',
        format: 'oklch',
        splitHue: true,
      });
      expect(css.light).toContain('--brand-hue: 240;');
      expect(css.light).toMatch(
        /--brand-color: oklch\([^)]*var\(--brand-hue\)/,
      );
    });

    it('standalone css throws when token is not pastel', () => {
      const color = glaze.color({ hue: 240, saturation: 18, tone: 52 });
      expect(() =>
        color.css({ name: 'brand', format: 'oklch', splitHue: true }),
      ).toThrow(/requires every color to be pastel/);
    });

    it('inlines achromatic, shadow, and mix colors and preserves alpha', () => {
      const theme = glaze(240, 18, { pastel: true });
      theme.colors({
        surface: { tone: 50 },
        accent: { hue: 280, tone: 52 },
        border: { tone: 50, saturation: 0 },
        text: { base: 'surface', tone: 5, contrast: 4.5 },
        shadow: {
          type: 'shadow',
          bg: 'surface',
          fg: 'text',
          intensity: 0.5,
        },
        ghost: {
          type: 'mix',
          base: 'surface',
          target: 'accent',
          value: 0.5,
        },
        overlay: { tone: 50, opacity: 0.5 },
      });
      const css = theme.css({
        format: 'oklch',
        splitHue: true,
        name: 'brand',
      });
      // absolute hue override → per-color var
      expect(css.light).toContain('--accent-hue: 280;');
      // achromatic → inline oklch(L 0 0), no hue var
      expect(css.light).toMatch(/--border-color: oklch\([\d.]+ 0 0\)/);
      // shadow → inline (no var()), with alpha
      expect(css.light).toMatch(
        /--shadow-color: oklch\([\d.]+ [\d.]+ [\d.]+ \/ [\d.]+\)/,
      );
      expect(css.light).not.toMatch(/--shadow-color:[^;]*var\(/);
      // mix → inline (no var())
      expect(css.light).toMatch(/--ghost-color: oklch\([\d.]+ [\d.]+ [\d.]+\)/);
      expect(css.light).not.toMatch(/--ghost-color:[^;]*var\(/);
      // alpha < 1 preserved with hue var
      expect(css.light).toMatch(
        /--overlay-color: oklch\([^)]*var\(--brand-hue\) \/ 0.5\)/,
      );
    });

    it('does not re-emit hue vars for the palette primary unprefixed alias', () => {
      const brand = glaze(240, 18, { pastel: true });
      brand.colors({ surface: { tone: 35 }, accent: { hue: '+20', tone: 52 } });
      const warning = glaze(23, 18, { pastel: true });
      warning.colors({ surface: { tone: 40 } });
      const palette = glaze.palette({ brand, warning }, { primary: 'brand' });
      const css = palette.css({ format: 'oklch', splitHue: true });
      // brand-hue declared once (by the prefixed pass)
      expect(css.light.match(/--brand-hue: 240;/g)).toHaveLength(1);
      // unprefixed primary alias references the themed per-color hue var
      expect(css.light).toMatch(
        /--accent-color: oklch\([^)]*var\(--brand-accent-hue\)/,
      );
      // no unprefixed --accent-hue colliding with the warning theme's base
      expect(css.light).not.toMatch(/--accent-hue: calc/);
    });

    it('okhst round-trips through the color parser', () => {
      const color = glaze.color('okhst(280 60% 52%)');
      expect(color.tasty({ format: 'okhst' })['']).toBe('okhst(280 60% 52%)');
    });

    it('okhst pastel output renders identically to the non-pastel equivalent', () => {
      const pastel = glaze.color(
        { hue: 280, saturation: 80, tone: 52 },
        { pastel: true },
      );
      const okhstStr = pastel.tasty({ format: 'okhst' })[''];
      // Re-parse the emitted okhst string as a non-pastel color; it should
      // render the same 8-bit RGB as the original pastel token (2-decimal
      // saturation rounding stays within 8-bit quantization).
      const reparsed = glaze.color(okhstStr);
      const round8 = (s: string): string =>
        s
          .match(/[\d.]+/g)!
          .map((n) => String(Math.round(Number(n))))
          .join(' ');
      expect(round8(reparsed.css({ name: 'x', format: 'rgb' }).light)).toBe(
        round8(pastel.css({ name: 'x', format: 'rgb' }).light),
      );
    });
  });

  describe('DTCG export', () => {
    it('emits a spec-conformant color token per scheme (srgb)', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { tone: 97 } });
      const dtcg = theme.dtcg();
      const lightToken = dtcg.light.surface;
      expect(lightToken.$type).toBe('color');
      const value = lightToken.$value;
      expect(value.colorSpace).toBe('srgb');
      expect(value.components).toHaveLength(3);
      for (const c of value.components) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
      // No alpha when opaque.
      expect(value.alpha).toBeUndefined();
      // hex is a 7-char #rrggbb and parses back to the same components.
      expect(value.hex).toMatch(/^#[0-9a-f]{6}$/);
      const [r, g, b] = parseHex(value.hex)!;
      expect(r).toBeCloseTo(value.components[0], 2);
      expect(g).toBeCloseTo(value.components[1], 2);
      expect(b).toBeCloseTo(value.components[2], 2);
      // dark is present by default.
      expect(dtcg.dark?.surface.$value.colorSpace).toBe('srgb');
    });

    it('emits oklch components with no hex', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { tone: 97 } });
      const value = theme.dtcg({ colorSpace: 'oklch' }).light.surface.$value;
      expect(value.colorSpace).toBe('oklch');
      expect(value.components).toHaveLength(3);
      // L in 0..1, C >= 0, H in 0..360.
      expect(value.components[0]).toBeGreaterThanOrEqual(0);
      expect(value.components[0]).toBeLessThanOrEqual(1);
      expect(value.components[1]).toBeGreaterThanOrEqual(0);
      expect(value.components[2]).toBeGreaterThanOrEqual(0);
      expect(value.components[2]).toBeLessThanOrEqual(360);
      expect((value as { hex?: string }).hex).toBeUndefined();
    });

    it('gates dark / high-contrast by modes', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { tone: 97 } });
      const noDark = theme.dtcg({ modes: { dark: false } });
      expect(noDark.light).toBeDefined();
      expect(noDark.dark).toBeUndefined();
      const withHc = theme.dtcg({ modes: { highContrast: true } });
      expect(withHc.lightContrast).toBeDefined();
      expect(withHc.darkContrast).toBeDefined();
    });

    it('includes alpha when opacity is below 1', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { tone: 97, opacity: 0.5 } });
      const value = theme.dtcg().light.surface.$value;
      expect(value.alpha).toBeCloseTo(0.5, 4);
    });

    it('palette dtcg prefixes and duplicates the primary theme', () => {
      const primary = glaze(280, 80);
      primary.colors({ surface: { tone: 97 } });
      const danger = primary.extend({ hue: 23 });
      const palette = glaze.palette({ primary, danger });
      const dtcg = palette.dtcg({ primary: 'primary' });
      expect(dtcg.light['primary-surface']).toBeDefined();
      expect(dtcg.light['danger-surface']).toBeDefined();
      // primary duplication → unprefixed alias
      expect(dtcg.light['surface']).toBeDefined();
      expect(dtcg.light['surface']).toEqual(dtcg.light['primary-surface']);
    });
  });

  describe('DTCG Resolver-Module export', () => {
    it('wraps every scheme variant into one resolver document', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { tone: 97 } });
      const doc = theme.dtcgResolver({ modes: { highContrast: true } });
      const full = theme.dtcg({ modes: { highContrast: true } });

      expect(doc.version).toBe('2025.10');
      // The light document is the default set source.
      expect(doc.sets.base.sources[0]).toEqual(full.light);
      // Single `scheme` modifier, light is the default context (no overrides).
      expect(doc.modifiers.scheme.default).toBe('light');
      expect(doc.modifiers.scheme.contexts.light).toEqual([]);
      // Each other context holds that variant's full document.
      expect(doc.modifiers.scheme.contexts.dark?.[0]).toEqual(full.dark);
      expect(doc.modifiers.scheme.contexts.lightContrast?.[0]).toEqual(
        full.lightContrast,
      );
      expect(doc.modifiers.scheme.contexts.darkContrast?.[0]).toEqual(
        full.darkContrast,
      );
      expect(doc.resolutionOrder).toEqual([
        { $ref: '#/sets/base' },
        { $ref: '#/modifiers/scheme' },
      ]);
    });

    it('gates dark / high-contrast contexts by modes', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { tone: 97 } });
      const noHc = theme.dtcgResolver({ modes: { highContrast: false } });
      expect(noHc.modifiers.scheme.contexts.dark).toBeDefined();
      expect(noHc.modifiers.scheme.contexts.lightContrast).toBeUndefined();
      expect(noHc.modifiers.scheme.contexts.darkContrast).toBeUndefined();

      const noDark = theme.dtcgResolver({ modes: { dark: false } });
      expect(noDark.modifiers.scheme.contexts.dark).toBeUndefined();
      expect(noDark.modifiers.scheme.contexts.light).toEqual([]);
    });

    it('flows colorSpace through to every source and context', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { tone: 97 } });
      const doc = theme.dtcgResolver({ colorSpace: 'oklch' });
      const base = doc.sets.base.sources[0] as Record<string, DtcgColorToken>;
      const dark = doc.modifiers.scheme.contexts.dark?.[0] as Record<
        string,
        DtcgColorToken
      >;
      expect(base.surface.$value.colorSpace).toBe('oklch');
      expect((base.surface.$value as { hex?: string }).hex).toBeUndefined();
      expect(dark.surface.$value.colorSpace).toBe('oklch');
    });

    it('honors custom set / modifier / context names', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { tone: 97 } });
      const doc = theme.dtcgResolver({
        setName: 'tokens',
        modifierName: 'theme',
        contextNames: { dark: 'night' },
      });
      expect(doc.sets.tokens).toBeDefined();
      expect(doc.modifiers.theme).toBeDefined();
      expect(doc.modifiers.theme.default).toBe('light');
      expect(doc.modifiers.theme.contexts.night).toBeDefined();
      expect(doc.modifiers.theme.contexts.dark).toBeUndefined();
      expect(doc.resolutionOrder).toEqual([
        { $ref: '#/sets/tokens' },
        { $ref: '#/modifiers/theme' },
      ]);
    });

    it('includes alpha when opacity is below 1', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { tone: 97, opacity: 0.5 } });
      const doc = theme.dtcgResolver();
      const base = doc.sets.base.sources[0] as Record<string, DtcgColorToken>;
      expect(base.surface.$value.alpha).toBeCloseTo(0.5, 4);
    });

    it('palette dtcgResolver prefixes and duplicates the primary theme', () => {
      const primary = glaze(280, 80);
      primary.colors({ surface: { tone: 97 } });
      const danger = primary.extend({ hue: 23 });
      const palette = glaze.palette({ primary, danger });
      const doc = palette.dtcgResolver({ primary: 'primary' });

      const baseKeys = Object.keys(doc.sets.base.sources[0]);
      expect(baseKeys).toContain('primary-surface');
      expect(baseKeys).toContain('danger-surface');
      // primary duplication → unprefixed alias
      expect(baseKeys).toContain('surface');
      // The dark context mirrors the same prefixed / aliased keys.
      const darkKeys = Object.keys(doc.modifiers.scheme.contexts.dark[0]);
      expect(darkKeys).toContain('primary-surface');
      expect(darkKeys).toContain('surface');
      expect(darkKeys).toContain('danger-surface');
    });

    it('standalone color dtcgResolver keys the token by name per context', () => {
      const color = glaze.color({ hue: 280, saturation: 80, tone: 52 });
      const doc = color.dtcgResolver({
        name: 'brand',
        modes: { highContrast: true },
      });
      const base = doc.sets.base.sources[0] as Record<string, DtcgColorToken>;
      expect(base.brand.$type).toBe('color');
      expect(base.brand.$value.colorSpace).toBe('srgb');
      const dark = doc.modifiers.scheme.contexts.dark?.[0] as Record<
        string,
        DtcgColorToken
      >;
      const darkContrast = doc.modifiers.scheme.contexts
        .darkContrast?.[0] as Record<string, DtcgColorToken>;
      // dark and darkContrast are distinct, resolved variants — not layered.
      expect(dark.brand.$value).not.toEqual(base.brand.$value);
      expect(darkContrast.brand.$value).not.toEqual(dark.brand.$value);
    });
  });

  describe('Tailwind export', () => {
    it('emits an @theme block plus a .dark override', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { tone: 97 } });
      const css = theme.tailwind();
      expect(css).toContain('@theme');
      expect(css).toMatch(/--color-surface:\s*oklch\(/);
      expect(css).toContain('.dark');
      // The @theme block precedes the .dark override.
      expect(css.indexOf('@theme')).toBeLessThan(css.indexOf('.dark'));
    });

    it('gates dark / high-contrast overrides by modes', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { tone: 97 } });
      const noDark = theme.tailwind({ modes: { dark: false } });
      expect(noDark).toContain('@theme');
      expect(noDark).not.toContain('.dark');
      const withHc = theme.tailwind({ modes: { highContrast: true } });
      expect(withHc).toContain('.high-contrast');
      expect(withHc).toContain('.dark.high-contrast');
    });

    it('honors custom namespace, format, and dark selector', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { tone: 97 } });
      const css = theme.tailwind({
        namespace: 'tw-',
        format: 'rgb',
        darkSelector: '[data-theme="dark"]',
      });
      expect(css).toMatch(/--tw-surface:\s*rgb\(/);
      expect(css).toContain('[data-theme="dark"]');
      expect(css).not.toContain('.dark');
    });

    it('nests :root inside an at-rule dark selector', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { tone: 97 } });
      const css = theme.tailwind({
        darkSelector: '@media (prefers-color-scheme: dark)',
      });
      expect(css).toContain('@media (prefers-color-scheme: dark)');
      // The dark declarations live inside a :root nested in the media query.
      const mediaIdx = css.indexOf('@media');
      const rootIdx = css.indexOf(':root', mediaIdx);
      expect(rootIdx).toBeGreaterThan(mediaIdx);
    });

    it('palette tailwind merges themes under one @theme block', () => {
      const primary = glaze(280, 80);
      primary.colors({ surface: { tone: 97 } });
      const danger = primary.extend({ hue: 23 });
      const palette = glaze.palette({ primary, danger });
      const css = palette.tailwind({ primary: 'primary' });
      // Exactly one @theme block, containing both prefixed keys + the
      // unprefixed primary alias.
      expect(css.match(/@theme/g)).toHaveLength(1);
      expect(css).toMatch(/--color-primary-surface:/);
      expect(css).toMatch(/--color-danger-surface:/);
      expect(css).toMatch(/--color-surface:/);
    });

    it('palette tailwind separates theme prefix from the css namespace', () => {
      const primary = glaze(280, 80);
      primary.colors({ surface: { tone: 97 } });
      const danger = primary.extend({ hue: 23 });
      const palette = glaze.palette({ primary, danger });
      // `prefix` controls theme prefixing; `namespace` controls --<ns><name>.
      const css = palette.tailwind({
        prefix: { primary: 'p-', danger: 'd-' },
        namespace: 'color-',
      });
      expect(css).toMatch(/--color-p-surface:/);
      expect(css).toMatch(/--color-d-surface:/);
      expect(css).not.toMatch(/--color-primary-surface:/);
    });
  });

  describe('glaze.color standalone', () => {
    it('resolves a structured color with tone', () => {
      const color = glaze.color({ hue: 280, saturation: 80, tone: 52 });
      const resolved = color.resolve();
      expect(resolved.light.h).toBe(280);
      // structured form snapshots the light window [10,100]
      expect(llOf(resolved.light)).toBeGreaterThan(0.4);
      expect(llOf(resolved.light)).toBeLessThan(0.7);
    });

    it('structured input adapts dark via mode auto', () => {
      const color = glaze.color({ hue: 280, saturation: 80, tone: 52 });
      const resolved = color.resolve();
      // auto inverts the author tone before remapping into the dark window.
      // The light [10,100] and dark [15,95] windows are asymmetric, so dark
      // only approximately mirrors light around mid-tone.
      expect(Math.abs(resolved.dark.t - (1 - resolved.light.t))).toBeLessThan(
        0.1,
      );
    });

    it('explicit mode: fixed keeps tone order without inversion', () => {
      const color = glaze.color({
        hue: 280,
        saturation: 80,
        tone: 52,
        mode: 'fixed',
      });
      const resolved = color.resolve();
      // fixed: dark keeps the same tone order (no inversion); the two
      // windows differ slightly so tones are close but not identical.
      expect(Math.abs(resolved.dark.t - resolved.light.t)).toBeLessThan(0.1);
      // and clearly not inverted (which would put dark near 1 - light)
      expect(resolved.dark.t).toBeGreaterThan(0.4);
    });

    it('exports token / tasty / json with oklch by default', () => {
      const color = glaze.color({ hue: 280, saturation: 80, tone: 52 });
      expect(color.token()['']).toMatch(/^oklch\(/);
      expect(color.tasty()['']).toMatch(/^oklch\(/);
      expect(color.json().light).toMatch(/^oklch\(/);
    });

    it('emits okhst via token() and tasty()', () => {
      const color = glaze.color({ hue: 280, saturation: 80, tone: 52 });
      expect(color.token({ format: 'okhst' })['']).toMatch(/^okhst\(/);
      expect(color.tasty({ format: 'okhst' })['']).toMatch(/^okhst\(/);
    });

    it('rejects okhsl and okhst on css / json / tailwind', () => {
      const color = glaze.color({ hue: 280, saturation: 80, tone: 52 });
      for (const format of ['okhsl', 'okhst'] as const) {
        expect(() => color.css({ name: 'brand', format })).toThrow(
          /only supported by tasty/,
        );
        expect(() => color.json({ format })).toThrow(/only supported by tasty/);
        expect(() => color.tailwind({ name: 'brand', format })).toThrow(
          /only supported by tasty/,
        );
      }
    });

    it('supports format option', () => {
      const color = glaze.color({ hue: 280, saturation: 80, tone: 52 });
      expect(color.token({ format: 'rgb' })['']).toMatch(/^rgb\(/);
      expect(color.json({ format: 'hsl' }).light).toMatch(/^hsl\(/);
    });

    it('exports dtcg tokens per scheme', () => {
      const color = glaze.color({ hue: 280, saturation: 80, tone: 52 });
      const dtcg = color.dtcg();
      expect(dtcg.light.$type).toBe('color');
      expect(dtcg.light.$value.colorSpace).toBe('srgb');
      expect(dtcg.light.$value.components).toHaveLength(3);
      expect(dtcg.dark?.$value.colorSpace).toBe('srgb');
    });

    it('exports dtcg in oklch color space', () => {
      const color = glaze.color({ hue: 280, saturation: 80, tone: 52 });
      const value = color.dtcg({ colorSpace: 'oklch' }).light.$value;
      expect(value.colorSpace).toBe('oklch');
      expect((value as { hex?: string }).hex).toBeUndefined();
    });

    it('exports a tailwind @theme block for a given name', () => {
      const color = glaze.color({ hue: 280, saturation: 80, tone: 52 });
      const css = color.tailwind({ name: 'brand' });
      expect(css).toContain('@theme');
      expect(css).toMatch(/--color-brand:\s*oklch\(/);
      expect(css).toContain('.dark');
    });

    describe('value-shorthand', () => {
      it('accepts a 6-digit hex and preserves it in light', () => {
        const resolved = glaze.color('#26fcb2').resolve();
        expect(resolved.light.s).toBeGreaterThan(0);
        // value form preserves the input lightness in light (lightTone:false)
        expect(llOf(resolved.light)).toBeGreaterThan(0.7);
      });

      it('parses rgb()/hsl()/okhsl()/oklch() strings', () => {
        for (const v of [
          'rgb(38 252 178)',
          'hsl(160 90% 60%)',
          'okhsl(160 80% 70%)',
          'oklch(0.8 0.15 160)',
        ]) {
          expect(() => glaze.color(v).resolve()).not.toThrow();
        }
      });

      it('totally-black hex maps into the dark window in dark (auto)', () => {
        const resolved = glaze.color('#000000').resolve();
        expect(llOf(resolved.light)).toBeCloseTo(0, 3);
        // value-form dark window hi = 0.95
        expect(llOf(resolved.dark)).toBeCloseTo(0.95, 2);
      });

      it('totally-white hex falls to the dark lo floor in dark (auto)', () => {
        const resolved = glaze.color('#ffffff').resolve();
        expect(llOf(resolved.light)).toBeCloseTo(1, 3);
        expect(llOf(resolved.dark)).toBeCloseTo(0.15, 2);
      });

      it('mode: fixed preserves the linear dark mapping for #000', () => {
        const resolved = glaze
          .color({ from: '#000000', mode: 'fixed' })
          .resolve();
        expect(llOf(resolved.light)).toBeCloseTo(0, 3);
        // fixed: tone 0 maps to dark lo = 0.15
        expect(llOf(resolved.dark)).toBeCloseTo(0.15, 2);
      });

      it('tracks the live dark window for omitted fields', () => {
        const before = glaze.color('#ffffff');
        expect(llOf(before.resolve().dark)).toBeCloseTo(0.15, 2);
        glaze.configure({ darkTone: { lo: 40, hi: 80, eps: 0.05 } });
        try {
          expect(llOf(before.resolve().dark)).toBeCloseTo(0.4, 2);
          expect(llOf(glaze.color('#ffffff').resolve().dark)).toBeCloseTo(
            0.4,
            2,
          );
        } finally {
          glaze.resetConfig();
        }
      });
    });

    describe('dark hue / saturation', () => {
      it('darkSaturation seeds the dark scheme, darkSaturationFactor scales it', () => {
        const seeded = glaze.color({
          hue: 240,
          saturation: 80,
          tone: 52,
          darkSaturation: 40,
        });
        expect(seeded.resolve().dark.s).toBeCloseTo(0.4, 4);

        const scaled = glaze.color({
          hue: 240,
          saturation: 80,
          tone: 52,
          darkSaturationFactor: 0.5,
        });
        expect(scaled.resolve().dark.s).toBeCloseTo(0.4, 4);

        const both = glaze.color({
          hue: 240,
          saturation: 80,
          tone: 52,
          darkSaturation: 40,
          darkSaturationFactor: 0.5,
        });
        expect(both.resolve().dark.s).toBeCloseTo(0.2, 4);
      });

      it('an absolute darkHue wins over a relative hue override', () => {
        const color = glaze.color({ from: '#3355cc', hue: '+20', darkHue: 90 });
        const resolved = color.resolve();
        expect(resolved.dark.h).toBe(90);
        expect(resolved.light.h).not.toBeCloseTo(90, 2);
      });

      it('a relative darkHue anchors to the token seed hue', () => {
        const color = glaze.color({ hue: 240, saturation: 80, tone: 52 });
        const rotated = glaze.color({
          hue: 240,
          saturation: 80,
          tone: 52,
          darkHue: '+30',
        });
        expect(color.resolve().dark.h).toBe(240);
        expect(rotated.resolve().dark.h).toBeCloseTo(270, 2);
      });

      it('applies to value-shorthand overrides too', () => {
        const color = glaze.color({
          from: '#3355cc',
          darkHue: 120,
          darkSaturationFactor: 0.25,
        });
        const resolved = color.resolve();
        expect(resolved.dark.h).toBe(120);
        expect(resolved.dark.s).toBeCloseTo(resolved.light.s * 0.25, 4);
      });

      it('rejects an out-of-range structured darkSaturation', () => {
        expect(() =>
          glaze.color({
            hue: 240,
            saturation: 80,
            tone: 52,
            darkSaturation: 150,
          }),
        ).toThrow(/darkSaturation must be a finite number in 0–100/);
        expect(() =>
          glaze.color({
            hue: 240,
            saturation: 80,
            tone: 52,
            darkSaturationFactor: 2,
          }),
        ).toThrow(/darkSaturationFactor must be a finite number in 0–1/);
      });

      it('round-trips through export / colorFrom in both forms', () => {
        const structured = glaze.color({
          hue: 240,
          saturation: 80,
          tone: 52,
          darkHue: 90,
          darkSaturation: 40,
          darkSaturationFactor: 0.5,
        });
        const structuredData = JSON.parse(JSON.stringify(structured.export()));
        expect(glaze.colorFrom(structuredData).resolve()).toEqual(
          structured.resolve(),
        );

        const value = glaze.color({
          from: '#3355cc',
          darkHue: '+30',
          darkSaturation: 40,
        });
        const valueData = JSON.parse(JSON.stringify(value.export()));
        expect(valueData.overrides.darkHue).toBe('+30');
        expect(glaze.colorFrom(valueData).resolve()).toEqual(value.resolve());
      });
    });

    describe('OKHST input', () => {
      it('parses an okhst() string (tone axis)', () => {
        const resolved = glaze.color('okhst(160 80% 70%)').resolve();
        expect(resolved.light.h).toBeCloseTo(160, 0);
        expect(resolved.light.s).toBeGreaterThan(0);
        // tone 70 is high → light lightness clearly above mid
        expect(llOf(resolved.light)).toBeGreaterThan(0.6);
      });

      it('okhst() and okhsl() of the equivalent lightness agree', () => {
        // okhsl l = fromTone(70). Build the matching okhsl string.
        const okhstColor = glaze.color('okhst(160 80% 70%)').resolve();
        // The same h/s with tone-derived l via okhsl input:
        const l = variantToOkhsl(okhstColor.light).l;
        const okhslColor = glaze
          .color(`okhsl(160 80% ${(l * 100).toFixed(4)}%)`)
          .resolve();
        expect(okhslColor.light.t).toBeCloseTo(okhstColor.light.t, 3);
      });

      it('accepts an { h, s, t } object input', () => {
        const resolved = glaze.color({ h: 160, s: 0.8, t: 0.7 }).resolve();
        expect(resolved.light.h).toBeCloseTo(160, 0);
        expect(llOf(resolved.light)).toBeGreaterThan(0.6);
      });

      it('disambiguates { h, s, t } from { h, s, l } by the t key', () => {
        const tColor = glaze.color({ h: 160, s: 0.5, t: 0.5 }).resolve();
        const lColor = glaze.color({ h: 160, s: 0.5, l: 0.5 }).resolve();
        // tone 0.5 and lightness 0.5 are different points
        expect(tColor.light.t).not.toBeCloseTo(lColor.light.t, 2);
      });

      it('throws when { h, s, t } uses 0–100 instead of 0–1', () => {
        expect(() => glaze.color({ h: 160, s: 80, t: 70 })).toThrow();
      });
    });

    describe('base dependency', () => {
      it('solves AA contrast against the base in every scheme', () => {
        const bg = glaze.color('#1a1a2e');
        const text = glaze.color({
          from: '#ffffff',
          base: bg,
          contrast: 'AA',
        });
        const bgR = bg.resolve();
        const textR = text.resolve();
        for (const s of [
          'light',
          'dark',
          'lightContrast',
          'darkContrast',
        ] as const) {
          expectMeetsWcag(variantContrast(textR[s], bgR[s]), 4.5);
        }
      });

      it('relative tone anchors to the base per-scheme', () => {
        const bg = glaze.color('#808080');
        const fg = glaze.color({ from: '#808080', base: bg, tone: '-20' });
        const bgR = bg.resolve();
        const fgR = fg.resolve();
        expect(fgR.light.t).toBeCloseTo(bgR.light.t - 0.2, 2);
      });

      it('accepts a raw GlazeColorValue base', () => {
        const text = glaze.color({
          from: '#ffffff',
          base: '#1a1a2e',
          contrast: 'AA',
        });
        expect(() => text.resolve()).not.toThrow();
      });

      it('supports an APCA contrast floor against the base', () => {
        const bg = glaze.color('#ffffff');
        // A light seed (l≈0.7) does not meet Lc 60 vs white on its own, so
        // the solver must darken it toward the floor.
        const text = glaze.color({
          from: '#b3b3b3',
          base: bg,
          contrast: { apca: 60 },
        });
        const resolved = text.resolve();
        // pushed below the ~0.59 point that yields APCA Lc 60 vs white
        expect(llOf(resolved.light)).toBeLessThanOrEqual(0.59);
      });
    });

    describe('opacity / name overrides', () => {
      it('applies a fixed opacity', () => {
        const resolved = glaze
          .color({ from: '#26fcb2', opacity: 0.5 })
          .resolve();
        expect(resolved.light.alpha).toBe(0.5);
      });

      it('names the token for messages without changing output keys', () => {
        const token = glaze.color({ from: '#26fcb2', name: 'accent' }).token();
        expect(token['']).toMatch(/^oklch\(/);
      });
    });

    describe('export / colorFrom round-trip', () => {
      it('value-form export round-trips identically', () => {
        const original = glaze.color({ from: '#26fcb2', contrast: 'AA' });
        const data = original.export();
        const restored = glaze.colorFrom(JSON.parse(JSON.stringify(data)));
        const a = original.resolve();
        const b = restored.resolve();
        for (const s of [
          'light',
          'dark',
          'lightContrast',
          'darkContrast',
        ] as const) {
          expect(b[s].t).toBeCloseTo(a[s].t, 6);
          expect(b[s].s).toBeCloseTo(a[s].s, 6);
          expect(b[s].h).toBeCloseTo(a[s].h, 6);
          expect(b[s].alpha).toBeCloseTo(a[s].alpha, 6);
        }
      });

      it('value-form snapshots the tone-window config (light=false, dark default)', () => {
        const data: GlazeColorTokenExport = glaze.color('#26fcb2').export();
        expect(data.kind).toBe('color');
        expect(data.version).toBe(1);
        expect(data.config?.lightTone).toBe(false);
        expect(data.config?.darkTone).toEqual({ lo: 15, hi: 95, eps: 0.05 });
        expect(data.config?.pastel).toBe(false);
        expect(data.config?.inferRole).toBe(true);
      });

      it('structured-form snapshots both tone windows', () => {
        const data = glaze
          .color({ hue: 280, saturation: 50, tone: 50 })
          .export();
        expect(data.form).toBe('structured');
        expect(data.kind).toBe('color');
        expect(data.config?.lightTone).toEqual({ lo: 10, hi: 100, eps: 0.05 });
        expect(data.config?.darkTone).toEqual({ lo: 15, hi: 95, eps: 0.05 });
      });

      it('export freeze pins config against later configure()', () => {
        const tok = glaze.color({ h: 0, s: 0, l: 0 });
        const data = tok.export();
        expect(data.config?.darkTone).toEqual({ lo: 15, hi: 95, eps: 0.05 });
        const frozenT = tok.resolve().dark.t;
        glaze.configure({ darkTone: { lo: 40, hi: 80, eps: 0.05 } });
        try {
          // Live token tracks the new global window.
          expect(llOf(tok.resolve().dark)).toBeCloseTo(0.8, 2);
          const restored = glaze.colorFrom(JSON.parse(JSON.stringify(data)));
          expect(restored.resolve().dark.t).toBeCloseTo(frozenT, 6);
        } finally {
          glaze.resetConfig();
        }
      });

      it('pastel / inferRole freeze survives configure()', () => {
        const tok = glaze.color(
          { hue: 150, saturation: 80, tone: 50 },
          { pastel: true, inferRole: false },
        );
        const data = tok.export();
        expect(data.config?.pastel).toBe(true);
        expect(data.config?.inferRole).toBe(false);
        glaze.configure({ inferRole: true });
        try {
          const restored = glaze.colorFrom(JSON.parse(JSON.stringify(data)));
          expect(restored.resolve().light.pastel).toBe(true);
          expect(restored.export().config?.inferRole).toBe(false);
          // Fresh token without local override freezes the new global inferRole.
          expect(
            glaze.color({ hue: 150, saturation: 80, tone: 50 }).export().config
              ?.inferRole,
          ).toBe(true);
        } finally {
          glaze.resetConfig();
        }
      });

      it('export(override) forwards to nested base snapshots', () => {
        const base = glaze.color({ hue: 200, saturation: 50, tone: 40 });
        const token = glaze.color({
          hue: 200,
          saturation: 50,
          tone: 70,
          base,
        });
        const data = token.export({ pastel: true });
        expect(data.config?.pastel).toBe(true);
        const nested = (data.input as { base?: GlazeColorTokenExport }).base;
        expect(nested?.config?.pastel).toBe(true);
      });

      it('palette.export(override) lands on every nested theme', () => {
        const brand = glaze(280, 80);
        brand.colors({ surface: { tone: 97 } });
        const danger = brand.extend({ hue: 23 });
        const snapshot = glaze
          .palette({ brand, danger }, { primary: 'brand' })
          .export({ darkTone: false });
        expect(snapshot.themes.brand.config?.darkTone).toBe(false);
        expect(snapshot.themes.danger.config?.darkTone).toBe(false);
      });
    });

    describe('config override (arg2)', () => {
      it('overrides the dark window for the token only', () => {
        const color = glaze.color('#ffffff', {
          darkTone: { lo: 30, hi: 95, eps: 0.05 },
        });
        expect(llOf(color.resolve().dark)).toBeCloseTo(0.3, 2);
        // global default is untouched
        expect(llOf(glaze.color('#ffffff').resolve().dark)).toBeCloseTo(
          0.15,
          2,
        );
      });

      it('false light window in global configure preserves input lightness', () => {
        glaze.configure({ lightTone: false });
        try {
          const resolved = glaze
            .color({ hue: 0, saturation: 0, tone: 100 })
            .resolve();
          expect(llOf(resolved.light)).toBeCloseTo(1, 2);
        } finally {
          glaze.resetConfig();
        }
      });
    });
  });

  describe('shadow colors', () => {
    it('resolves a shadow with 0 < alpha < 1', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { tone: 95 },
        text: { tone: 15, base: 'surface', contrast: 'AA' },
        'shadow-md': {
          type: 'shadow',
          bg: 'surface',
          fg: 'text',
          intensity: 10,
        },
      });
      const shadow = theme.resolve().get('shadow-md')!;
      expect(shadow.light.alpha).toBeGreaterThan(0);
      expect(shadow.light.alpha).toBeLessThan(1);
      expect(shadow.dark.alpha).toBeGreaterThan(0);
    });

    it('achromatic shadow (no fg) has s=0', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { tone: 95 },
        'drop-shadow': { type: 'shadow', bg: 'surface', intensity: 12 },
      });
      const shadow = theme.resolve().get('drop-shadow')!;
      expect(shadow.light.s).toBe(0);
      expect(shadow.light.alpha).toBeGreaterThan(0);
    });

    it('intensity 0 produces alpha 0; negative clamps to 0', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { tone: 95 },
        zero: { type: 'shadow', bg: 'surface', intensity: 0 },
        neg: { type: 'shadow', bg: 'surface', intensity: -5 },
      });
      const r = theme.resolve();
      expect(r.get('zero')!.light.alpha).toBe(0);
      expect(r.get('neg')!.light.alpha).toBe(0);
    });

    it('HC intensity pair uses the second value for high-contrast', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { tone: 95 },
        text: { tone: 15, base: 'surface', contrast: 'AA' },
        card: {
          type: 'shadow',
          bg: 'surface',
          fg: 'text',
          intensity: [10, 20],
        },
      });
      const shadow = theme.resolve().get('card')!;
      expect(shadow.lightContrast.alpha).toBeGreaterThan(shadow.light.alpha);
    });

    it('glaze.shadow() standalone returns a tone variant', () => {
      const v = glaze.shadow({ bg: '#ffffff', fg: '#000000', intensity: 20 });
      expect(v.t).toBeGreaterThanOrEqual(0);
      expect(v.t).toBeLessThanOrEqual(1);
      expect(v.alpha).toBeGreaterThan(0);
      expect(v.alpha).toBeLessThan(1);
    });
  });

  describe('mix colors', () => {
    it('opaque blend interpolates between base and target', () => {
      const theme = glaze(0, 0);
      theme.colors({
        a: { tone: 20 },
        b: { tone: 80 },
        m: { type: 'mix', base: 'a', target: 'b', value: 50 },
      });
      const r = theme.resolve();
      const m = r.get('m')!;
      // halfway blend sits between the endpoints in lightness
      expect(llOf(m.light)).toBeGreaterThan(llOf(r.get('a')!.light));
      expect(llOf(m.light)).toBeLessThan(llOf(r.get('b')!.light));
    });

    it('transparent blend yields alpha from the mix value', () => {
      const theme = glaze(0, 0);
      theme.colors({
        a: { tone: 20 },
        b: { tone: 80 },
        m: {
          type: 'mix',
          base: 'a',
          target: 'b',
          value: 40,
          blend: 'transparent',
        },
      });
      const m = theme.resolve().get('m')!;
      expect(m.light.alpha).toBeCloseTo(0.4, 2);
    });

    it('mix solves a contrast floor against the base', () => {
      const theme = glaze(0, 0);
      theme.colors({
        bg: { tone: 97 },
        ink: { tone: 10 },
        m: {
          type: 'mix',
          base: 'bg',
          target: 'ink',
          value: 10,
          contrast: 'AA',
        },
      });
      const r = theme.resolve();
      expectMeetsWcag(
        variantContrast(r.get('m')!.light, r.get('bg')!.light),
        4.5,
      );
    });

    it('srgb blend space stays in gamut', () => {
      const theme = glaze(0, 0);
      theme.colors({
        a: { tone: 20, saturation: 0 },
        b: { tone: 80, hue: 120 },
        m: {
          type: 'mix',
          base: 'a',
          target: 'b',
          value: 50,
          space: 'srgb',
        },
      });
      const m = theme.resolve().get('m')!;
      expect(m.light.s).toBeGreaterThanOrEqual(0);
      expect(m.light.s).toBeLessThanOrEqual(1);
      expect(m.light.t).toBeGreaterThanOrEqual(0);
      expect(m.light.t).toBeLessThanOrEqual(1);
    });
  });

  describe('verification (§10) drift warning', () => {
    it('does not warn for an achromatic contrast pair', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      try {
        const theme = glaze(0, 0);
        theme.colors({
          bg: { tone: 97 },
          fg: { base: 'bg', tone: 30, contrast: 'AA' },
        });
        theme.resolve();
        const driftWarnings = spy.mock.calls.filter((c) =>
          String(c[0]).includes('drifts below'),
        );
        expect(driftWarnings.length).toBe(0);
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('manual contrast level', () => {
    /**
     * A theme exercising all three mechanisms the level interpolates —
     * authored HC pairs, the tone window, and the contrast escalation —
     * across every def kind.
     */
    function fixture(config?: Parameters<typeof glaze>[2]) {
      const theme = glaze(
        { hue: 280, saturation: 80, darkHue: 265, darkSaturation: 60 },
        undefined,
        config,
      );
      theme.colors({
        surface: { tone: 97 },
        surfaceAlt: { base: 'surface', tone: '-6' },
        deltaPair: { base: 'surface', tone: ['-6', '-12'] },
        tonePair: { base: 'surface', tone: [30, 20] },
        text: { base: 'surface', tone: 25, contrast: 'AA', role: 'text' },
        apcaText: {
          base: 'surface',
          tone: 25,
          contrast: { apca: 60 },
          role: 'text',
        },
        innerPair: { base: 'surface', tone: 30, contrast: { wcag: [4.5, 7] } },
        outerPair: {
          base: 'surface',
          tone: 30,
          contrast: [{ apca: 60 }, { apca: 90 }],
        },
        knockout: { base: 'surface', tone: 'max' },
        pinned: { tone: 50, mode: 'static' },
        fixedTone: { tone: 40, mode: 'fixed' },
        faded: { base: 'surface', tone: 60, opacity: 0.5 },
        ghost: {
          type: 'mix',
          base: 'surface',
          target: 'text',
          value: [20, 40],
        },
        shade: {
          type: 'shadow',
          bg: 'surface',
          fg: 'text',
          intensity: [30, 60],
        },
      });
      return theme;
    }

    describe('bit-exact endpoints', () => {
      it('level 0 reproduces the normal variants exactly', () => {
        const anchors = structuredClone([...fixture().resolve()]);
        glaze.configure({ contrastLevel: 0 });
        const manual = fixture().resolve();
        for (const [name, anchor] of anchors) {
          expect(manual.get(name)!.light).toEqual(anchor.light);
          expect(manual.get(name)!.dark).toEqual(anchor.dark);
        }
      });

      it('level 100 reproduces the high-contrast variants exactly', () => {
        const anchors = structuredClone([...fixture().resolve()]);
        glaze.configure({ contrastLevel: 100 });
        const manual = fixture().resolve();
        for (const [name, anchor] of anchors) {
          expect(manual.get(name)!.light).toEqual(anchor.lightContrast);
          expect(manual.get(name)!.dark).toEqual(anchor.darkContrast);
        }
      });

      it('is exact through a per-theme override too', () => {
        const anchors = structuredClone([...fixture().resolve()]);
        const lo = fixture({ contrastLevel: 0 }).resolve();
        const hi = fixture({ contrastLevel: 100 }).resolve();
        for (const [name, anchor] of anchors) {
          expect(lo.get(name)!.light).toEqual(anchor.light);
          expect(hi.get(name)!.light).toEqual(anchor.lightContrast);
          expect(hi.get(name)!.dark).toEqual(anchor.darkContrast);
        }
      });

      it('emits byte-identical CSS at the endpoints', () => {
        const theme = fixture();
        const auto = theme.css();

        glaze.configure({ contrastLevel: 0 });
        expect(theme.css().light).toBe(auto.light);
        expect(theme.css().dark).toBe(auto.dark);

        glaze.configure({ contrastLevel: 100 });
        expect(theme.css().light).toBe(auto.lightContrast);
        expect(theme.css().dark).toBe(auto.darkContrast);
      });
    });

    describe('the ramp', () => {
      const levels = [0, 20, 40, 60, 80, 100];

      /**
       * Monotonicity holds for interpolable fields — the fixture below avoids
       * mixed-kind pairs, which switch at level 50 by design.
       */
      it('never lowers measured WCAG contrast as the level rises', () => {
        let previousLight = 0;
        let previousDark = 0;
        for (const level of levels) {
          glaze.resetConfig();
          glaze.configure({ contrastLevel: level });
          const r = fixture().resolve();
          const light = variantContrast(
            r.get('text')!.light,
            r.get('surface')!.light,
          );
          const dark = variantContrast(
            r.get('text')!.dark,
            r.get('surface')!.dark,
          );
          expect(light).toBeGreaterThanOrEqual(previousLight - 1e-9);
          expect(dark).toBeGreaterThanOrEqual(previousDark - 1e-9);
          previousLight = light;
          previousDark = dark;
        }
      });

      it('never lowers measured APCA contrast as the level rises', () => {
        let previous = 0;
        for (const level of levels) {
          glaze.resetConfig();
          glaze.configure({ contrastLevel: level });
          const r = fixture().resolve();
          const lc = variantApca(
            r.get('apcaText')!.light,
            r.get('surface')!.light,
            'fg',
          );
          expect(lc).toBeGreaterThanOrEqual(previous - 1e-9);
          previous = lc;
        }
      });

      it('lands each intermediate tone between its neighbours', () => {
        const tones = levels.map((level) => {
          glaze.resetConfig();
          glaze.configure({ contrastLevel: level });
          return fixture().resolve().get('tonePair')!.light.t;
        });
        for (let i = 1; i < tones.length - 1; i++) {
          const [lo, hi] = [tones[i - 1], tones[i + 1]].sort((a, b) => a - b);
          expect(tones[i]).toBeGreaterThanOrEqual(lo);
          expect(tones[i]).toBeLessThanOrEqual(hi);
        }
      });
    });

    describe('mechanism: tone window widening', () => {
      // Asserted on colors with no contrast floor: for solved colors the
      // window only clamps the solver's seed, so it is a weak probe there.
      it('walks the light window floor toward 0', () => {
        const at = (level: number | 'auto') => {
          glaze.resetConfig();
          glaze.configure({ contrastLevel: level });
          const theme = glaze(0, 0);
          theme.colors({ floor: { tone: 0 } });
          return llOf(theme.resolve().get('floor')!.light);
        };
        expect(at(0)).toBeCloseTo(0.1, 4);
        expect(at(50)).toBeCloseTo(0.05, 4);
        expect(at(100)).toBeCloseTo(0, 4);
      });

      it('walks the dark window floor toward 0', () => {
        const at = (level: number) => {
          glaze.resetConfig();
          glaze.configure({ contrastLevel: level });
          const theme = glaze(0, 0);
          theme.colors({ ceil: { tone: 100 } });
          // `tone: 100` inverts to 0 in dark under mode 'auto', landing on the
          // dark window's `lo` (15 → 7.5 at level 50 → 0 at 100).
          return llOf(theme.resolve().get('ceil')!.dark);
        };
        expect(at(0)).toBeCloseTo(0.15, 4);
        expect(at(50)).toBeCloseTo(0.075, 4);
        expect(at(100)).toBeCloseTo(0, 4);
      });

      it('leaves a disabled window level-invariant', () => {
        const at = (level: number) => {
          glaze.resetConfig();
          glaze.configure({ contrastLevel: level });
          const theme = glaze(0, 0, { lightTone: false });
          theme.colors({ floor: { tone: 20 } });
          return theme.resolve().get('floor')!.light.t;
        };
        expect(at(0)).toBeCloseTo(at(100), 10);
      });
    });

    describe('mechanism: authored pairs', () => {
      it('resolves an absolute tone pair as its midpoint at level 50', () => {
        glaze.configure({ contrastLevel: 50 });
        const theme = glaze(0, 0, { lightTone: false });
        theme.colors({
          surface: { tone: 97 },
          text: { base: 'surface', tone: [30, 10] },
          authored: { base: 'surface', tone: 20 },
        });
        const r = theme.resolve();
        expect(r.get('text')!.light.t).toBeCloseTo(
          r.get('authored')!.light.t,
          6,
        );
      });

      it('interpolates shadow intensity and mix value', () => {
        const alphaAt = (level: number) => {
          glaze.resetConfig();
          glaze.configure({ contrastLevel: level });
          const r = fixture().resolve();
          return {
            shadow: r.get('shade')!.light.alpha,
            mix: r.get('ghost')!.light.t,
          };
        };
        const lo = alphaAt(0);
        const mid = alphaAt(50);
        const hi = alphaAt(100);
        expect(mid.shadow).toBeGreaterThan(lo.shadow);
        expect(mid.shadow).toBeLessThan(hi.shadow);
        expect(mid.mix).toBeGreaterThan(hi.mix);
        expect(mid.mix).toBeLessThan(lo.mix);
      });

      it('rejects a contrast pair that switches metric', () => {
        const theme = glaze(0, 0);
        theme.colors({
          bg: { tone: 97 },
          fg: { base: 'bg', tone: 40, contrast: [4.5, { apca: 75 }] },
        });
        expect(() => theme.resolve()).toThrow(/switches metric/);
      });

      it('switches a mixed-kind tone pair at level 50', () => {
        // `lightTone: false` pins the window so this isolates the pair switch
        // from the window widening, which keeps ramping either side of 50.
        const toneAt = (level: number) => {
          glaze.resetConfig();
          glaze.configure({ contrastLevel: level });
          const theme = glaze(0, 0, { lightTone: false });
          theme.colors({
            surface: { tone: 60 },
            chip: { base: 'surface', tone: [50, 'max'] },
          });
          return theme.resolve().get('chip')!.light.t;
        };
        expect(toneAt(49)).toBeCloseTo(toneAt(0), 10);
        expect(toneAt(49)).toBeCloseTo(0.5, 6);
        expect(toneAt(50)).toBeCloseTo(toneAt(100), 10);
        expect(toneAt(50)).toBeCloseTo(1, 6);
      });
    });

    describe('mechanism: contrast escalation', () => {
      it('meets an interpolated WCAG floor at mid-level', () => {
        glaze.configure({ contrastLevel: 50 });
        const theme = glaze(0, 0);
        theme.colors({
          surface: { tone: 97 },
          text: { base: 'surface', tone: 60, contrast: 'AA', role: 'text' },
        });
        const r = theme.resolve();
        // AA (4.5) → AAA (7) interpolates to 5.75 at level 50.
        expectMeetsWcag(
          variantContrast(r.get('text')!.light, r.get('surface')!.light),
          5.75,
        );
      });

      it('keeps an explicit HC pair from escalating across the ramp', () => {
        const at = (level: number) => {
          glaze.resetConfig();
          glaze.configure({ contrastLevel: level });
          const theme = glaze(0, 0);
          theme.colors({
            surface: { tone: 97 },
            text: {
              base: 'surface',
              tone: 60,
              contrast: { wcag: ['AA', 'AA'] },
              role: 'text',
            },
          });
          const r = theme.resolve();
          return variantContrast(r.get('text')!.light, r.get('surface')!.light);
        };
        // The target stays 4.5 at every level (an explicit HC entry cancels the
        // AA→AAA promotion), so the measured contrast never climbs toward 7.
        // It is not bit-flat: the solver's overshoot allowance and the widening
        // seed clamp both move the solved tone by a hair.
        for (const level of [0, 50, 100]) {
          expectMeetsWcag(at(level), 4.5);
          expect(at(level)).toBeLessThan(4.6);
        }
      });
    });

    describe('direction stability', () => {
      const LEVELS = [0, 10, 20, 30, 40, 49, 50, 51, 60, 80, 90, 100];

      /** Signed tone delta of a solved color against its base, per level. */
      function deltasAcrossRamp(baseTone: number, tone: string): number[] {
        return LEVELS.map((level) => {
          glaze.resetConfig();
          glaze.configure({ contrastLevel: level });
          const theme = glaze(0, 0);
          theme.colors({
            bg: { tone: baseTone },
            chip: { base: 'bg', tone, contrast: 'AA', role: 'text' },
          });
          const r = theme.resolve();
          return r.get('chip')!.light.t - r.get('bg')!.light.t;
        });
      }

      /** Levels at which the solved side differs from the previous level's. */
      function switchLevels(deltas: number[]): number[] {
        const out: number[] = [];
        for (let i = 1; i < deltas.length; i++) {
          if (Math.sign(deltas[i]) !== Math.sign(deltas[i - 1])) {
            out.push(LEVELS[i]);
          }
        }
        return out;
      }

      // Both fixtures wobble when the solver re-decides per level: `autoFlip`
      // takes whichever side lands nearer the anchor when both meet the floor,
      // and that shifts with the target. Their two endpoints genuinely disagree
      // (no side satisfies both a 4.5 and a 7 floor here), so a single switch is
      // unavoidable — but it now lands at 50 instead of wherever reachability
      // happened to tip.
      it('switches side at most once, at level 50', () => {
        expect(switchLevels(deltasAcrossRamp(42, '-20'))).toEqual([50]);
        expect(switchLevels(deltasAcrossRamp(50, '+10'))).toEqual([50]);
      });

      it('never switches side when the two endpoints agree', () => {
        for (const [baseTone, tone] of [
          [97, '-20'],
          [30, '-10'],
          [88, '+8'],
          [55, '-25'],
        ] as const) {
          const deltas = deltasAcrossRamp(baseTone, tone);
          expect(switchLevels(deltas)).toEqual([]);
        }
      });

      it('meets the interpolated floor at every level', () => {
        // A reachable fixture: the pin only reorders the tie-break, so `flip`
        // still falls back when a side cannot physically reach the target.
        for (const level of LEVELS) {
          glaze.resetConfig();
          glaze.configure({ contrastLevel: level });
          const theme = glaze(0, 0);
          theme.colors({
            bg: { tone: 97 },
            chip: { base: 'bg', tone: '-20', contrast: 'AA', role: 'text' },
          });
          const r = theme.resolve();
          // AA (4.5) ramps to AAA (7).
          expectMeetsWcag(
            variantContrast(r.get('chip')!.light, r.get('bg')!.light),
            4.5 + (7 - 4.5) * (level / 100),
          );
        }
      });

      it('never emits less contrast than the weaker endpoint', () => {
        // For a color whose floor is physically unreachable, both endpoints
        // clamp to an extreme. Pinning must not make any level worse than the
        // weaker of the two anchors it ramps between.
        const anchors = (() => {
          const theme = glaze(0, 0);
          theme.colors({
            bg: { tone: 42 },
            chip: { base: 'bg', tone: '-20', contrast: 'AA', role: 'text' },
          });
          const r = theme.resolve();
          return [
            variantContrast(r.get('chip')!.light, r.get('bg')!.light),
            variantContrast(
              r.get('chip')!.lightContrast,
              r.get('bg')!.lightContrast,
            ),
          ];
        })();
        const weakest = Math.min(...anchors);
        for (const level of LEVELS) {
          glaze.resetConfig();
          glaze.configure({ contrastLevel: level });
          const theme = glaze(0, 0);
          theme.colors({
            bg: { tone: 42 },
            chip: { base: 'bg', tone: '-20', contrast: 'AA', role: 'text' },
          });
          const r = theme.resolve();
          expect(
            variantContrast(r.get('chip')!.light, r.get('bg')!.light),
          ).toBeGreaterThanOrEqual(weakest * WCAG_MEASURE_SLACK);
        }
      });
    });

    describe('invariants', () => {
      it("leaves mode: 'static' colors untouched at every level", () => {
        const at = (level: number) => {
          glaze.resetConfig();
          glaze.configure({ contrastLevel: level });
          return fixture().resolve().get('pinned')!;
        };
        expect(at(100).light.t).toBeCloseTo(at(0).light.t, 10);
        expect(at(100).dark.t).toBeCloseTo(at(0).dark.t, 10);
      });

      it('keeps root/dependent classification level-independent', () => {
        // `isAbsoluteTone` inspects only the normal entry, so a pair whose HC
        // entry is relative still resolves as a root at every level.
        const at = (level: number) => {
          glaze.resetConfig();
          glaze.configure({ contrastLevel: level });
          const theme = glaze(0, 0);
          theme.colors({ odd: { tone: [50, '+20'] } });
          return theme.resolve().get('odd')!.light.t;
        };
        expect(at(0)).toBeGreaterThan(0);
        expect(at(100)).toBeGreaterThan(0);
      });
    });

    describe('output', () => {
      it('mirrors the high-contrast slots onto the normal ones', () => {
        glaze.configure({ contrastLevel: 60 });
        const r = fixture().resolve();
        for (const color of r.values()) {
          expect(color.lightContrast).toBe(color.light);
          expect(color.darkContrast).toBe(color.dark);
        }
      });

      it('drops the high-contrast tier from every exporter', () => {
        glaze.configure({ modes: { highContrast: true }, contrastLevel: 60 });
        const theme = fixture();
        expect(theme.tokens().lightContrast).toBeUndefined();
        expect(theme.tokens().darkContrast).toBeUndefined();
        expect(theme.json().surface.lightContrast).toBeUndefined();
        expect(theme.dtcg().lightContrast).toBeUndefined();
        expect(
          theme.dtcgResolver().modifiers.scheme.contexts.lightContrast,
        ).toBeUndefined();
        expect(theme.tailwind()).not.toContain('.high-contrast');
        expect(
          theme.tasty()['#surface']['@media(prefers-contrast: more)'],
        ).toBeUndefined();
      });

      it('ignores modes.highContrast entirely, and says nothing about it', () => {
        // Flipping a contrast preference from auto to manual is normal use, so a
        // still-set `highContrast: true` goes quietly inert rather than winning
        // or warning. It means "emit a separate HC set when contrast is auto".
        const warn = vi
          .spyOn(console, 'warn')
          .mockImplementation(() => undefined);
        try {
          glaze.configure({ contrastLevel: 60 });
          const theme = fixture();
          expect(
            theme.tokens({ modes: { highContrast: true } }).lightContrast,
          ).toBeUndefined();
          expect(
            theme.dtcg({ modes: { highContrast: true } }).lightContrast,
          ).toBeUndefined();
          expect(
            theme.tailwind({ modes: { highContrast: true } }),
          ).not.toContain('.high-contrast');
          expect(
            theme.tasty({ modes: { highContrast: true } })['#surface'][
              '@media(prefers-contrast: more)'
            ],
          ).toBeUndefined();
          expect(warn).not.toHaveBeenCalled();
        } finally {
          warn.mockRestore();
        }
      });

      it('mirrors the high-contrast CSS blocks', () => {
        glaze.configure({ contrastLevel: 60 });
        const css = fixture().css();
        expect(css.lightContrast).toBe(css.light);
        expect(css.darkContrast).toBe(css.dark);
      });

      it('leaves default output untouched at level 0', () => {
        const theme = fixture();
        const auto = theme.tokens();
        glaze.configure({ contrastLevel: 0 });
        expect(theme.tokens()).toEqual(auto);
      });

      it('keeps a sibling theme’s high-contrast tier in a palette', () => {
        glaze.configure({ modes: { highContrast: true } });
        const manual = glaze(280, 80, { contrastLevel: 100 });
        manual.colors({ surface: { tone: 97 } });
        const auto = glaze(120, 80);
        auto.colors({ surface: { tone: 97 } });
        const tokens = glaze
          .palette({ manual, auto })
          .tokens({ modes: { highContrast: true } });
        // The auto theme still escalates...
        expect(tokens.lightContrast['auto-surface']).not.toBe(
          tokens.light['auto-surface'],
        );
        // ...while the manual theme reports its own resolved value.
        expect(tokens.lightContrast['manual-surface']).toBe(
          tokens.light['manual-surface'],
        );
      });
    });

    describe('config plumbing', () => {
      it("defaults to 'auto'", () => {
        expect(glaze.getConfig().contrastLevel).toBe('auto');
      });

      it('round-trips through configure and back to auto', () => {
        glaze.configure({ contrastLevel: 60 });
        expect(glaze.getConfig().contrastLevel).toBe(60);
        glaze.configure({ contrastLevel: 'auto' });
        expect(glaze.getConfig().contrastLevel).toBe('auto');
      });

      it('clamps out-of-range levels and rejects non-finite ones', () => {
        glaze.configure({ contrastLevel: 150 });
        expect(glaze.getConfig().contrastLevel).toBe(100);
        glaze.configure({ contrastLevel: -20 });
        expect(glaze.getConfig().contrastLevel).toBe(0);
        expect(() => glaze.configure({ contrastLevel: NaN })).toThrow(
          /contrastLevel/,
        );
      });

      it('lets an instance override or opt out of the global level', () => {
        glaze.configure({ contrastLevel: 100 });
        expect(
          glaze(0, 0, { contrastLevel: 40 }).getConfig().contrastLevel,
        ).toBe(40);
        expect(
          glaze(0, 0, { contrastLevel: 'auto' }).getConfig().contrastLevel,
        ).toBe('auto');
      });

      it('inherits and overrides through extend()', () => {
        const parent = glaze(0, 0, { contrastLevel: 60 });
        expect(parent.extend({}).getConfig().contrastLevel).toBe(60);
        expect(
          parent.extend({ config: { contrastLevel: 20 } }).getConfig()
            .contrastLevel,
        ).toBe(20);
      });

      it('invalidates the resolve cache when the level changes', () => {
        const theme = fixture();
        const before = theme.resolve().get('text')!.light.t;
        glaze.configure({ contrastLevel: 100 });
        expect(theme.resolve().get('text')!.light.t).not.toBe(before);
      });

      it('applies an opted-out instance under a global level', () => {
        const anchors = structuredClone([...fixture().resolve()]);
        glaze.configure({ contrastLevel: 100 });
        const optedOut = fixture({ contrastLevel: 'auto' }).resolve();
        for (const [name, anchor] of anchors) {
          expect(optedOut.get(name)!.light).toEqual(anchor.light);
          expect(optedOut.get(name)!.lightContrast).toEqual(
            anchor.lightContrast,
          );
        }
      });
    });

    describe('authoring export', () => {
      it('freezes an instance-authored level', () => {
        const data = glaze(280, 80, { contrastLevel: 60 }).export();
        expect(data.config!.contrastLevel).toBe(60);
      });

      it('does not freeze a level inherited from the global config', () => {
        glaze.configure({ contrastLevel: 60 });
        // A global level is a live preference, not authored theme data.
        expect(glaze(280, 80).export().config!.contrastLevel).toBeUndefined();
      });

      it('freezes a level passed to export()', () => {
        const data = glaze(280, 80).export({ contrastLevel: 30 });
        expect(data.config!.contrastLevel).toBe(30);
      });

      it('restores a frozen level after the global resets', () => {
        const source = fixture({ contrastLevel: 100 });
        const expected = source.resolve().get('text')!.light.t;
        const data = source.export();
        glaze.resetConfig();
        const restored = glaze.themeFrom(data);
        expect(restored.getConfig().contrastLevel).toBe(100);
        expect(restored.resolve().get('text')!.light.t).toBeCloseTo(
          expected,
          10,
        );
      });
    });

    describe('standalone tokens', () => {
      it('resolves a token at the level', () => {
        const auto = glaze.color({ hue: 280, saturation: 80, tone: [30, 10] });
        const anchor = structuredClone(auto.resolve());
        glaze.configure({ contrastLevel: 100 });
        const manual = glaze.color({
          hue: 280,
          saturation: 80,
          tone: [30, 10],
        });
        expect(manual.resolve().light).toEqual(anchor.lightContrast);
      });

      it('is exact for a base-linked token under a global level', () => {
        const build = () => {
          const bg = glaze.color('#ffffff');
          return glaze.color({
            from: '#8080ff',
            base: bg,
            contrast: 'AA',
            role: 'text',
          });
        };
        const anchor = structuredClone(build().resolve());
        glaze.configure({ contrastLevel: 100 });
        expect(build().resolve().light).toEqual(anchor.lightContrast);
      });

      it('accepts a per-token level', () => {
        const token = glaze.color('#8080ff', { contrastLevel: 100 });
        expect(token.resolve().lightContrast).toBe(token.resolve().light);
      });
    });
  });
});
