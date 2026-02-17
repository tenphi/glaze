import { glaze } from './glaze';

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
      expect(resolved.get('surface')!.light.l).toBeCloseTo(0.5, 2);
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

      // Light: L=97
      // Dark (auto, inverted): ((100-97) * (90-10)) / 100 + 10 = 3*0.8 + 10 = 12.4
      expect(surface.dark.l).toBeCloseTo(0.124, 2);
    });

    it('fixed mode maps lightness without inversion', () => {
      const theme = glaze(280, 80);
      theme.colors({
        fill: { lightness: 52, mode: 'fixed' },
      });

      const resolved = theme.resolve();
      const fill = resolved.get('fill')!;

      // Fixed: (52 * (90-10)) / 100 + 10 = 52*0.8 + 10 = 51.6
      expect(fill.dark.l).toBeCloseTo(0.516, 2);
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
  });

  describe('configure', () => {
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
      expect(resolved.light.l).toBeCloseTo(0.52, 2);
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

    it('rgb format uses fractional values', () => {
      const theme = glaze(280, 80);
      theme.colors({ surface: { lightness: 52 } });

      const tokens = theme.tokens({ format: 'rgb' });
      const value = tokens.light.surface;
      // Should contain decimal points for fractional precision
      expect(value).toMatch(/\d+\.\d+/);
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

    it('works with palette without prefix', () => {
      const primary = glaze(280, 80);
      primary.colors({ surface: { lightness: 97 } });

      const palette = glaze.palette({ primary });
      const css = palette.css();

      expect(css.light).toMatch(/--surface-color: rgb\(/);
      // No prefix
      expect(css.light).not.toMatch(/--primary-/);
    });
  });
});
