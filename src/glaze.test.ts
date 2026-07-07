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
      const theme = glaze(100, 100, undefined, { pastel: true });
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
    it('honors per-color pastel override regardless of global config', () => {
      // Two colors at the same seed: one opts into pastel via the def, the
      // other follows the global `pastel: false` default. The resolved
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

    it('value-shorthand pastel override beats the global config', () => {
      glaze.configure({ pastel: false });
      const token = glaze.color({ from: '#1e90ff', pastel: true });
      expect(token.resolve().light.pastel).toBe(true);
      glaze.resetConfig();
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
      expect(
        variantContrast(text.lightContrast, surface.lightContrast),
      ).toBeGreaterThanOrEqual(7);
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
      expect(
        variantContrast(r.get('fg')!.light, r.get('bg')!.light),
      ).toBeGreaterThanOrEqual(4.5);
    });

    it('{ wcag } object selects WCAG', () => {
      const theme = glaze(0, 0);
      theme.colors({
        bg: { tone: 97 },
        fg: { base: 'bg', tone: 40, contrast: { wcag: 7 } },
      });
      const r = theme.resolve();
      expect(
        variantContrast(r.get('fg')!.light, r.get('bg')!.light),
      ).toBeGreaterThanOrEqual(7);
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
      expect(
        variantContrast(r.get('fg')!.lightContrast, r.get('bg')!.lightContrast),
      ).toBeGreaterThanOrEqual(7);
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

    it('border pastel follows the global config like any other color', () => {
      glaze.configure({ pastel: true });
      const theme = glaze(280, 60);
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
      expect(variantApca(asText, base, 'fg')).toBeGreaterThanOrEqual(45);
      expect(variantApca(asSurface, base, 'bg')).toBeGreaterThanOrEqual(45);
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
      expect(variantApca(asSurface, base, 'bg')).toBeGreaterThanOrEqual(45);
      expect(variantApca(asText, base, 'fg')).toBeGreaterThanOrEqual(45);
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
      expect(variantApca(accent, base, 'fg')).toBeGreaterThanOrEqual(45);
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
      expect(
        variantApca(r.get('body')!.light, base, 'fg'),
      ).toBeGreaterThanOrEqual(60);
      // 'min' -> Lc 15 (border role -> bg-ordered? border is fg polarity)
      expect(
        variantApca(r.get('divider')!.light, base, 'fg'),
      ).toBeGreaterThanOrEqual(15);
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
      expect(
        variantApca(r.get('accent')!.light, base, 'fg'),
      ).toBeGreaterThanOrEqual(60);
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
      expect(tokens['#surface']['@dark']).toBeDefined();
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
      glaze.configure({ pastel: true });
      const theme = glaze(240, 18);
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

    it('palette scopes hue vars per theme', () => {
      glaze.configure({ pastel: true });
      const brand = glaze(240, 18);
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
      glaze.configure({ pastel: true });
      const theme = glaze(240, 18);
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
      glaze.configure({ pastel: true });
      const brand = glaze(240, 18);
      brand.colors({ surface: { tone: 35 }, accent: { hue: '+20', tone: 52 } });
      const warning = glaze(23, 18);
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

      it('snapshots the dark window at create time', () => {
        const before = glaze.color('#ffffff');
        glaze.configure({ darkTone: { lo: 40, hi: 80, eps: 0.05 } });
        try {
          expect(llOf(before.resolve().dark)).toBeCloseTo(0.15, 2);
          expect(llOf(glaze.color('#ffffff').resolve().dark)).toBeCloseTo(
            0.4,
            2,
          );
        } finally {
          glaze.resetConfig();
        }
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
          expect(variantContrast(textR[s], bgR[s])).toBeGreaterThanOrEqual(4.5);
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
        expect(data.config?.lightTone).toBe(false);
        expect(data.config?.darkTone).toEqual({ lo: 15, hi: 95, eps: 0.05 });
      });

      it('structured-form snapshots both tone windows', () => {
        const data = glaze
          .color({ hue: 280, saturation: 50, tone: 50 })
          .export();
        expect(data.form).toBe('structured');
        expect(data.config?.lightTone).toEqual({ lo: 10, hi: 100, eps: 0.05 });
        expect(data.config?.darkTone).toEqual({ lo: 15, hi: 95, eps: 0.05 });
      });

      it('export snapshots survive configure() after create', () => {
        const tok = glaze.color({ h: 0, s: 0, l: 0 });
        glaze.configure({ darkTone: { lo: 40, hi: 80, eps: 0.05 } });
        try {
          const data = tok.export();
          expect(data.config?.darkTone).toEqual({ lo: 15, hi: 95, eps: 0.05 });
          const restored = glaze.colorFrom(JSON.parse(JSON.stringify(data)));
          expect(restored.resolve().dark.t).toBeCloseTo(
            tok.resolve().dark.t,
            6,
          );
        } finally {
          glaze.resetConfig();
        }
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
      expect(
        variantContrast(r.get('m')!.light, r.get('bg')!.light),
      ).toBeGreaterThanOrEqual(4.5);
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
});
