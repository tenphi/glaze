import { glaze } from './glaze';
import type { ResolvedColorVariant } from './types';

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

    it('defaults saturation to 100 when using shorthand', () => {
      const theme = glaze(280);
      expect(theme.saturation).toBe(100);
    });
  });

  describe('color definitions', () => {
    it('resolves root colors', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 97, saturation: 0.75 },
      });

      const resolved = theme.resolve();
      const surface = resolved.get('surface')!;

      expect(surface).toBeDefined();
      expect(surface.light.h).toBe(280);
      expect(surface.light.l).toBeCloseTo(0.97, 2);
      expect(surface.light.s).toBeCloseTo(0.6, 2); // 0.75 * 80/100
    });

    it('resolves dependent colors with relative lightness', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 97, saturation: 0.75 },
        text: { base: 'surface', lightness: '-52', contrast: 'AAA' },
      });

      const resolved = theme.resolve();
      const text = resolved.get('text')!;

      expect(text).toBeDefined();
      // Text should be darker than surface in light mode
      expect(text.light.l).toBeLessThan(0.97);
    });

    it('resolves dependent colors with absolute lightness', () => {
      const theme = glaze(0, 0);
      theme.colors({
        surface: { lightness: 97 },
        text: { base: 'surface', lightness: 45, contrast: 'AAA' },
      });

      const resolved = theme.resolve();
      const text = resolved.get('text')!;

      expect(text).toBeDefined();
      // Absolute lightness 45 in light mode
      expect(text.light.l).toBeLessThan(0.97);
    });

    it('resolves dependent colors without lightness (inherits base)', () => {
      const theme = glaze(0, 0);
      theme.colors({
        surface: { lightness: 97 },
        overlay: { base: 'surface' },
      });

      const resolved = theme.resolve();
      const overlay = resolved.get('overlay')!;

      // Should inherit base lightness
      expect(overlay.light.l).toBeCloseTo(0.97, 2);
    });

    it('merges colors additively on second .colors() call', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { lightness: 97 } });
      theme.colors({ text: { lightness: 30 } });

      const resolved = theme.resolve();
      expect(resolved.has('surface')).toBe(true);
      expect(resolved.has('text')).toBe(true);
    });

    it('overwrites existing color on .colors() with same key', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { lightness: 97 } });
      theme.colors({ surface: { lightness: 50 } });

      const resolved = theme.resolve();
      // lightLightness [10, 100]: 50 * 0.9 + 10 = 55
      expect(resolved.get('surface')!.light.l).toBeCloseTo(0.55, 2);
    });
  });

  describe('validation', () => {
    it('throws on contrast without base', () => {
      const theme = glaze(280, 80);
      theme.colors({
        text: { lightness: 50, contrast: 'AA' } as any,
      });

      expect(() => theme.resolve()).toThrow('contrast');
    });

    it('throws on relative lightness without base', () => {
      const theme = glaze(280, 80);
      theme.colors({
        text: { lightness: '-52' } as any,
      });

      expect(() => theme.resolve()).toThrow('relative');
    });

    it('throws on non-existent base reference', () => {
      const theme = glaze(280, 80);
      theme.colors({
        text: { base: 'nonexistent', lightness: '-52' },
      });

      expect(() => theme.resolve()).toThrow('non-existent');
    });

    it('throws on circular base references', () => {
      const theme = glaze(280, 80);
      theme.colors({
        a: { base: 'b', lightness: '-10' },
        b: { base: 'a', lightness: '-10' },
      });

      expect(() => theme.resolve()).toThrow('circular');
    });

    it('throws when color has neither absolute lightness nor base', () => {
      const theme = glaze(280, 80);
      theme.colors({
        text: { saturation: 0.5 } as any,
      });

      expect(() => theme.resolve()).toThrow('must have either');
    });

    it('resolves colors with absolute lightness and base (for contrast)', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 97 },
        card: { base: 'surface', lightness: 46 },
      });

      const resolved = theme.resolve();
      const card = resolved.get('card')!;
      // lightLightness [10, 100]: (46 * 90) / 100 + 10 = 51.4
      expect(card.light.l).toBeCloseTo(0.514, 2);
    });

    it('clamps contrast-solved lightness to scheme range (no pure black)', () => {
      glaze.configure({ lightLightness: [10, 100] });
      const theme = glaze(210, 75);
      theme.colors({
        surface: { lightness: 100, saturation: 0.2 },
        text: {
          base: 'surface',
          lightness: 0,
          contrast: 'AAA',
          saturation: 0.08,
        },
      });

      const resolved = theme.resolve();
      const text = resolved.get('text')!;
      // lightness should be clamped to the scheme minimum (10/100 = 0.1),
      // not pure black (0)
      expect(text.light.l).toBeGreaterThanOrEqual(0.1);
      expect(text.light.l).toBeLessThanOrEqual(1);
      glaze.resetConfig();
    });
  });

  describe('relative lightness', () => {
    it('negative relative lightness means darker than base', () => {
      const theme = glaze(0, 0);
      theme.colors({
        surface: { lightness: 97 },
        text: { base: 'surface', lightness: '-52' },
      });

      const resolved = theme.resolve();
      const text = resolved.get('text')!;
      // 97 - 52 = 45
      expect(text.light.l).toBeCloseTo(0.45, 2);
    });

    it('positive relative lightness means lighter than base', () => {
      const theme = glaze(0, 0);
      theme.colors({
        fill: { lightness: 52 },
        text: { base: 'fill', lightness: '+48' },
      });

      const resolved = theme.resolve();
      const text = resolved.get('text')!;
      // 52 + 48 = 100
      expect(text.light.l).toBeCloseTo(1.0, 2);
    });

    it('relative delta applies darkCurve in normal dark auto mode', () => {
      const theme = glaze(0, 0);
      theme.colors({
        surface: { lightness: 100 },
        'surface-2': { base: 'surface', lightness: '-2' },
      });

      const resolved = theme.resolve();
      const s2 = resolved.get('surface-2')!;

      // lightMappedToDark(98, false): clamped=98, t = (100-98)/90 ≈ 0.02222
      // Möbius(t, 0.5) = 0.02222 / (0.02222 + 0.5*0.97778) ≈ 0.04348
      // darkL = 15 + 80*0.04348 ≈ 18.48
      expect(s2.dark.l).toBeCloseTo(0.1848, 2);
    });

    it('relative delta applies darkCurve in HC dark auto mode', () => {
      const theme = glaze(0, 0);
      theme.colors({
        surface: { lightness: 100 },
        'surface-2': { base: 'surface', lightness: '-2' },
      });

      const resolved = theme.resolve();
      const s2 = resolved.get('surface-2')!;

      // HC light variant: base L=100, delta=-2 → absoluteLightL=98
      // HC dark: t = 0.02, Möbius(0.02, 0.5) = 0.02/0.51 ≈ 0.03922
      // darkL = 100 * 0.03922 ≈ 3.92
      expect(s2.darkContrast.l).toBeCloseTo(0.0392, 2);
    });

    it('cascading relative deltas expand gaps via darkCurve', () => {
      const theme = glaze(0, 0);
      theme.colors({
        surface: { lightness: 100 },
        'surface-2': { base: 'surface', lightness: '-2' },
        'surface-3': { base: 'surface-2', lightness: '-2' },
      });

      const resolved = theme.resolve();
      const s = resolved.get('surface')!;
      const s2 = resolved.get('surface-2')!;
      const s3 = resolved.get('surface-3')!;

      // HC dark (Möbius beta=0.5): surface=0, surface-2≈3.92, surface-3≈7.69
      expect(s.darkContrast.l).toBeCloseTo(0.0, 2);
      expect(s2.darkContrast.l).toBeCloseTo(0.0392, 2);
      expect(s3.darkContrast.l).toBeCloseTo(0.0769, 2);

      // Each gap is visible (> 3 units)
      expect(s2.darkContrast.l - s.darkContrast.l).toBeGreaterThan(0.03);
      expect(s3.darkContrast.l - s2.darkContrast.l).toBeGreaterThan(0.03);
    });
  });

  describe('per-color hue', () => {
    it('absolute hue overrides theme seed', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 97, hue: 120 },
      });

      const resolved = theme.resolve();
      const surface = resolved.get('surface')!;
      expect(surface.light.h).toBe(120);
    });

    it('relative hue shifts from theme seed', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 97, hue: '+20' },
      });

      const resolved = theme.resolve();
      const surface = resolved.get('surface')!;
      expect(surface.light.h).toBeCloseTo(300, 2);
    });

    it('negative relative hue shifts backwards', () => {
      const theme = glaze(30, 80);
      theme.colors({
        surface: { lightness: 97, hue: '-50' },
      });

      const resolved = theme.resolve();
      const surface = resolved.get('surface')!;
      // 30 - 50 = -20 → wraps to 340
      expect(surface.light.h).toBeCloseTo(340, 2);
    });

    it('hue wraps around 360', () => {
      const theme = glaze(350, 80);
      theme.colors({
        surface: { lightness: 97, hue: '+30' },
      });

      const resolved = theme.resolve();
      const surface = resolved.get('surface')!;
      // 350 + 30 = 380 → wraps to 20
      expect(surface.light.h).toBeCloseTo(20, 2);
    });

    it('per-color hue is relative to theme seed, not base', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 97, hue: 120 },
        text: { base: 'surface', lightness: '-30', hue: '+20' },
      });

      const resolved = theme.resolve();
      const text = resolved.get('text')!;
      // hue: '+20' is relative to theme seed 280, not surface's 120
      expect(text.light.h).toBeCloseTo(300, 2);
    });
  });

  describe('adaptation modes', () => {
    it('auto mode inverts lightness in dark scheme', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 97, saturation: 0.75 },
      });

      const resolved = theme.resolve();
      const surface = resolved.get('surface')!;

      // Möbius: lightL = 97*0.9+10 = 97.3, t = (100-97.3)/90 = 0.03
      // f(t) = 0.03 / (0.03 + 0.5*0.97) = 0.03/0.515 ≈ 0.05825
      // darkL = 15 + 80*0.05825 ≈ 19.66
      expect(surface.dark.l).toBeCloseTo(0.1966, 2);
    });

    it('fixed mode maps lightness without inversion', () => {
      const theme = glaze(280, 80);
      theme.colors({
        fill: { lightness: 52, mode: 'fixed' },
      });

      const resolved = theme.resolve();
      const fill = resolved.get('fill')!;

      // Fixed: (52 * (95-15)) / 100 + 15 = 52*0.8 + 15 = 56.6
      expect(fill.dark.l).toBeCloseTo(0.566, 2);
    });

    it('static mode preserves lightness across schemes', () => {
      const theme = glaze(280, 80);
      theme.colors({
        brand: { lightness: 60, mode: 'static' },
      });

      const resolved = theme.resolve();
      const brand = resolved.get('brand')!;

      expect(brand.dark.l).toBeCloseTo(brand.light.l, 4);
      expect(brand.dark.s).toBeCloseTo(brand.light.s, 4);
    });
  });

  describe('darkCurve', () => {
    it('matches spec example: l=98, darkCurve=0.5', () => {
      glaze.configure({ darkCurve: 0.5 });
      const theme = glaze(240, 5);
      theme.colors({
        surface: { lightness: 98 },
      });

      const resolved = theme.resolve();
      const surface = resolved.get('surface')!;

      // Möbius: lightL = 98*0.9+10 = 98.2, t = (100-98.2)/90 = 0.02
      // f(t) = 0.02 / (0.02 + 0.5*0.98) = 0.02/0.51 ≈ 0.03922
      // l_d = 15 + 80*0.03922 ≈ 18.14
      expect(surface.dark.l).toBeCloseTo(0.1814, 2);
    });

    it('darkCurve: 1 produces legacy linear behavior', () => {
      glaze.configure({ darkCurve: 1 });
      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 97, saturation: 0.75 },
      });

      const resolved = theme.resolve();
      const surface = resolved.get('surface')!;

      // Linear: ((100-97) * (95-15)) / 100 + 15 = 3*0.8 + 15 = 17.4
      expect(surface.dark.l).toBeCloseTo(0.174, 2);
    });

    it('boundary: l=0 maps to l_max', () => {
      const theme = glaze(0, 0);
      theme.colors({
        black: { lightness: 0 },
      });

      const resolved = theme.resolve();
      const black = resolved.get('black')!;

      // t = 1, mobiusCurve(1, 0.5) = 1, l_d = 15 + 80 * 1 = 95
      expect(black.dark.l).toBeCloseTo(0.95, 2);
    });

    it('boundary: l=100 maps to l_min', () => {
      const theme = glaze(0, 0);
      theme.colors({
        white: { lightness: 100 },
      });

      const resolved = theme.resolve();
      const white = resolved.get('white')!;

      // t = 0, mobiusCurve(0, 0.5) = 0, l_d = 15 + 80 * 0 = 15
      expect(white.dark.l).toBeCloseTo(0.15, 2);
    });

    it('does not affect fixed mode', () => {
      const theme = glaze(280, 80);
      theme.colors({
        fill: { lightness: 52, mode: 'fixed' },
      });

      const resolved = theme.resolve();
      const fill = resolved.get('fill')!;

      // Fixed: (52 * (95-15)) / 100 + 15 = 52*0.8 + 15 = 56.6
      expect(fill.dark.l).toBeCloseTo(0.566, 2);
    });

    it('does not affect static mode', () => {
      const theme = glaze(280, 80);
      theme.colors({
        brand: { lightness: 60, mode: 'static' },
      });

      const resolved = theme.resolve();
      const brand = resolved.get('brand')!;

      expect(brand.dark.l).toBeCloseTo(brand.light.l, 4);
    });

    it('applies Möbius curve in high-contrast dark mode over full range', () => {
      const theme = glaze(0, 0);
      theme.colors({
        surface: { lightness: 97 },
      });

      const resolved = theme.resolve();
      const surface = resolved.get('surface')!;

      // HC dark auto: t = 0.03, Möbius(0.03, 0.5) = 0.03/0.515 ≈ 0.05825
      // l_d = 100 * 0.05825 ≈ 5.83
      expect(surface.darkContrast.l).toBeCloseTo(0.0583, 2);
    });

    it('accepts [normal, hc] pair for separate HC curve', () => {
      glaze.configure({ darkCurve: [0.5, 0.3] });
      const theme = glaze(0, 0);
      theme.colors({
        surface: { lightness: 97 },
      });

      const resolved = theme.resolve();
      const surface = resolved.get('surface')!;

      // Normal dark: beta=0.5, lightL=97.3, t=2.7/90=0.03
      // Möbius(0.03, 0.5) = 0.03/0.515 ≈ 0.05825, l_d = 15+80*0.05825 ≈ 19.66
      expect(surface.dark.l).toBeCloseTo(0.1966, 2);

      // HC dark: beta=0.3, t=(100-97)/100=0.03
      // Möbius(0.03, 0.3) = 0.03/(0.03+0.3*0.97) = 0.03/0.321 ≈ 0.09346
      // l_d = 100*0.09346 ≈ 9.35
      expect(surface.darkContrast.l).toBeCloseTo(0.0935, 2);

      glaze.resetConfig();
    });

    it('single darkCurve number applies to both normal and HC', () => {
      glaze.configure({ darkCurve: 0.5 });
      const theme = glaze(0, 0);
      theme.colors({
        surface: { lightness: 97 },
      });

      const resolved = theme.resolve();
      const surface = resolved.get('surface')!;

      // Both use beta=0.5
      // Normal dark: lightL=97.3, t=0.03, Möbius ≈ 0.05825, l_d = 15+80*0.05825 ≈ 19.66
      expect(surface.dark.l).toBeCloseTo(0.1966, 2);
      // HC dark: t=0.03, Möbius ≈ 0.05825, l_d = 100*0.05825 ≈ 5.83
      expect(surface.darkContrast.l).toBeCloseTo(0.0583, 2);

      glaze.resetConfig();
    });
  });

  describe('dark scheme', () => {
    it('applies desaturation in dark mode', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 97, saturation: 0.75 },
      });

      const resolved = theme.resolve();
      const surface = resolved.get('surface')!;

      // Dark saturation = light_sat * (1 - 0.1)
      expect(surface.dark.s).toBeCloseTo(surface.light.s * 0.9, 2);
    });
  });

  describe('high-contrast mode', () => {
    it('uses HC pair value for lightness', () => {
      const theme = glaze(0, 0);
      theme.colors({
        surface: { lightness: [97, 100] },
      });

      const resolved = theme.resolve();
      const surface = resolved.get('surface')!;

      expect(surface.light.l).toBeCloseTo(0.97, 2);
      expect(surface.lightContrast.l).toBeCloseTo(1.0, 2);
    });

    it('uses HC pair value for relative lightness', () => {
      const theme = glaze(0, 0);
      theme.colors({
        surface: { lightness: 97 },
        border: { base: 'surface', lightness: ['-7', '-20'] },
      });

      const resolved = theme.resolve();
      const border = resolved.get('border')!;

      // Normal: 97 - 7 = 90
      // HC: 97 - 20 = 77
      expect(border.light.l).toBeCloseTo(0.9, 2);
      expect(border.lightContrast.l).toBeCloseTo(0.77, 2);
    });

    it('bypasses lightLightness window in HC light scheme', () => {
      glaze.configure({ lightLightness: [10, 100] });
      const theme = glaze(0, 0);
      theme.colors({
        surface: { lightness: 97 },
        dark: { lightness: 0 },
      });

      const resolved = theme.resolve();
      const surface = resolved.get('surface')!;
      const dark = resolved.get('dark')!;

      // Normal light: mapped — L=97 → 97*0.9+10 = 97.3
      expect(surface.light.l).toBeCloseTo(0.973, 2);
      // HC light: bypassed — L=97 stays 97
      expect(surface.lightContrast.l).toBeCloseTo(0.97, 2);

      // Normal light: L=0 → 0*0.9+10 = 10
      expect(dark.light.l).toBeCloseTo(0.1, 2);
      // HC light: L=0 stays 0
      expect(dark.lightContrast.l).toBeCloseTo(0.0, 2);

      glaze.resetConfig();
    });

    it('bypasses darkLightness window in HC dark scheme', () => {
      glaze.configure({ darkLightness: [15, 95] });
      const theme = glaze(0, 0);
      theme.colors({
        surface: { lightness: 97 },
      });

      const resolved = theme.resolve();
      const surface = resolved.get('surface')!;

      // Normal dark auto (Möbius beta=0.5): t=0.03, f(t)≈0.05825, 15+80*0.05825≈19.66
      expect(surface.dark.l).toBeCloseTo(0.1966, 2);
      // HC dark auto (Möbius beta=0.5): t=0.03, f(t)≈0.05825, 100*0.05825≈5.83
      expect(surface.darkContrast.l).toBeCloseTo(0.0583, 2);

      glaze.resetConfig();
    });

    it('bypasses darkLightness window in HC dark fixed mode', () => {
      glaze.configure({ darkLightness: [15, 95] });
      const theme = glaze(0, 0);
      theme.colors({
        accent: { lightness: 52, mode: 'fixed' },
      });

      const resolved = theme.resolve();
      const accent = resolved.get('accent')!;

      // Normal dark fixed: 52*0.8+15 = 56.6
      expect(accent.dark.l).toBeCloseTo(0.566, 2);
      // HC dark fixed: 52 stays 52 (identity)
      expect(accent.darkContrast.l).toBeCloseTo(0.52, 2);

      glaze.resetConfig();
    });

    it('uses full [0, 1] search range for HC contrast solving', () => {
      glaze.configure({
        lightLightness: [10, 100],
        darkLightness: [15, 95],
      });
      const theme = glaze(0, 0);
      theme.colors({
        surface: { lightness: 97 },
        text: {
          base: 'surface',
          lightness: ['-52', '-90'],
          contrast: ['AAA', 'AAA'],
        },
      });

      const resolved = theme.resolve();
      const text = resolved.get('text')!;

      // HC light: text can reach lower lightness than normal
      // (solver can search all the way to 0 instead of 0.10)
      expect(text.lightContrast.l).toBeLessThanOrEqual(text.light.l);

      glaze.resetConfig();
    });
  });

  describe('extend', () => {
    it('inherits all color definitions', () => {
      const primary = glaze(280, 80);
      primary.colors({
        surface: { lightness: 97, saturation: 0.75 },
        text: { base: 'surface', lightness: '-52', contrast: 'AAA' },
      });

      const danger = primary.extend({ hue: 23 });
      const resolved = danger.resolve();

      expect(resolved.has('surface')).toBe(true);
      expect(resolved.has('text')).toBe(true);
      expect(resolved.get('surface')!.light.h).toBe(23);
    });

    it('can override saturation', () => {
      const primary = glaze(280, 80);
      primary.colors({ surface: { lightness: 97 } });

      const muted = primary.extend({ saturation: 40 });
      expect(muted.saturation).toBe(40);
    });

    it('can override individual colors (additive merge)', () => {
      const primary = glaze(280, 80);
      primary.colors({
        surface: { lightness: 97 },
        fill: { lightness: 52 },
      });

      const danger = primary.extend({
        hue: 23,
        colors: {
          fill: { lightness: 48, mode: 'fixed' },
        },
      });

      const resolved = danger.resolve();
      expect(resolved.has('surface')).toBe(true);
      expect(resolved.get('fill')!.mode).toBe('fixed');
    });
  });

  describe('token export', () => {
    it('exports tokens grouped by variant', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 97 },
      });

      const tokens = theme.tokens({
        modes: { dark: true, highContrast: true },
      });
      expect(tokens.light).toBeDefined();
      expect(tokens.dark).toBeDefined();
      expect(tokens.lightContrast).toBeDefined();
      expect(tokens.darkContrast).toBeDefined();
      expect(tokens.light.surface).toMatch(/^okhsl\(/);
      expect(tokens.dark.surface).toMatch(/^okhsl\(/);
      expect(tokens.lightContrast.surface).toMatch(/^okhsl\(/);
      expect(tokens.darkContrast.surface).toMatch(/^okhsl\(/);
    });

    it('defaults to light + dark variants', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { lightness: 97 } });

      const tokens = theme.tokens();
      expect(Object.keys(tokens)).toEqual(['light', 'dark']);
      expect(tokens.light.surface).toMatch(/^okhsl\(/);
      expect(tokens.dark.surface).toMatch(/^okhsl\(/);
    });

    it('respects modes option', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { lightness: 97 } });

      const lightOnly = theme.tokens({
        modes: { dark: false, highContrast: false },
      });
      expect(Object.keys(lightOnly)).toEqual(['light']);

      const withHc = theme.tokens({
        modes: { dark: false, highContrast: true },
      });
      expect(Object.keys(withHc)).toEqual(['light', 'lightContrast']);
    });

    it('respects format option', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { lightness: 97 } });

      const tokens = theme.tokens({ format: 'rgb' });
      expect(tokens.light.surface).toMatch(/^rgb\(/);
    });
  });

  describe('tasty export', () => {
    it('exports tasty tokens with # prefix and state aliases', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 97 },
      });

      // Enable all modes for this test
      const tokens = theme.tasty({
        modes: { dark: true, highContrast: true },
      });
      expect(tokens['#surface']).toBeDefined();
      expect(tokens['#surface']['']).toMatch(/^okhsl\(/);
      expect(tokens['#surface']['@dark']).toMatch(/^okhsl\(/);
      expect(tokens['#surface']['@high-contrast']).toMatch(/^okhsl\(/);
      expect(tokens['#surface']['@dark & @high-contrast']).toMatch(/^okhsl\(/);
    });

    it('supports custom state aliases', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { lightness: 97 } });

      // Enable highContrast to test HC state aliases
      const tokens = theme.tasty({
        states: { dark: '@night', highContrast: '@hc' },
        modes: { dark: true, highContrast: true },
      });

      expect(tokens['#surface']['@night']).toBeDefined();
      expect(tokens['#surface']['@hc']).toBeDefined();
      expect(tokens['#surface']['@night & @hc']).toBeDefined();
    });
  });

  describe('JSON export', () => {
    it('exports plain scheme variants', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { lightness: 97 } });

      // Enable all modes for this test
      const json = theme.json({ modes: { dark: true, highContrast: true } });
      expect(json.surface).toBeDefined();
      expect(json.surface.light).toMatch(/^okhsl\(/);
      expect(json.surface.dark).toMatch(/^okhsl\(/);
      expect(json.surface.lightContrast).toMatch(/^okhsl\(/);
      expect(json.surface.darkContrast).toMatch(/^okhsl\(/);
    });
  });

  describe('palette', () => {
    it('combines multiple themes with prefix (tokens)', () => {
      const primary = glaze(280, 80);
      primary.colors({ surface: { lightness: 97 } });

      const danger = primary.extend({ hue: 23 });

      const palette = glaze.palette({ primary, danger });
      const tokens = palette.tokens({ prefix: true });

      expect(tokens.light['primary-surface']).toBeDefined();
      expect(tokens.light['danger-surface']).toBeDefined();
      expect(tokens.dark['primary-surface']).toBeDefined();
      expect(tokens.dark['danger-surface']).toBeDefined();
    });

    it('supports custom prefix mapping (tokens)', () => {
      const primary = glaze(280, 80);
      primary.colors({ surface: { lightness: 97 } });

      const danger = primary.extend({ hue: 23 });

      const palette = glaze.palette({ primary, danger });
      const tokens = palette.tokens({
        prefix: { primary: 'brand-', danger: 'error-' },
      });

      expect(tokens.light['brand-surface']).toBeDefined();
      expect(tokens.light['error-surface']).toBeDefined();
    });

    it('combines multiple themes with prefix (tasty)', () => {
      const primary = glaze(280, 80);
      primary.colors({ surface: { lightness: 97 } });

      const danger = primary.extend({ hue: 23 });

      const palette = glaze.palette({ primary, danger });
      const tokens = palette.tasty({ prefix: true });

      expect(tokens['#primary-surface']).toBeDefined();
      expect(tokens['#danger-surface']).toBeDefined();
    });

    it('supports custom prefix mapping (tasty)', () => {
      const primary = glaze(280, 80);
      primary.colors({ surface: { lightness: 97 } });

      const danger = primary.extend({ hue: 23 });

      const palette = glaze.palette({ primary, danger });
      const tokens = palette.tasty({
        prefix: { primary: 'brand-', danger: 'error-' },
      });

      expect(tokens['#brand-surface']).toBeDefined();
      expect(tokens['#error-surface']).toBeDefined();
    });

    it('exports JSON with theme grouping', () => {
      const primary = glaze(280, 80);
      primary.colors({ surface: { lightness: 97 } });

      const danger = primary.extend({ hue: 23 });

      const palette = glaze.palette({ primary, danger });
      const json = palette.json();

      expect(json.primary).toBeDefined();
      expect(json.danger).toBeDefined();
      expect(json.primary.surface.light).toMatch(/^okhsl\(/);
    });

    it('defaults to prefix: true for palette tokens', () => {
      const primary = glaze(280, 80);
      primary.colors({ surface: { lightness: 97 } });

      const danger = primary.extend({ hue: 23 });

      const palette = glaze.palette({ primary, danger });
      const tokens = palette.tokens();

      expect(tokens.light['primary-surface']).toBeDefined();
      expect(tokens.light['danger-surface']).toBeDefined();
      expect(tokens.light['surface']).toBeUndefined();
    });

    it('defaults to prefix: true for palette tasty', () => {
      const primary = glaze(280, 80);
      primary.colors({ surface: { lightness: 97 } });

      const danger = primary.extend({ hue: 23 });

      const palette = glaze.palette({ primary, danger });
      const tokens = palette.tasty();

      expect(tokens['#primary-surface']).toBeDefined();
      expect(tokens['#danger-surface']).toBeDefined();
      expect(tokens['#surface']).toBeUndefined();
    });

    it('duplicates primary theme tokens without prefix (tokens)', () => {
      const primary = glaze(280, 80);
      primary.colors({ surface: { lightness: 97 } });

      const danger = primary.extend({ hue: 23 });

      const palette = glaze.palette({ primary, danger });
      const tokens = palette.tokens({ primary: 'primary' });

      expect(tokens.light['primary-surface']).toBeDefined();
      expect(tokens.light['danger-surface']).toBeDefined();
      expect(tokens.light['surface']).toBeDefined();
      expect(tokens.light['surface']).toBe(tokens.light['primary-surface']);
      expect(tokens.dark['surface']).toBe(tokens.dark['primary-surface']);
    });

    it('duplicates primary theme tokens without prefix (tasty)', () => {
      const primary = glaze(280, 80);
      primary.colors({ surface: { lightness: 97 } });

      const danger = primary.extend({ hue: 23 });

      const palette = glaze.palette({ primary, danger });
      const tokens = palette.tasty({ primary: 'primary' });

      expect(tokens['#primary-surface']).toBeDefined();
      expect(tokens['#danger-surface']).toBeDefined();
      expect(tokens['#surface']).toBeDefined();
      expect(tokens['#surface']['']).toBe(tokens['#primary-surface']['']);
    });

    it('duplicates primary theme tokens without prefix (css)', () => {
      const primary = glaze(280, 80);
      primary.colors({ surface: { lightness: 97 } });

      const danger = primary.extend({ hue: 23 });

      const palette = glaze.palette({ primary, danger });
      const css = palette.css({ primary: 'primary' });

      expect(css.light).toMatch(/--primary-surface-color: rgb\(/);
      expect(css.light).toMatch(/--danger-surface-color: rgb\(/);
      expect(css.light).toMatch(/--surface-color: rgb\(/);
    });

    it('primary works with custom prefix map', () => {
      const brand = glaze(280, 80);
      brand.colors({ surface: { lightness: 97 } });

      const accent = brand.extend({ hue: 23 });

      const palette = glaze.palette({ brand, accent });
      const tokens = palette.tokens({
        prefix: { brand: 'b-', accent: 'a-' },
        primary: 'brand',
      });

      expect(tokens.light['b-surface']).toBeDefined();
      expect(tokens.light['a-surface']).toBeDefined();
      expect(tokens.light['surface']).toBeDefined();
      expect(tokens.light['surface']).toBe(tokens.light['b-surface']);
    });

    it('throws on invalid primary theme name', () => {
      const primary = glaze(280, 80);
      primary.colors({ surface: { lightness: 97 } });

      const palette = glaze.palette({ primary });

      expect(() => palette.tokens({ primary: 'nonexistent' })).toThrow(
        /primary theme "nonexistent" not found/,
      );
      expect(() => palette.tasty({ primary: 'nonexistent' })).toThrow(
        /primary theme "nonexistent" not found/,
      );
      expect(() => palette.css({ primary: 'nonexistent' })).toThrow(
        /primary theme "nonexistent" not found/,
      );
    });

    it('explicit prefix: false disables prefix for palette tokens', () => {
      const primary = glaze(280, 80);
      primary.colors({ surface: { lightness: 97 } });

      const palette = glaze.palette({ primary });
      const tokens = palette.tokens({ prefix: false });

      expect(tokens.light['surface']).toBeDefined();
      expect(tokens.light['primary-surface']).toBeUndefined();
    });
  });

  describe('configure', () => {
    it('updates light lightness window', () => {
      glaze.configure({ lightLightness: [5, 95] });
      const config = glaze.getConfig();
      expect(config.lightLightness).toEqual([5, 95]);
    });

    it('updates dark lightness window', () => {
      glaze.configure({ darkLightness: [5, 95] });
      const config = glaze.getConfig();
      expect(config.darkLightness).toEqual([5, 95]);
    });

    it('updates dark desaturation', () => {
      glaze.configure({ darkDesaturation: 0.2 });
      const config = glaze.getConfig();
      expect(config.darkDesaturation).toBe(0.2);
    });

    it('updates dark curve', () => {
      glaze.configure({ darkCurve: 0.7 });
      const config = glaze.getConfig();
      expect(config.darkCurve).toBe(0.7);
    });

    it('darkCurve defaults to 0.5', () => {
      const config = glaze.getConfig();
      expect(config.darkCurve).toBe(0.5);
    });

    it('updates state aliases', () => {
      glaze.configure({ states: { dark: '@night' } });
      const config = glaze.getConfig();
      expect(config.states.dark).toBe('@night');
      // highContrast should keep default
      expect(config.states.highContrast).toBe('@high-contrast');
    });

    it('updates modes', () => {
      glaze.configure({ modes: { dark: false } });
      const config = glaze.getConfig();
      expect(config.modes.dark).toBe(false);
      expect(config.modes.highContrast).toBe(false); // default is false
    });
  });

  describe('output modes', () => {
    it('defaults to light + dark variants in tokens', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { lightness: 97 } });

      const tokens = theme.tokens();
      expect(Object.keys(tokens)).toEqual(['light', 'dark']);
    });

    it('modes filter variants in tokens', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { lightness: 97 } });

      const tokens = theme.tokens({
        modes: { dark: false, highContrast: true },
      });
      expect(Object.keys(tokens)).toEqual(['light', 'lightContrast']);
    });

    it('light-only mode in tokens', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { lightness: 97 } });

      const tokens = theme.tokens({
        modes: { dark: false, highContrast: false },
      });
      expect(Object.keys(tokens)).toEqual(['light']);
    });

    it('defaults to light + dark (2 states) in tasty', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { lightness: 97 } });

      const tokens = theme.tasty();
      expect(Object.keys(tokens['#surface'])).toHaveLength(2);
    });

    it('modes: { dark: false, highContrast: true } omits dark from tasty', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { lightness: 97 } });

      const tokens = theme.tasty({
        modes: { dark: false, highContrast: true },
      });
      const keys = Object.keys(tokens['#surface']);
      expect(keys).toContain('');
      expect(keys).toContain('@high-contrast');
      expect(keys).toHaveLength(2);
    });

    it('modes: { highContrast: false } omits HC from tasty', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { lightness: 97 } });

      const tokens = theme.tasty({ modes: { highContrast: false } });
      const keys = Object.keys(tokens['#surface']);
      expect(keys).toContain('');
      expect(keys).toContain('@dark');
      expect(keys).toHaveLength(2);
    });

    it('modes: { dark: false, highContrast: false } exports light only in tasty', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { lightness: 97 } });

      const tokens = theme.tasty({
        modes: { dark: false, highContrast: false },
      });
      const keys = Object.keys(tokens['#surface']);
      expect(keys).toEqual(['']);
    });

    it('modes work on json() export', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { lightness: 97 } });

      const json = theme.json({ modes: { highContrast: false } });
      const keys = Object.keys(json.surface);
      expect(keys).toContain('light');
      expect(keys).toContain('dark');
      expect(keys).not.toContain('lightContrast');
      expect(keys).not.toContain('darkContrast');
    });

    it('global modes config is respected in tasty', () => {
      glaze.configure({ modes: { highContrast: true } });

      const theme = glaze(280, 80);
      theme.colors({ surface: { lightness: 97 } });

      const tokens = theme.tasty();
      expect(Object.keys(tokens['#surface'])).toHaveLength(4);
    });

    it('per-call modes override global config in tasty', () => {
      glaze.configure({ modes: { dark: false, highContrast: false } });

      const theme = glaze(280, 80);
      theme.colors({ surface: { lightness: 97 } });

      const tokens = theme.tasty({
        modes: { dark: true, highContrast: true },
      });
      expect(Object.keys(tokens['#surface'])).toHaveLength(4);
    });

    it('global modes config is respected in tokens', () => {
      glaze.configure({ modes: { highContrast: true } });

      const theme = glaze(280, 80);
      theme.colors({ surface: { lightness: 97 } });

      const tokens = theme.tokens();
      expect(Object.keys(tokens)).toEqual([
        'light',
        'dark',
        'lightContrast',
        'darkContrast',
      ]);
    });

    it('per-call modes override global config in tokens', () => {
      glaze.configure({ modes: { dark: false, highContrast: false } });

      const theme = glaze(280, 80);
      theme.colors({ surface: { lightness: 97 } });

      const tokens = theme.tokens({
        modes: { dark: true, highContrast: true },
      });
      expect(Object.keys(tokens)).toEqual([
        'light',
        'dark',
        'lightContrast',
        'darkContrast',
      ]);
    });

    it('modes work on palette tokens', () => {
      const primary = glaze(280, 80);
      primary.colors({ surface: { lightness: 97 } });

      const palette = glaze.palette({ primary });
      const tokens = palette.tokens({
        prefix: true,
        modes: { dark: false, highContrast: false },
      });
      expect(Object.keys(tokens)).toEqual(['light']);
      expect(tokens.light['primary-surface']).toBeDefined();
    });

    it('modes work on palette tasty', () => {
      const primary = glaze(280, 80);
      primary.colors({ surface: { lightness: 97 } });

      const palette = glaze.palette({ primary });
      const tokens = palette.tasty({
        prefix: true,
        modes: { dark: false, highContrast: false },
      });
      expect(Object.keys(tokens['#primary-surface'])).toEqual(['']);
    });

    it('modes work on palette json', () => {
      const primary = glaze(280, 80);
      primary.colors({ surface: { lightness: 97 } });

      const palette = glaze.palette({ primary });
      const json = palette.json({
        modes: { dark: false, highContrast: true },
      });
      const keys = Object.keys(json.primary.surface);
      expect(keys).toContain('light');
      expect(keys).toContain('lightContrast');
      expect(keys).not.toContain('dark');
      expect(keys).not.toContain('darkContrast');
    });
  });

  describe('color getter/setter', () => {
    it('sets a single color with .color(name, def)', () => {
      const theme = glaze(280, 80);
      theme.color('surface', { lightness: 97 });

      const resolved = theme.resolve();
      expect(resolved.has('surface')).toBe(true);
      expect(resolved.get('surface')!.light.l).toBeCloseTo(0.97, 2);
    });

    it('gets a color definition with .color(name)', () => {
      const theme = glaze(280, 80);
      theme.color('surface', { lightness: 97, saturation: 0.75 });

      const def = theme.color('surface');
      expect(def).toEqual({ lightness: 97, saturation: 0.75 });
    });

    it('returns undefined for missing color', () => {
      const theme = glaze(280, 80);
      expect(theme.color('nonexistent')).toBeUndefined();
    });
  });

  describe('remove', () => {
    it('removes a single color', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { lightness: 97 }, text: { lightness: 30 } });
      theme.remove('surface');

      expect(theme.has('surface')).toBe(false);
      expect(theme.has('text')).toBe(true);
    });

    it('removes multiple colors', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 97 },
        text: { lightness: 30 },
        bg: { lightness: 100 },
      });
      theme.remove(['surface', 'text']);

      expect(theme.has('surface')).toBe(false);
      expect(theme.has('text')).toBe(false);
      expect(theme.has('bg')).toBe(true);
    });

    it('is a no-op for missing names', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { lightness: 97 } });
      theme.remove('nonexistent');

      expect(theme.list()).toEqual(['surface']);
    });
  });

  describe('has / list', () => {
    it('has() returns true for defined colors', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { lightness: 97 } });

      expect(theme.has('surface')).toBe(true);
      expect(theme.has('text')).toBe(false);
    });

    it('list() returns all defined color names', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { lightness: 97 }, text: { lightness: 30 } });

      expect(theme.list()).toEqual(['surface', 'text']);
    });

    it('list() reflects removals', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { lightness: 97 }, text: { lightness: 30 } });
      theme.remove('surface');

      expect(theme.list()).toEqual(['text']);
    });
  });

  describe('reset', () => {
    it('clears all color definitions', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { lightness: 97 }, text: { lightness: 30 } });
      theme.reset();

      expect(theme.list()).toEqual([]);
    });
  });

  describe('export / from', () => {
    it('exports theme configuration', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { lightness: 97, saturation: 0.75 } });

      const exported = theme.export();
      expect(exported.hue).toBe(280);
      expect(exported.saturation).toBe(80);
      expect(exported.colors.surface).toEqual({
        lightness: 97,
        saturation: 0.75,
      });
    });

    it('round-trips through export/from', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 97, saturation: 0.75 },
        text: { base: 'surface', lightness: '-52', contrast: 'AAA' },
      });

      const exported = theme.export();
      const restored = glaze.from(exported);

      expect(restored.hue).toBe(280);
      expect(restored.saturation).toBe(80);

      const origResolved = theme.resolve();
      const restoredResolved = restored.resolve();

      const origSurface = origResolved.get('surface')!;
      const restoredSurface = restoredResolved.get('surface')!;

      expect(restoredSurface.light.l).toBeCloseTo(origSurface.light.l, 6);
      expect(restoredSurface.dark.l).toBeCloseTo(origSurface.dark.l, 6);
    });

    it('export creates a snapshot (mutations do not affect it)', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { lightness: 97 } });

      const exported = theme.export();
      theme.colors({ newColor: { lightness: 50 } });

      expect(exported.colors).not.toHaveProperty('newColor');
    });
  });

  describe('glaze.color standalone', () => {
    it('resolves a standalone color', () => {
      const color = glaze.color({ hue: 280, saturation: 80, lightness: 52 });
      const resolved = color.resolve();

      expect(resolved.light.h).toBe(280);
      // lightLightness [10, 100]: 52 * 0.9 + 10 = 56.8
      expect(resolved.light.l).toBeCloseTo(0.568, 2);
    });

    it('exports token for a standalone color', () => {
      const color = glaze.color({
        hue: 280,
        saturation: 80,
        lightness: 52,
        mode: 'fixed',
      });
      const token = color.token();

      expect(token['']).toMatch(/^okhsl\(/);
      expect(token['@dark']).toMatch(/^okhsl\(/);
    });

    it('exports tasty for a standalone color', () => {
      const color = glaze.color({
        hue: 280,
        saturation: 80,
        lightness: 52,
        mode: 'fixed',
      });
      const tastyToken = color.tasty();

      expect(tastyToken['']).toMatch(/^okhsl\(/);
      expect(tastyToken['@dark']).toMatch(/^okhsl\(/);
    });

    it('exports json for a standalone color', () => {
      const color = glaze.color({ hue: 280, saturation: 80, lightness: 52 });
      const json = color.json();

      expect(json.light).toMatch(/^okhsl\(/);
      expect(json.dark).toMatch(/^okhsl\(/);
    });

    it('supports format option', () => {
      const color = glaze.color({ hue: 280, saturation: 80, lightness: 52 });

      const rgbToken = color.token({ format: 'rgb' });
      expect(rgbToken['']).toMatch(/^rgb\(/);

      const hslJson = color.json({ format: 'hsl' });
      expect(hslJson.light).toMatch(/^hsl\(/);
    });
  });

  describe('glaze.fromHex / fromRgb', () => {
    it('creates a theme from hex', () => {
      const theme = glaze.fromHex('#7a4dbf');
      expect(theme.hue).toBeGreaterThan(0);
      expect(theme.saturation).toBeGreaterThan(0);
    });

    it('creates a theme from shorthand hex', () => {
      const theme = glaze.fromHex('#f00');
      expect(theme.hue).toBeGreaterThan(0);
      expect(theme.saturation).toBeGreaterThan(0);
    });

    it('throws on invalid hex', () => {
      expect(() => glaze.fromHex('not-a-color')).toThrow('invalid hex');
    });

    it('creates a theme from RGB values', () => {
      const theme = glaze.fromRgb(122, 77, 191);
      expect(theme.hue).toBeGreaterThan(0);
      expect(theme.saturation).toBeGreaterThan(0);
    });

    it('fromHex and fromRgb produce similar results for same color', () => {
      const fromHex = glaze.fromHex('#7a4dbf');
      const fromRgb = glaze.fromRgb(122, 77, 191);

      expect(fromHex.hue).toBeCloseTo(fromRgb.hue, 1);
      expect(fromHex.saturation).toBeCloseTo(fromRgb.saturation, 1);
    });
  });

  describe('format option', () => {
    it('outputs rgb format in tokens', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { lightness: 97 } });

      const tokens = theme.tokens({ format: 'rgb' });
      expect(tokens.light.surface).toMatch(/^rgb\(/);
    });

    it('outputs hsl format in tokens', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { lightness: 97 } });

      const tokens = theme.tokens({ format: 'hsl' });
      expect(tokens.light.surface).toMatch(/^hsl\(/);
    });

    it('outputs oklch format in tokens', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { lightness: 97 } });

      const tokens = theme.tokens({ format: 'oklch' });
      expect(tokens.light.surface).toMatch(/^oklch\(/);
    });

    it('outputs rgb format in tasty', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { lightness: 97 } });

      const tokens = theme.tasty({ format: 'rgb' });
      expect(tokens['#surface']['']).toMatch(/^rgb\(/);
    });

    it('outputs rgb format in json', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { lightness: 97 } });

      const json = theme.json({ format: 'rgb' });
      expect(json.surface.light).toMatch(/^rgb\(/);
    });

    it('outputs format in palette tokens', () => {
      const primary = glaze(280, 80);
      primary.colors({ surface: { lightness: 97 } });

      const palette = glaze.palette({ primary });
      const tokens = palette.tokens({ prefix: true, format: 'rgb' });
      expect(tokens.light['primary-surface']).toMatch(/^rgb\(/);
    });

    it('outputs format in palette tasty', () => {
      const primary = glaze(280, 80);
      primary.colors({ surface: { lightness: 97 } });

      const palette = glaze.palette({ primary });
      const tokens = palette.tasty({ prefix: true, format: 'rgb' });
      expect(tokens['#primary-surface']['']).toMatch(/^rgb\(/);
    });

    it('outputs format in palette json', () => {
      const primary = glaze(280, 80);
      primary.colors({ surface: { lightness: 97 } });

      const palette = glaze.palette({ primary });
      const json = palette.json({ format: 'hsl' });
      expect(json.primary.surface.light).toMatch(/^hsl\(/);
    });

    it('rgb format uses rounded integers with space syntax', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { lightness: 52 } });

      const tokens = theme.tokens({ format: 'rgb' });
      const value = tokens.light.surface;
      // Space syntax: rgb(R G B) with optional decimal places
      expect(value).toMatch(/^rgb\([\d.]+ [\d.]+ [\d.]+\)$/);
    });
  });

  describe('full example from spec', () => {
    it('resolves the full example without errors (tokens)', () => {
      const primary = glaze(280, 80);

      primary.colors({
        surface: { lightness: 97, saturation: 0.75 },
        text: { base: 'surface', lightness: '-52', contrast: 'AAA' },
        border: {
          base: 'surface',
          lightness: ['-7', '-20'],
          contrast: 'AA-large',
        },
        bg: { lightness: 97, saturation: 0.75 },
        icon: { lightness: 60, saturation: 0.94 },
        'accent-fill': { lightness: 52, mode: 'fixed' },
        'accent-text': {
          base: 'accent-fill',
          lightness: '+48',
          contrast: 'AA',
          mode: 'fixed',
        },
        disabled: { lightness: 81, saturation: 0.4 },
      });

      const danger = primary.extend({ hue: 23 });
      const success = primary.extend({ hue: 157 });
      const warning = primary.extend({ hue: 84 });
      const note = primary.extend({ hue: 302 });

      const palette = glaze.palette({
        primary,
        danger,
        success,
        warning,
        note,
      });
      const tokens = palette.tokens({ prefix: true });

      // Verify variant structure (default: dark=true, highContrast=false → light + dark)
      expect(Object.keys(tokens)).toEqual(['light', 'dark']);

      // Verify all expected tokens exist in each variant
      expect(tokens.light['primary-surface']).toBeDefined();
      expect(tokens.light['primary-text']).toBeDefined();
      expect(tokens.light['primary-border']).toBeDefined();
      expect(tokens.light['primary-accent-fill']).toBeDefined();
      expect(tokens.light['primary-accent-text']).toBeDefined();
      expect(tokens.light['danger-surface']).toBeDefined();
      expect(tokens.light['success-surface']).toBeDefined();
      expect(tokens.light['warning-surface']).toBeDefined();
      expect(tokens.light['note-surface']).toBeDefined();
      expect(tokens.light['primary-surface']).toMatch(/^okhsl\(/);
    });

    it('resolves the full example without errors (tasty)', () => {
      const primary = glaze(280, 80);

      primary.colors({
        surface: { lightness: 97, saturation: 0.75 },
        text: { base: 'surface', lightness: '-52', contrast: 'AAA' },
        border: {
          base: 'surface',
          lightness: ['-7', '-20'],
          contrast: 'AA-large',
        },
        bg: { lightness: 97, saturation: 0.75 },
        icon: { lightness: 60, saturation: 0.94 },
        'accent-fill': { lightness: 52, mode: 'fixed' },
        'accent-text': {
          base: 'accent-fill',
          lightness: '+48',
          contrast: 'AA',
          mode: 'fixed',
        },
        disabled: { lightness: 81, saturation: 0.4 },
      });

      const danger = primary.extend({ hue: 23 });
      const success = primary.extend({ hue: 157 });
      const warning = primary.extend({ hue: 84 });
      const note = primary.extend({ hue: 302 });

      const palette = glaze.palette({
        primary,
        danger,
        success,
        warning,
        note,
      });
      const tokens = palette.tasty({ prefix: true });

      // Verify all expected tasty tokens exist
      expect(tokens['#primary-surface']).toBeDefined();
      expect(tokens['#primary-text']).toBeDefined();
      expect(tokens['#primary-border']).toBeDefined();
      expect(tokens['#primary-accent-fill']).toBeDefined();
      expect(tokens['#primary-accent-text']).toBeDefined();
      expect(tokens['#danger-surface']).toBeDefined();
      expect(tokens['#success-surface']).toBeDefined();
      expect(tokens['#warning-surface']).toBeDefined();
      expect(tokens['#note-surface']).toBeDefined();

      // Verify tasty token structure (default: dark=true, highContrast=false → 2 states)
      const surfaceToken = tokens['#primary-surface'];
      expect(Object.keys(surfaceToken)).toHaveLength(2);
      expect(surfaceToken['']).toMatch(/^okhsl\(/);
    });
  });

  describe('css export', () => {
    it('outputs CSS custom properties with default options (rgb format, -color suffix)', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 97, saturation: 0.75 },
        text: { base: 'surface', lightness: '-52', contrast: 'AAA' },
      });

      const css = theme.css();

      // All four variants should be present
      expect(css.light).toBeDefined();
      expect(css.dark).toBeDefined();
      expect(css.lightContrast).toBeDefined();
      expect(css.darkContrast).toBeDefined();

      // Should use rgb format by default
      expect(css.light).toMatch(/^--surface-color: rgb\(/);
      expect(css.light).toMatch(/--text-color: rgb\(/);

      // Each variant should have two lines (one per color)
      expect(css.light.split('\n')).toHaveLength(2);
      expect(css.dark.split('\n')).toHaveLength(2);

      // Lines should end with semicolons
      for (const line of css.light.split('\n')) {
        expect(line).toMatch(/;$/);
      }
    });

    it('respects custom format option', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { lightness: 97 } });

      const css = theme.css({ format: 'okhsl' });
      expect(css.light).toMatch(/--surface-color: okhsl\(/);

      const cssHsl = theme.css({ format: 'hsl' });
      expect(cssHsl.light).toMatch(/--surface-color: hsl\(/);

      const cssOklch = theme.css({ format: 'oklch' });
      expect(cssOklch.light).toMatch(/--surface-color: oklch\(/);
    });

    it('respects custom suffix option', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { lightness: 97 } });

      const css = theme.css({ suffix: '' });
      expect(css.light).toMatch(/^--surface: rgb\(/);

      const cssBg = theme.css({ suffix: '-bg' });
      expect(cssBg.light).toMatch(/^--surface-bg: rgb\(/);
    });

    it('produces different values for light and dark variants', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { lightness: 97 } });

      const css = theme.css();
      expect(css.light).not.toBe(css.dark);
    });

    it('works with palette and prefix', () => {
      const primary = glaze(280, 80);
      primary.colors({ surface: { lightness: 97 } });

      const danger = primary.extend({ hue: 23 });

      const palette = glaze.palette({ primary, danger });
      const css = palette.css({ prefix: true });

      expect(css.light).toMatch(/--primary-surface-color: rgb\(/);
      expect(css.light).toMatch(/--danger-surface-color: rgb\(/);
    });

    it('works with palette and custom prefix map', () => {
      const primary = glaze(280, 80);
      primary.colors({ surface: { lightness: 97 } });

      const danger = primary.extend({ hue: 23 });

      const palette = glaze.palette({ primary, danger });
      const css = palette.css({ prefix: { primary: 'p-', danger: 'd-' } });

      expect(css.light).toMatch(/--p-surface-color: rgb\(/);
      expect(css.light).toMatch(/--d-surface-color: rgb\(/);
    });

    it('works with palette without prefix (explicit false)', () => {
      const primary = glaze(280, 80);
      primary.colors({ surface: { lightness: 97 } });

      const palette = glaze.palette({ primary });
      const css = palette.css({ prefix: false });

      expect(css.light).toMatch(/--surface-color: rgb\(/);
      expect(css.light).not.toMatch(/--primary-/);
    });

    it('defaults to prefix: true for palette css', () => {
      const primary = glaze(280, 80);
      primary.colors({ surface: { lightness: 97 } });

      const palette = glaze.palette({ primary });
      const css = palette.css();

      expect(css.light).toMatch(/--primary-surface-color: rgb\(/);
    });
  });

  describe('shadow colors', () => {
    it('resolves shadow color with alpha < 1', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 95 },
        text: { lightness: 15, base: 'surface', contrast: 'AA' },
        'shadow-md': {
          type: 'shadow',
          bg: 'surface',
          fg: 'text',
          intensity: 10,
        },
      });

      const resolved = theme.resolve();
      const shadow = resolved.get('shadow-md')!;

      expect(shadow.light.alpha).toBeLessThan(1);
      expect(shadow.light.alpha).toBeGreaterThan(0);
      expect(shadow.dark.alpha).toBeLessThan(1);
      expect(shadow.dark.alpha).toBeGreaterThan(0);
    });

    it('achromatic shadow (no fg) has s=0 and contrastWeight=1', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 95 },
        'drop-shadow': { type: 'shadow', bg: 'surface', intensity: 12 },
      });

      const resolved = theme.resolve();
      const shadow = resolved.get('drop-shadow')!;

      expect(shadow.light.s).toBe(0);
      expect(shadow.light.alpha).toBeGreaterThan(0);
    });

    it('low-contrast fg produces softer shadow', () => {
      const theme = glaze(0, 0);
      theme.colors({
        surface: { lightness: 95 },
        text: { lightness: 20, base: 'surface', contrast: 'AA' },
        'subtle-bg': { lightness: 80 },
        'shadow-a': {
          type: 'shadow',
          bg: 'surface',
          fg: 'text',
          intensity: 10,
        },
        'shadow-b': {
          type: 'shadow',
          bg: 'surface',
          fg: 'subtle-bg',
          intensity: 10,
        },
      });

      const resolved = theme.resolve();
      const a = resolved.get('shadow-a')!;
      const b = resolved.get('shadow-b')!;

      expect(a.light.alpha).toBeGreaterThan(b.light.alpha);
    });

    it('HC intensity pair uses second value for high-contrast', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 95 },
        text: { lightness: 15, base: 'surface', contrast: 'AA' },
        'shadow-card': {
          type: 'shadow',
          bg: 'surface',
          fg: 'text',
          intensity: [10, 20],
        },
      });

      const resolved = theme.resolve();
      const shadow = resolved.get('shadow-card')!;

      expect(shadow.lightContrast.alpha).toBeGreaterThan(shadow.light.alpha);
    });

    it('intensity 0 produces alpha 0', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 95 },
        'shadow-zero': { type: 'shadow', bg: 'surface', intensity: 0 },
      });

      const resolved = theme.resolve();
      const shadow = resolved.get('shadow-zero')!;

      expect(shadow.light.alpha).toBe(0);
    });

    it('negative intensity is clamped to 0', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 95 },
        'shadow-neg': { type: 'shadow', bg: 'surface', intensity: -5 },
      });

      const resolved = theme.resolve();
      const shadow = resolved.get('shadow-neg')!;

      expect(shadow.light.alpha).toBe(0);
    });

    it('intensity above 100 is clamped to 100', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 95 },
        text: { lightness: 15, base: 'surface', contrast: 'AA' },
        'shadow-over': {
          type: 'shadow',
          bg: 'surface',
          fg: 'text',
          intensity: 200,
        },
        'shadow-max': {
          type: 'shadow',
          bg: 'surface',
          fg: 'text',
          intensity: 100,
        },
      });

      const resolved = theme.resolve();
      const over = resolved.get('shadow-over')!.light.alpha;
      const max = resolved.get('shadow-max')!.light.alpha;

      expect(over).toBeCloseTo(max, 6);
    });

    it('shadow resolved color has no mode property', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 95 },
        'shadow-md': { type: 'shadow', bg: 'surface', intensity: 10 },
      });

      const resolved = theme.resolve();
      const shadow = resolved.get('shadow-md')!;

      expect(shadow.mode).toBeUndefined();
    });

    it('shadow levels are well-separated', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 95 },
        text: { lightness: 15, base: 'surface', contrast: 'AA' },
        'shadow-sm': {
          type: 'shadow',
          bg: 'surface',
          fg: 'text',
          intensity: 5,
        },
        'shadow-md': {
          type: 'shadow',
          bg: 'surface',
          fg: 'text',
          intensity: 10,
        },
        'shadow-lg': {
          type: 'shadow',
          bg: 'surface',
          fg: 'text',
          intensity: 20,
        },
      });

      const resolved = theme.resolve();
      const sm = resolved.get('shadow-sm')!.light.alpha;
      const md = resolved.get('shadow-md')!.light.alpha;
      const lg = resolved.get('shadow-lg')!.light.alpha;

      expect(sm).toBeLessThan(md);
      expect(md).toBeLessThan(lg);
    });

    it('shadow alpha never exceeds alphaMax', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 95 },
        text: { lightness: 15, base: 'surface', contrast: 'AA' },
        'shadow-max': {
          type: 'shadow',
          bg: 'surface',
          fg: 'text',
          intensity: 100,
        },
      });

      const resolved = theme.resolve();
      const shadow = resolved.get('shadow-max')!;

      expect(shadow.light.alpha).toBeLessThanOrEqual(1.0);
    });

    it('intensity=100 with max contrast reaches alphaMax', () => {
      const theme = glaze(0, 0);
      theme.colors({
        white: { lightness: 100, mode: 'static' },
        black: { lightness: 0, mode: 'static' },
        'shadow-full': {
          type: 'shadow',
          bg: 'white',
          fg: 'black',
          intensity: 100,
        },
      });

      const resolved = theme.resolve();
      const shadow = resolved.get('shadow-full')!;

      expect(shadow.light.alpha).toBeCloseTo(1.0, 6);
    });

    it('intensity=100 with custom alphaMax reaches that value', () => {
      const theme = glaze(0, 0);
      theme.colors({
        white: { lightness: 100, mode: 'static' },
        black: { lightness: 0, mode: 'static' },
        'shadow-capped': {
          type: 'shadow',
          bg: 'white',
          fg: 'black',
          intensity: 100,
          tuning: { alphaMax: 0.5 },
        },
      });

      const resolved = theme.resolve();
      const shadow = resolved.get('shadow-capped')!;

      expect(shadow.light.alpha).toBeCloseTo(0.5, 6);
    });

    it('shadow output includes alpha in formatted tokens', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 95 },
        text: { lightness: 15, base: 'surface', contrast: 'AA' },
        'shadow-md': {
          type: 'shadow',
          bg: 'surface',
          fg: 'text',
          intensity: 10,
        },
      });

      const tokens = theme.tokens({ format: 'oklch' });
      expect(tokens.light['shadow-md']).toMatch(/\/ [\d.]+\)$/);
    });

    it('shadow output includes alpha in CSS export', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 95 },
        'shadow-md': { type: 'shadow', bg: 'surface', intensity: 10 },
      });

      const css = theme.css({ format: 'oklch' });
      expect(css.light).toMatch(/--shadow-md-color:.*\/ [\d.]+\)/);
    });

    it('shadow output includes alpha in tasty export', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 95 },
        'shadow-md': { type: 'shadow', bg: 'surface', intensity: 10 },
      });

      const tokens = theme.tasty({ format: 'rgb' });
      expect(tokens['#shadow-md']['']).toMatch(/\/ [\d.]+\)$/);
    });

    it('shadow adapts to dark scheme (higher alpha on dark bg)', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 95 },
        text: { lightness: 15, base: 'surface', contrast: 'AA' },
        'shadow-md': {
          type: 'shadow',
          bg: 'surface',
          fg: 'text',
          intensity: 10,
        },
      });

      const resolved = theme.resolve();
      const shadow = resolved.get('shadow-md')!;

      expect(shadow.dark.alpha).toBeGreaterThan(shadow.light.alpha);
    });

    it('per-color tuning overrides defaults', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 95 },
        'shadow-a': {
          type: 'shadow',
          bg: 'surface',
          intensity: 10,
        },
        'shadow-b': {
          type: 'shadow',
          bg: 'surface',
          intensity: 10,
          tuning: { alphaMax: 0.3 },
        },
      });

      const resolved = theme.resolve();
      const a = resolved.get('shadow-a')!.light.alpha;
      const b = resolved.get('shadow-b')!.light.alpha;

      expect(b).toBeLessThan(a);
    });

    it('global shadowTuning config is respected', () => {
      glaze.configure({ shadowTuning: { alphaMax: 0.3 } });

      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 95 },
        'shadow-md': { type: 'shadow', bg: 'surface', intensity: 10 },
      });

      const resolved = theme.resolve();
      const shadow = resolved.get('shadow-md')!;

      expect(shadow.light.alpha).toBeLessThan(0.3 + 0.001);
    });
  });

  describe('shadow validation', () => {
    it('throws when bg references non-existent color', () => {
      const theme = glaze(280, 80);
      theme.colors({
        'shadow-md': {
          type: 'shadow',
          bg: 'nonexistent',
          intensity: 10,
        },
      });

      expect(() => theme.resolve()).toThrow('non-existent bg');
    });

    it('throws when fg references non-existent color', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 95 },
        'shadow-md': {
          type: 'shadow',
          bg: 'surface',
          fg: 'nonexistent',
          intensity: 10,
        },
      });

      expect(() => theme.resolve()).toThrow('non-existent fg');
    });

    it('throws when bg references another shadow color', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 95 },
        'shadow-a': { type: 'shadow', bg: 'surface', intensity: 5 },
        'shadow-b': {
          type: 'shadow',
          bg: 'shadow-a',
          intensity: 10,
        },
      });

      expect(() => theme.resolve()).toThrow('another shadow');
    });

    it('throws when fg references another shadow color', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 95 },
        'shadow-a': { type: 'shadow', bg: 'surface', intensity: 5 },
        'shadow-b': {
          type: 'shadow',
          bg: 'surface',
          fg: 'shadow-a',
          intensity: 10,
        },
      });

      expect(() => theme.resolve()).toThrow('another shadow');
    });

    it('throws when regular color base references a shadow color', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 95 },
        'shadow-md': { type: 'shadow', bg: 'surface', intensity: 10 },
        derived: { base: 'shadow-md', lightness: '-10' },
      });

      expect(() => theme.resolve()).toThrow('shadow color');
    });

    it('detects circular dependency involving shadow dependencies', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { base: 'text', lightness: '+50' },
        text: { base: 'surface', lightness: '-50' },
        'shadow-md': {
          type: 'shadow',
          bg: 'surface',
          fg: 'text',
          intensity: 10,
        },
      });

      expect(() => theme.resolve()).toThrow('circular');
    });
  });

  describe('opacity (regular colors)', () => {
    it('regular color with opacity has alpha < 1', () => {
      const theme = glaze(280, 80);
      theme.colors({
        overlay: { lightness: 0, opacity: 0.5 },
      });

      const resolved = theme.resolve();
      const overlay = resolved.get('overlay')!;

      expect(overlay.light.alpha).toBe(0.5);
      expect(overlay.dark.alpha).toBe(0.5);
    });

    it('opacity appears in formatted output', () => {
      const theme = glaze(280, 80);
      theme.colors({
        overlay: { lightness: 0, opacity: 0.5 },
      });

      const tokens = theme.tokens({ format: 'oklch' });
      expect(tokens.light.overlay).toMatch(/\/ 0\.5\)$/);
    });

    it('regular color without opacity has alpha 1', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { lightness: 97 } });

      const resolved = theme.resolve();
      const surface = resolved.get('surface')!;

      expect(surface.light.alpha).toBe(1);
    });

    it('warns when contrast and opacity are combined', () => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 97 },
        text: {
          base: 'surface',
          lightness: '-52',
          contrast: 'AA',
          opacity: 0.8,
        },
      });

      theme.resolve();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('contrast'));

      warnSpy.mockRestore();
    });
  });

  describe('glaze.shadow() standalone', () => {
    it('computes shadow from hex inputs', () => {
      const v = glaze.shadow({
        bg: '#f0eef5',
        fg: '#1a1a2e',
        intensity: 10,
      });

      expect(v.alpha).toBeGreaterThan(0);
      expect(v.alpha).toBeLessThan(1);
      expect(v.l).toBeLessThan(0.5);
    });

    it('computes shadow from OKHSL inputs', () => {
      const v = glaze.shadow({
        bg: { h: 280, s: 0.6, l: 0.95 },
        fg: { h: 280, s: 0.6, l: 0.2 },
        intensity: 10,
      });

      expect(v.alpha).toBeGreaterThan(0);
      expect(v.alpha).toBeLessThan(1);
    });

    it('achromatic standalone shadow (no fg)', () => {
      const v = glaze.shadow({
        bg: { h: 280, s: 0.6, l: 0.95 },
        intensity: 10,
      });

      expect(v.s).toBe(0);
      expect(v.alpha).toBeGreaterThan(0);
    });

    it('throws on invalid hex input', () => {
      expect(() =>
        glaze.shadow({
          bg: '#invalid' as `#${string}`,
          intensity: 10,
        }),
      ).toThrow('invalid hex');
    });
  });

  describe('glaze.format()', () => {
    it('formats a resolved variant', () => {
      const v = glaze.shadow({
        bg: { h: 280, s: 0.6, l: 0.95 },
        intensity: 10,
      });

      const okhsl = glaze.format(v, 'okhsl');
      expect(okhsl).toMatch(/^okhsl\(/);
      expect(okhsl).toMatch(/\/ [\d.]+\)$/);
    });

    it('formats without alpha when alpha >= 1', () => {
      const v: ResolvedColorVariant = {
        h: 280,
        s: 0.6,
        l: 0.95,
        alpha: 1,
      };

      const css = glaze.format(v, 'rgb');
      expect(css).not.toContain('/');
    });

    it('defaults to okhsl format', () => {
      const v: ResolvedColorVariant = {
        h: 280,
        s: 0.6,
        l: 0.95,
        alpha: 1,
      };

      const css = glaze.format(v);
      expect(css).toMatch(/^okhsl\(/);
    });
  });

  describe('shadow with extend and serialization', () => {
    it('inherited shadow reacts to overridden colors in child themes', () => {
      const primary = glaze(280, 80);
      primary.colors({
        surface: { lightness: 95 },
        text: { lightness: 15, base: 'surface', contrast: 'AA' },
        'shadow-md': {
          type: 'shadow',
          bg: 'surface',
          fg: 'text',
          intensity: 10,
        },
      });

      const danger = primary.extend({ hue: 23 });
      const primaryResolved = primary.resolve();
      const dangerResolved = danger.resolve();

      const primaryShadow = primaryResolved.get('shadow-md')!;
      const dangerShadow = dangerResolved.get('shadow-md')!;

      expect(dangerShadow.light.alpha).toBeGreaterThan(0);
      expect(dangerShadow.light.h).not.toBeCloseTo(primaryShadow.light.h, 0);
    });

    it('shadow defs round-trip through export/from', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 95 },
        'shadow-md': { type: 'shadow', bg: 'surface', intensity: 10 },
      });

      const exported = theme.export();
      const restored = glaze.from(exported);

      const origResolved = theme.resolve();
      const restoredResolved = restored.resolve();

      const origShadow = origResolved.get('shadow-md')!;
      const restoredShadow = restoredResolved.get('shadow-md')!;

      expect(restoredShadow.light.alpha).toBeCloseTo(origShadow.light.alpha, 6);
    });
  });

  describe('mix colors', () => {
    describe('opaque blend', () => {
      it('resolves a 50/50 opaque mix between two colors', () => {
        const theme = glaze(0, 0);
        theme.colors({
          white: { lightness: 100 },
          black: { lightness: 0 },
          mid: { type: 'mix', base: 'white', target: 'black', value: 50 },
        });

        const resolved = theme.resolve();
        const base = resolved.get('white')!;
        const target = resolved.get('black')!;
        const mid = resolved.get('mid')!;

        const expectedL = (base.light.l + target.light.l) / 2;
        expect(mid.light.alpha).toBe(1);
        expect(mid.light.l).toBeCloseTo(expectedL, 4);
      });

      it('value 0 produces pure base color', () => {
        const theme = glaze(280, 80);
        theme.colors({
          surface: { lightness: 95 },
          accent: { lightness: 30 },
          result: {
            type: 'mix',
            base: 'surface',
            target: 'accent',
            value: 0,
          },
        });

        const resolved = theme.resolve();
        const base = resolved.get('surface')!;
        const result = resolved.get('result')!;

        expect(result.light.l).toBeCloseTo(base.light.l, 6);
        expect(result.light.s).toBeCloseTo(base.light.s, 6);
      });

      it('value 100 produces pure target color', () => {
        const theme = glaze(280, 80);
        theme.colors({
          surface: { lightness: 95 },
          accent: { lightness: 30 },
          result: {
            type: 'mix',
            base: 'surface',
            target: 'accent',
            value: 100,
          },
        });

        const resolved = theme.resolve();
        const target = resolved.get('accent')!;
        const result = resolved.get('result')!;

        expect(result.light.l).toBeCloseTo(target.light.l, 6);
        expect(result.light.s).toBeCloseTo(target.light.s, 6);
      });

      it('always produces alpha = 1 in opaque mode', () => {
        const theme = glaze(280, 80);
        theme.colors({
          a: { lightness: 90 },
          b: { lightness: 20 },
          mixed: { type: 'mix', base: 'a', target: 'b', value: 30 },
        });

        const resolved = theme.resolve();
        const mixed = resolved.get('mixed')!;

        expect(mixed.light.alpha).toBe(1);
        expect(mixed.dark.alpha).toBe(1);
      });

      it('adapts to dark scheme via resolved base and target', () => {
        const theme = glaze(280, 80);
        theme.colors({
          surface: { lightness: 95 },
          accent: { lightness: 30 },
          mixed: {
            type: 'mix',
            base: 'surface',
            target: 'accent',
            value: 50,
          },
        });

        const resolved = theme.resolve();
        const mixed = resolved.get('mixed')!;

        expect(mixed.light.l).not.toBeCloseTo(mixed.dark.l, 1);
      });
    });

    describe('transparent blend', () => {
      it('produces target color with alpha = value/100', () => {
        const theme = glaze(280, 80);
        theme.colors({
          bg: { lightness: 95 },
          fg: { lightness: 20 },
          overlay: {
            type: 'mix',
            base: 'bg',
            target: 'fg',
            value: 40,
            blend: 'transparent',
          },
        });

        const resolved = theme.resolve();
        const fg = resolved.get('fg')!;
        const overlay = resolved.get('overlay')!;

        expect(overlay.light.h).toBeCloseTo(fg.light.h, 6);
        expect(overlay.light.s).toBeCloseTo(fg.light.s, 6);
        expect(overlay.light.l).toBeCloseTo(fg.light.l, 6);
        expect(overlay.light.alpha).toBeCloseTo(0.4, 6);
      });

      it('value 0 produces fully transparent', () => {
        const theme = glaze(280, 80);
        theme.colors({
          bg: { lightness: 95 },
          fg: { lightness: 20 },
          overlay: {
            type: 'mix',
            base: 'bg',
            target: 'fg',
            value: 0,
            blend: 'transparent',
          },
        });

        const resolved = theme.resolve();
        const overlay = resolved.get('overlay')!;

        expect(overlay.light.alpha).toBeCloseTo(0, 6);
      });

      it('value 100 produces fully opaque target', () => {
        const theme = glaze(280, 80);
        theme.colors({
          bg: { lightness: 95 },
          fg: { lightness: 20 },
          overlay: {
            type: 'mix',
            base: 'bg',
            target: 'fg',
            value: 100,
            blend: 'transparent',
          },
        });

        const resolved = theme.resolve();
        const overlay = resolved.get('overlay')!;

        expect(overlay.light.alpha).toBeCloseTo(1, 6);
      });
    });

    describe('contrast solving', () => {
      it('adjusts opaque mix ratio to meet contrast target', () => {
        const theme = glaze(0, 0);
        theme.colors({
          surface: { lightness: 95 },
          accent: { lightness: 85 },
          result: {
            type: 'mix',
            base: 'surface',
            target: 'accent',
            value: 10,
            contrast: 'AA',
          },
        });

        const resolved = theme.resolve();
        const result = resolved.get('result')!;

        expect(result.light.alpha).toBe(1);
        expect(result.light.l).not.toBeCloseTo(0.95 * 0.9 + 0.85 * 0.1, 1);
      });

      it('adjusts transparent opacity to meet contrast target', () => {
        const theme = glaze(0, 0);
        theme.colors({
          surface: { lightness: 95 },
          overlay: { lightness: 10 },
          result: {
            type: 'mix',
            base: 'surface',
            target: 'overlay',
            value: 5,
            blend: 'transparent',
            contrast: 3,
          },
        });

        const resolved = theme.resolve();
        const result = resolved.get('result')!;

        expect(result.light.alpha).toBeGreaterThan(0.05);
      });

      it('supports HCPair for contrast in mix colors', () => {
        const theme = glaze(0, 0);
        glaze.configure({ modes: { highContrast: true } });
        theme.colors({
          surface: { lightness: 95 },
          accent: { lightness: 10 },
          result: {
            type: 'mix',
            base: 'surface',
            target: 'accent',
            value: 10,
            contrast: [3, 'AAA'],
          },
        });

        const resolved = theme.resolve();
        const result = resolved.get('result')!;

        expect(result.lightContrast.l).toBeLessThan(result.light.l);
      });
    });

    describe('HCPair value', () => {
      it('uses different mix values for normal and high-contrast', () => {
        const theme = glaze(0, 0);
        glaze.configure({ modes: { highContrast: true } });
        theme.colors({
          a: { lightness: 90 },
          b: { lightness: 10 },
          mixed: { type: 'mix', base: 'a', target: 'b', value: [20, 80] },
        });

        const resolved = theme.resolve();
        const mixed = resolved.get('mixed')!;

        expect(mixed.lightContrast.l).toBeLessThan(mixed.light.l);
      });
    });

    describe('mix-on-mix chaining', () => {
      it('resolves a mix that references another mix color', () => {
        const theme = glaze(280, 80);
        theme.colors({
          white: { lightness: 100 },
          black: { lightness: 0 },
          gray: { type: 'mix', base: 'white', target: 'black', value: 50 },
          lightGray: {
            type: 'mix',
            base: 'white',
            target: 'gray',
            value: 50,
          },
        });

        const resolved = theme.resolve();
        const gray = resolved.get('gray')!;
        const lightGray = resolved.get('lightGray')!;

        expect(lightGray.light.l).toBeGreaterThan(gray.light.l);
      });
    });

    describe('achromatic hue handling', () => {
      it('uses target hue when base has no saturation (e.g. white)', () => {
        const theme = glaze(280, 80);
        theme.colors({
          white: { lightness: 100, saturation: 0 },
          blue: { lightness: 50, hue: 240 },
          tint: {
            type: 'mix',
            base: 'white',
            target: 'blue',
            value: 30,
          },
        });

        const resolved = theme.resolve();
        const blue = resolved.get('blue')!;
        const tint = resolved.get('tint')!;

        expect(tint.light.h).toBeCloseTo(blue.light.h, 1);
      });

      it('uses base hue when target has no saturation (e.g. black)', () => {
        const theme = glaze(280, 80);
        theme.colors({
          blue: { lightness: 50, hue: 240 },
          black: { lightness: 0, saturation: 0 },
          shade: {
            type: 'mix',
            base: 'blue',
            target: 'black',
            value: 30,
          },
        });

        const resolved = theme.resolve();
        const blue = resolved.get('blue')!;
        const shade = resolved.get('shade')!;

        expect(shade.light.h).toBeCloseTo(blue.light.h, 1);
      });

      it('uses circularLerp when both have saturation', () => {
        const theme = glaze(280, 80);
        theme.colors({
          red: { lightness: 50, hue: 0 },
          blue: { lightness: 50, hue: 240 },
          mixed: {
            type: 'mix',
            base: 'red',
            target: 'blue',
            value: 50,
          },
        });

        const resolved = theme.resolve();
        const red = resolved.get('red')!;
        const blue = resolved.get('blue')!;
        const mixed = resolved.get('mixed')!;

        expect(mixed.light.h).not.toBeCloseTo(red.light.h, 1);
        expect(mixed.light.h).not.toBeCloseTo(blue.light.h, 1);
      });
    });

    describe('blend space', () => {
      it('srgb blend produces a valid color', () => {
        const theme = glaze(280, 80);
        theme.colors({
          surface: { lightness: 90 },
          accent: { lightness: 30 },
          mixed: {
            type: 'mix',
            base: 'surface',
            target: 'accent',
            value: 50,
            space: 'srgb',
          },
        });

        const resolved = theme.resolve();
        const mixed = resolved.get('mixed')!;

        expect(mixed.light.alpha).toBe(1);
        expect(mixed.light.l).toBeGreaterThan(0);
        expect(mixed.light.l).toBeLessThan(1);
        expect(mixed.light.s).toBeGreaterThanOrEqual(0);
        expect(mixed.light.s).toBeLessThanOrEqual(1);
      });

      it('srgb blend differs from okhsl blend', () => {
        const theme = glaze(280, 80);
        theme.colors({
          a: { lightness: 90 },
          b: { lightness: 20 },
          okhslMix: {
            type: 'mix',
            base: 'a',
            target: 'b',
            value: 50,
          },
          srgbMix: {
            type: 'mix',
            base: 'a',
            target: 'b',
            value: 50,
            space: 'srgb',
          },
        });

        const resolved = theme.resolve();
        const okhslMix = resolved.get('okhslMix')!;
        const srgbMix = resolved.get('srgbMix')!;

        const diff = Math.abs(okhslMix.light.l - srgbMix.light.l);
        expect(diff).toBeGreaterThan(0.001);
      });

      it('srgb value=0 produces pure base', () => {
        const theme = glaze(280, 80);
        theme.colors({
          surface: { lightness: 90 },
          accent: { lightness: 20 },
          mixed: {
            type: 'mix',
            base: 'surface',
            target: 'accent',
            value: 0,
            space: 'srgb',
          },
        });

        const resolved = theme.resolve();
        const base = resolved.get('surface')!;
        const mixed = resolved.get('mixed')!;

        expect(mixed.light.l).toBeCloseTo(base.light.l, 3);
        expect(mixed.light.s).toBeCloseTo(base.light.s, 3);
      });

      it('srgb value=100 produces pure target', () => {
        const theme = glaze(280, 80);
        theme.colors({
          surface: { lightness: 90 },
          accent: { lightness: 20 },
          mixed: {
            type: 'mix',
            base: 'surface',
            target: 'accent',
            value: 100,
            space: 'srgb',
          },
        });

        const resolved = theme.resolve();
        const target = resolved.get('accent')!;
        const mixed = resolved.get('mixed')!;

        expect(mixed.light.l).toBeCloseTo(target.light.l, 3);
        expect(mixed.light.s).toBeCloseTo(target.light.s, 3);
      });

      it('srgb blend with contrast solving works', () => {
        const theme = glaze(0, 0);
        theme.colors({
          surface: { lightness: 95 },
          overlay: { lightness: 85 },
          result: {
            type: 'mix',
            base: 'surface',
            target: 'overlay',
            value: 10,
            space: 'srgb',
            contrast: 'AA',
          },
        });

        const resolved = theme.resolve();
        const result = resolved.get('result')!;
        expect(result.light.alpha).toBe(1);
      });

      it('space is ignored for transparent blend', () => {
        const theme = glaze(280, 80);
        theme.colors({
          bg: { lightness: 95 },
          fg: { lightness: 20 },
          overlayOkhsl: {
            type: 'mix',
            base: 'bg',
            target: 'fg',
            value: 40,
            blend: 'transparent',
            space: 'okhsl',
          },
          overlaySrgb: {
            type: 'mix',
            base: 'bg',
            target: 'fg',
            value: 40,
            blend: 'transparent',
            space: 'srgb',
          },
        });

        const resolved = theme.resolve();
        const a = resolved.get('overlayOkhsl')!;
        const b = resolved.get('overlaySrgb')!;

        expect(a.light.h).toBeCloseTo(b.light.h, 6);
        expect(a.light.s).toBeCloseTo(b.light.s, 6);
        expect(a.light.l).toBeCloseTo(b.light.l, 6);
        expect(a.light.alpha).toBeCloseTo(b.light.alpha, 6);
      });

      it('srgb blend with white produces clean tint', () => {
        const theme = glaze(280, 80);
        theme.colors({
          blue: { lightness: 50, hue: 240 },
          white: { lightness: 100, saturation: 0 },
          tint: {
            type: 'mix',
            base: 'blue',
            target: 'white',
            value: 50,
            space: 'srgb',
          },
        });

        const resolved = theme.resolve();
        const blue = resolved.get('blue')!;
        const tint = resolved.get('tint')!;

        expect(tint.light.l).toBeGreaterThan(blue.light.l);
        expect(tint.light.alpha).toBe(1);
      });
    });
  });

  describe('mix validation', () => {
    it('throws when base references non-existent color', () => {
      const theme = glaze(280, 80);
      theme.colors({
        accent: { lightness: 30 },
        result: {
          type: 'mix',
          base: 'nonexistent',
          target: 'accent',
          value: 50,
        },
      });

      expect(() => theme.resolve()).toThrow('non-existent base');
    });

    it('throws when target references non-existent color', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 95 },
        result: {
          type: 'mix',
          base: 'surface',
          target: 'nonexistent',
          value: 50,
        },
      });

      expect(() => theme.resolve()).toThrow('non-existent target');
    });

    it('throws when base references a shadow color', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 95 },
        'shadow-md': { type: 'shadow', bg: 'surface', intensity: 10 },
        result: {
          type: 'mix',
          base: 'shadow-md',
          target: 'surface',
          value: 50,
        },
      });

      expect(() => theme.resolve()).toThrow('shadow color');
    });

    it('throws when target references a shadow color', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 95 },
        'shadow-md': { type: 'shadow', bg: 'surface', intensity: 10 },
        result: {
          type: 'mix',
          base: 'surface',
          target: 'shadow-md',
          value: 50,
        },
      });

      expect(() => theme.resolve()).toThrow('shadow color');
    });

    it('throws on circular reference between mix colors', () => {
      const theme = glaze(280, 80);
      theme.colors({
        a: { type: 'mix', base: 'b', target: 'b', value: 50 } as any,
        b: { type: 'mix', base: 'a', target: 'a', value: 50 } as any,
      });

      expect(() => theme.resolve()).toThrow('circular');
    });
  });

  describe('mix with export formats', () => {
    it('includes mix colors in tasty token export', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 95 },
        accent: { lightness: 30 },
        mixed: {
          type: 'mix',
          base: 'surface',
          target: 'accent',
          value: 50,
        },
      });

      const tokens = theme.tasty();
      expect(tokens['#mixed']).toBeDefined();
      expect(tokens['#mixed']['']).toBeDefined();
    });

    it('includes mix colors in JSON export', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 95 },
        accent: { lightness: 30 },
        mixed: {
          type: 'mix',
          base: 'surface',
          target: 'accent',
          value: 50,
        },
      });

      const json = theme.json();
      expect(json['mixed']).toBeDefined();
      expect(json['mixed'].light).toBeDefined();
    });

    it('transparent mix includes alpha in tokens export', () => {
      const theme = glaze(280, 80);
      theme.colors({
        bg: { lightness: 95 },
        fg: { lightness: 20 },
        overlay: {
          type: 'mix',
          base: 'bg',
          target: 'fg',
          value: 40,
          blend: 'transparent',
        },
      });

      const tokens = theme.tokens({ format: 'oklch' });
      expect(tokens.light['overlay']).toMatch(/\/ [\d.]+\)$/);
    });

    it('transparent mix includes alpha in CSS export', () => {
      const theme = glaze(280, 80);
      theme.colors({
        bg: { lightness: 95 },
        fg: { lightness: 20 },
        overlay: {
          type: 'mix',
          base: 'bg',
          target: 'fg',
          value: 40,
          blend: 'transparent',
        },
      });

      const css = theme.css({ format: 'oklch' });
      expect(css.light).toMatch(/--overlay-color:.*\/ [\d.]+\)/);
    });

    it('transparent mix includes alpha in tasty export', () => {
      const theme = glaze(280, 80);
      theme.colors({
        bg: { lightness: 95 },
        fg: { lightness: 20 },
        overlay: {
          type: 'mix',
          base: 'bg',
          target: 'fg',
          value: 40,
          blend: 'transparent',
        },
      });

      const tokens = theme.tasty({ format: 'rgb' });
      expect(tokens['#overlay']['']).toMatch(/\/ [\d.]+\)$/);
    });

    it('transparent mix includes alpha in JSON export', () => {
      const theme = glaze(280, 80);
      theme.colors({
        bg: { lightness: 95 },
        fg: { lightness: 20 },
        overlay: {
          type: 'mix',
          base: 'bg',
          target: 'fg',
          value: 40,
          blend: 'transparent',
        },
      });

      const json = theme.json({ format: 'rgb' });
      expect(json['overlay'].light).toMatch(/\/ [\d.]+\)$/);
      expect(json['overlay'].dark).toMatch(/\/ [\d.]+\)$/);
    });

    it('opaque mix does NOT include alpha in export', () => {
      const theme = glaze(280, 80);
      theme.colors({
        bg: { lightness: 95 },
        fg: { lightness: 20 },
        mixed: {
          type: 'mix',
          base: 'bg',
          target: 'fg',
          value: 40,
        },
      });

      const tokens = theme.tasty({ format: 'rgb' });
      expect(tokens['#mixed']['']).not.toContain('/');
    });

    it('serializes and restores mix colors via export/from', () => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { lightness: 95 },
        accent: { lightness: 30 },
        mixed: {
          type: 'mix',
          base: 'surface',
          target: 'accent',
          value: 50,
        },
      });

      const exported = theme.export();
      const restored = glaze.from(exported);

      const origResolved = theme.resolve();
      const restoredResolved = restored.resolve();

      const origMix = origResolved.get('mixed')!;
      const restoredMix = restoredResolved.get('mixed')!;

      expect(restoredMix.light.l).toBeCloseTo(origMix.light.l, 6);
      expect(restoredMix.light.s).toBeCloseTo(origMix.light.s, 6);
      expect(restoredMix.dark.l).toBeCloseTo(origMix.dark.l, 6);
    });
  });
});
