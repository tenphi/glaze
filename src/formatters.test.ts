import { glaze } from './glaze';

/** A pastel theme, so `splitHue` gets past its pastel check. */
function pastelTheme() {
  const theme = glaze(240, 18, { pastel: true });
  theme.colors({
    surface: { tone: 97 },
    accent: { tone: 52, hue: '+20' },
  });
  return theme;
}

describe('output options', () => {
  describe('ignored options are gone from the types', () => {
    // The `@ts-expect-error` directives are the assertions: `pnpm typecheck`
    // runs tsc over the test files too (`tsconfig.test.json`), and an option
    // that came back would leave its directive unused, failing the check. The
    // calls run too, so each one also shows the option is still harmless at
    // runtime for untyped callers.
    it('rejects options a method never read', () => {
      const theme = pastelTheme();
      const p = glaze.palette({ brand: theme });
      const token = glaze.color('#26fcb2', { pastel: true });

      // @ts-expect-error palette.json() has no prefix: it keys by theme name
      p.json({ prefix: true });
      // @ts-expect-error palette.tokens() can't split hue
      p.tokens({ splitHue: true });
      // @ts-expect-error palette.dtcg() can't split hue
      p.dtcg({ splitHue: true });
      // @ts-expect-error palette.dtcgResolver() can't split hue
      p.dtcgResolver({ splitHue: true });
      // @ts-expect-error palette.tailwind() can't split hue
      p.tailwind({ splitHue: true });
      // @ts-expect-error palette hue vars are named after each theme
      p.css({ name: 'brand' });
      // @ts-expect-error palette hue vars are named after each theme
      p.tasty({ name: 'brand' });
      // @ts-expect-error a theme has no theme prefix
      theme.tasty({ prefix: true });
      // @ts-expect-error a token's state map can't carry a hue declaration
      token.tasty({ splitHue: true });
      // @ts-expect-error a token's state map can't carry a hue declaration
      token.token({ splitHue: true });
      // @ts-expect-error a token has no theme hue var to name
      token.tasty({ name: 'brand' });
      // @ts-expect-error a token has no theme prefix
      token.token({ prefix: true });
    });

    it('keeps the options each method reads', () => {
      const theme = pastelTheme();
      const p = glaze.palette({ brand: theme });
      const states = { dark: '@dark' };

      expect(() => {
        theme.tasty({ splitHue: true, name: 'brand', states, format: 'oklch' });
        theme.css({ splitHue: true, name: 'brand', suffix: '' });
        p.tasty({ splitHue: true, prefix: false, primary: false, states });
        p.css({ splitHue: true, prefix: { brand: 'b-' }, suffix: '' });
        p.json({ format: 'rgb', modes: { dark: false } });
        p.tokens({ prefix: { brand: 'b-' }, primary: 'brand' });
        p.tailwind({ prefix: true, namespace: 'c-' });
        glaze.color('#26fcb2').tasty({ states, format: 'okhst' });
      }).not.toThrow();
    });
  });

  describe('splitHue needs oklch', () => {
    const message = "glaze: splitHue requires format 'oklch' (got 'rgb').";

    it('throws on theme.css() and theme.tasty()', () => {
      const theme = pastelTheme();
      expect(() => theme.css({ splitHue: true, format: 'rgb' })).toThrow(
        message,
      );
      expect(() => theme.tasty({ splitHue: true, format: 'rgb' })).toThrow(
        message,
      );
      expect(() => theme.tasty({ splitHue: true, format: 'okhsl' })).toThrow(
        "(got 'okhsl')",
      );
    });

    it('throws on palette.css() and palette.tasty()', () => {
      const p = glaze.palette({ brand: pastelTheme() });
      expect(() => p.css({ splitHue: true, format: 'rgb' })).toThrow(message);
      expect(() => p.tasty({ splitHue: true, format: 'hsl' })).toThrow(
        "glaze: splitHue requires format 'oklch' (got 'hsl').",
      );
    });

    it('throws on token.css()', () => {
      const token = glaze.color('#26fcb2', { pastel: true });
      expect(() =>
        token.css({ name: 'brand', splitHue: true, format: 'rgb' }),
      ).toThrow(message);
    });

    it('throws before the pastel check', () => {
      // A non-pastel theme with `rgb` names the format, the first thing to fix.
      const theme = glaze(240, 18);
      theme.colors({ surface: { tone: 97 } });
      expect(() => theme.css({ splitHue: true, format: 'rgb' })).toThrow(
        message,
      );
    });

    it('leaves other formats alone without splitHue', () => {
      const theme = pastelTheme();
      expect(theme.css({ format: 'rgb', splitHue: false }).light).toBe(
        theme.css({ format: 'rgb' }).light,
      );
      expect(() => theme.tasty({ format: 'okhsl' })).not.toThrow();
    });
  });

  describe('splitHue hue var collisions', () => {
    it('throws when a color sets its own hue under the `name` var', () => {
      const theme = glaze(240, 18, { pastel: true });
      theme.colors({
        surface: { tone: 97 },
        brand: { tone: 52, hue: '+20' },
      });
      const message =
        'glaze: splitHue would declare "--brand-hue" twice: for the theme ' +
        "hue (name: 'brand') and for color \"brand\"'s own hue. One would " +
        'silently override the other. Rename the color or pass a different ' +
        '`name`.';

      expect(() => theme.css({ splitHue: true, name: 'brand' })).toThrow(
        message,
      );
      expect(() => theme.tasty({ splitHue: true, name: 'brand' })).toThrow(
        message,
      );
      // Renaming either side resolves it.
      expect(() => theme.css({ splitHue: true, name: 'base' })).not.toThrow();
    });

    it('catches a color with a from value or a dark hue only', () => {
      const theme = glaze(240, 18, { pastel: true });
      theme.colors({ brand: { from: '#2f5bff' } });
      expect(() => theme.css({ splitHue: true, name: 'brand' })).toThrow(
        /"--brand-hue" twice/,
      );

      const dark = glaze(240, 18, { pastel: true });
      dark.colors({ theme: { tone: 52, darkHue: 90 } });
      // `name` defaults to 'theme'.
      expect(() => dark.css({ splitHue: true })).toThrow(
        /"--theme-hue" twice: for the theme hue \(name: 'theme'\)/,
      );
    });

    it('allows a same-named color that reads the theme hue', () => {
      // No own hue, so no own var: the color references `--brand-hue` itself.
      const theme = glaze(240, 18, { pastel: true });
      theme.colors({ brand: { tone: 52 } });
      const { light } = theme.css({ splitHue: true, name: 'brand' });
      expect(light).toContain('--brand-hue: 240;');
      expect(light).toMatch(/--brand-color: oklch\([^)]*var\(--brand-hue\)\)/);
    });

    it('throws when a palette color takes another theme’s hue var', () => {
      const brand = pastelTheme();
      const accent = glaze(23, 18, { pastel: true });
      accent.colors({ ink: { tone: 40 } });
      const p = glaze.palette({ brand, accent });
      const message =
        'glaze: splitHue would declare "--accent-hue" twice: for color ' +
        '"accent"\'s own hue (theme "brand") and for the hue of theme ' +
        '"accent". One would silently override the other. Rename the color ' +
        'or the theme, or give the theme a prefix that keeps its hue vars ' +
        'apart.';

      expect(() => p.css({ splitHue: true, prefix: false })).toThrow(message);
      expect(() => p.tasty({ splitHue: true, prefix: false })).toThrow(message);
      // The default prefix keeps them apart.
      expect(p.css({ splitHue: true }).light).toContain(
        '--brand-accent-hue: calc(var(--brand-hue) + 20);',
      );
    });

    it('throws when a palette color takes its own theme’s hue var', () => {
      const brand = glaze(240, 18, { pastel: true });
      brand.colors({ brand: { tone: 52, hue: 30 } });
      const p = glaze.palette({ brand });
      expect(() => p.css({ splitHue: true, prefix: false })).toThrow(
        /"--brand-hue" twice: for the hue of theme "brand" and for color "brand"'s own hue \(theme "brand"\)/,
      );
    });

    it('lets a color achromatic in light share the theme var name', () => {
      // Every scheme renders with the light plan, so a color gray in light is
      // a literal oklch() everywhere and never reads a var of its own.
      const theme = glaze(240, 18, { pastel: true });
      theme.colors({
        surface: { tone: 97 },
        brand: { tone: 52, hue: 30, saturation: 0, darkSaturation: 1 },
      });

      const { light, dark } = theme.css({ splitHue: true, name: 'brand' });
      expect(light).toContain('--brand-hue: 240;');
      expect(light).toContain('--brand-color: oklch(0.5961 0 0);');
      expect(dark).toContain('--brand-color: oklch(0.5699 0.0174 30);');
      expect(dark).not.toContain('--brand-hue:');
      expect(
        theme.tasty({ splitHue: true, name: 'brand' })['$brand-hue'],
      ).toEqual({ '': '240' });
    });

    it('emits no dead dark hue var for a color achromatic in light', () => {
      const theme = glaze(240, 18, { pastel: true });
      theme.colors({
        surface: { tone: 97 },
        brand: { tone: 52, hue: 30, saturation: 0, darkSaturation: 1 },
      });

      // The dark set matches light again, so no dark hue block at all.
      expect(theme.css({ splitHue: true }).dark).not.toContain('-hue:');
      expect(theme.tasty({ splitHue: true })).not.toHaveProperty('$brand-hue');
    });

    it('keeps such a color off another theme’s hue var in a palette', () => {
      const b = glaze(200, 18, { pastel: true });
      b.colors({ surface: { tone: 97 } });
      const a = glaze(240, 18, { pastel: true });
      a.colors({
        card: { tone: 95 },
        b: { tone: 52, hue: 30, saturation: 0, darkSaturation: 1 },
      });
      const p = glaze.palette({ b, a });

      // Theme "a"'s gray-in-light color "b" used to declare `--b-hue: 30` in
      // dark, overriding theme "b"'s `--b-hue: 200` for its surface.
      const { light, dark } = p.css({ splitHue: true, prefix: false });
      expect(light).toContain('--b-hue: 200;');
      expect(dark).not.toContain('--b-hue:');
      expect(dark).toContain('--b-color: oklch(0.5699 0.0174 30);');
    });

    it('lets a theme re-declare its own var across passes', () => {
      // `prefix: false` plus a primary runs the primary theme twice with the
      // same (empty) prefix; its hue var is the same declaration both times.
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => void 0);
      try {
        const p = glaze.palette({ brand: pastelTheme() }, { primary: 'brand' });
        expect(() => p.css({ splitHue: true, prefix: false })).not.toThrow();
        // The primary's aliases collide with its own prefix-less tokens.
        expect(warn).toHaveBeenCalled();
      } finally {
        warn.mockRestore();
      }
    });
  });

  describe('splitHue value property collisions', () => {
    const themeFix =
      'One would silently override the other. Rename the color, or pass a ' +
      'different `suffix` or `name`.';

    it('throws when a value lands on its own hue var (suffix -hue)', () => {
      // `--accent-hue: oklch(… var(--accent-hue))` would be a var() cycle.
      expect(() =>
        pastelTheme().css({ splitHue: true, suffix: '-hue' }),
      ).toThrow(
        'glaze: splitHue would declare "--accent-hue" twice: for color ' +
          `"accent"'s own hue and for color "accent"'s value. ${themeFix}`,
      );
    });

    it('throws when a value lands on the theme var', () => {
      const theme = glaze(240, 18, { pastel: true });
      theme.colors({ theme: { tone: 52 }, surface: { tone: 97 } });
      const message =
        'glaze: splitHue would declare "--theme-hue" twice: for the theme ' +
        `hue (name: 'theme') and for color "theme"'s value. ${themeFix}`;
      expect(() => theme.css({ splitHue: true, suffix: '-hue' })).toThrow(
        message,
      );

      // suffix '' with a color named after the var does the same.
      const named = glaze(240, 18, { pastel: true });
      named.colors({ 'theme-hue': { tone: 52 }, surface: { tone: 97 } });
      expect(() => named.css({ splitHue: true, suffix: '' })).toThrow(
        /"--theme-hue" twice: for the theme hue \(name: 'theme'\) and for color "theme-hue"'s value/,
      );
      // Tasty colors compile to `--{name}-color`, clear of the hue vars.
      expect(() => named.tasty({ splitHue: true })).not.toThrow();
    });

    it('throws when a value lands on another color’s hue var', () => {
      const theme = pastelTheme();
      theme.colors({ 'accent-hue': { tone: 40 } });
      expect(() => theme.css({ splitHue: true, suffix: '' })).toThrow(
        /"--accent-hue" twice: for color "accent"'s own hue and for color "accent-hue"'s value/,
      );
    });

    it('allows suffix -hue when nothing lands on a hue var', () => {
      // `surface` reads the theme var and declares no var of its own.
      const theme = glaze(240, 18, { pastel: true });
      theme.colors({ surface: { tone: 97 } });
      expect(theme.css({ splitHue: true, suffix: '-hue' }).light).toBe(
        '--theme-hue: 240;\n' +
          '--surface-hue: oklch(0.97 0.0025 var(--theme-hue));',
      );
    });

    it('throws on a palette value landing on its own hue var', () => {
      const p = glaze.palette({ brand: pastelTheme() });
      expect(() => p.css({ splitHue: true, suffix: '-hue' })).toThrow(
        'glaze: splitHue would declare "--brand-accent-hue" twice: for ' +
          'color "accent"\'s own hue (theme "brand") and for color ' +
          '"accent"\'s value (theme "brand"). One would silently override ' +
          'the other. Rename the color or the theme, or pass a different ' +
          '`suffix` or theme prefix.',
      );
    });

    it('throws on a palette value landing on another theme’s hue var', () => {
      const brand = glaze(240, 18, { pastel: true });
      brand.colors({ surface: { tone: 97 } });
      const ui = glaze(20, 18, { pastel: true });
      ui.colors({ 'brand-hue': { tone: 52 } });
      const p = glaze.palette({ brand, ui });
      expect(() =>
        p.css({ splitHue: true, prefix: false, suffix: '' }),
      ).toThrow(
        /"--brand-hue" twice: for the hue of theme "brand" and for color "brand-hue"'s value \(theme "ui"\)/,
      );
    });

    it('throws on a primary alias landing on another theme’s hue var', () => {
      // The prefixed pass emits `--brand-ui-hue`, a value nothing else
      // declares; the unprefixed alias `--ui-hue` is theme "ui"'s hue var.
      const brand = glaze(240, 18, { pastel: true });
      brand.colors({ ui: { tone: 52 } });
      const ui = glaze(20, 18, { pastel: true });
      ui.colors({ ink: { tone: 40 } });
      const p = glaze.palette({ brand, ui }, { primary: 'brand' });
      expect(() => p.css({ splitHue: true, suffix: '-hue' })).toThrow(
        /"--ui-hue" twice: for the primary alias of color "ui" \(theme "brand"\) and for the hue of theme "ui"/,
      );
      expect(() =>
        p.css({ splitHue: true, suffix: '-hue', primary: false }),
      ).not.toThrow();
    });

    it('throws on token.css() with suffix -hue', () => {
      const token = glaze.color(
        { hue: 240, saturation: 18, tone: 52 },
        { pastel: true },
      );
      expect(() =>
        token.css({ name: 'x', splitHue: true, suffix: '-hue' }),
      ).toThrow(
        'glaze: splitHue would declare "--x-hue" twice: for the hue of token ' +
          '"x" and for the value of token "x". One would silently override ' +
          "the other. Pass a `suffix` other than '-hue'.",
      );
      // A gray token declares no hue var, so its value is the only `--x-hue`.
      const gray = glaze.color('#808080', { pastel: true });
      expect(
        gray.css({ name: 'x', splitHue: true, suffix: '-hue' }).light,
      ).toBe('--x-hue: oklch(0.5999 0 0);');
    });
  });

  describe('splitHue hue values', () => {
    it('rounds a from color’s resolved hue like oklch() output', () => {
      const theme = glaze(280, 80, { pastel: true });
      theme.colors({ logo: { from: '#2f5bff' } });

      expect(theme.css({ splitHue: true }).light).toContain(
        '--logo-hue: 266.16;',
      );
      expect(theme.tasty({ splitHue: true })['$logo-hue']).toEqual({
        '': '266.16',
      });
    });

    it('rounds a standalone token’s hue', () => {
      const token = glaze.color('#26fcb2', { pastel: true });
      const { light } = token.css({ name: 'brand', splitHue: true });
      expect(light).toBe(
        '--brand-hue: 162.47;\n' +
          '--brand-color: oklch(0.8789 0.0572 var(--brand-hue));',
      );
      // The same 2 decimals as the inline oklch() hue.
      expect(token.css({ name: 'brand' }).light).toContain(' 162.47)');
    });

    it('rounds authored absolute and relative hues the same way', () => {
      const theme = glaze(240.123456, 18, { pastel: true });
      theme.colors({
        a: { tone: 52, hue: 30.98765 },
        b: { tone: 52, hue: '+10.555555' },
      });
      const { light } = theme.css({ splitHue: true });
      expect(light).toContain('--theme-hue: 240.12;');
      expect(light).toContain('--a-hue: 30.99;');
      expect(light).toContain('--b-hue: calc(var(--theme-hue) + 10.56);');
    });

    it('keeps a static color at its one hue when it has a darkHue', () => {
      // `mode: 'static'` ignores `darkHue`, as the resolver does; an `auto`
      // color next to it still takes its own.
      const theme = glaze(240, 50, { pastel: true });
      theme.colors({
        pin: { tone: 52, hue: 30, darkHue: 200, mode: 'static' },
        live: { tone: 52, hue: 30, darkHue: 200 },
      });
      const { dark } = theme.css({ splitHue: true });
      expect(dark).toContain('--pin-hue: 30;');
      expect(dark).toContain('--live-hue: 200;');
      // A relative static hue keeps following the theme hue in both schemes.
      const rel = glaze(250, 70, { pastel: true });
      rel.colors({
        a: { tone: 50, mode: 'static', hue: '+30', darkHue: '+90' },
        b: { tone: 50, darkHue: '+90' },
      });
      const out = rel.css({ splitHue: true });
      for (const block of [out.light, out.dark]) {
        expect(block).toContain('--a-hue: calc(var(--theme-hue) + 30);');
      }
      expect(theme.css().dark).toContain(
        '--pin-color: oklch(0.5784 0.0492 30);',
      );
      expect(dark).toContain(
        '--pin-color: oklch(0.5784 0.0492 var(--pin-hue));',
      );
    });
  });
});
