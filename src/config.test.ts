import { getConfigVersion, normalizeToneWindowInput } from './config';
import { glaze } from './glaze';
import { normalizeToneWindow, REF_EPS } from './okhst';
import type { GlazeConfig, GlazeConfigOverride, ToneWindow } from './types';

afterEach(() => {
  glaze.resetConfig();
});

function sampleTheme(config?: Parameters<typeof glaze>[2]) {
  const theme = glaze(280, 80, config);
  theme.colors({
    surface: { tone: 97 },
    text: { base: 'surface', tone: '-52', contrast: 'AA' },
    shade: { type: 'shadow', bg: 'surface', intensity: 8 },
  });
  return theme;
}

describe('glaze.getConfig() snapshot', () => {
  it('is a deep copy: mutating nested fields leaves the live config alone', () => {
    glaze.configure({
      lightTone: { lo: 12, hi: 98, eps: 0.05 },
      shadowTuning: { reach: 0.9 },
      glowTuning: { tint: 0.2 },
    });
    const before = structuredClone(glaze.getConfig());
    const version = getConfigVersion();

    const snap = glaze.getConfig();
    snap.modes.highContrast = true;
    snap.modes.dark = false;
    snap.states.dark = '@dark';
    (snap.lightTone as { lo: number }).lo = 50;
    (snap.darkTone as { hi: number }).hi = 20;
    snap.shadowTuning!.reach = 0.1;
    snap.glowTuning!.tint = 1;

    expect(glaze.getConfig()).toEqual(before);
    expect(getConfigVersion()).toBe(version);
  });

  it("doesn't change theme output when a snapshot is mutated", () => {
    const theme = sampleTheme();
    const tasty = theme.tasty();
    const resolved = structuredClone([...theme.resolve()]);

    const snap = glaze.getConfig();
    snap.modes.highContrast = true;
    snap.states.dark = '@dark';
    (snap.lightTone as { lo: number }).lo = 60;

    expect(theme.tasty()).toEqual(tasty);
    expect([...theme.resolve()]).toEqual(resolved);
  });

  it('detaches the values passed to configure()', () => {
    const lightTone: [number, number] = [12, 98];
    const shadowTuning = { reach: 0.9 };
    glaze.configure({ lightTone, shadowTuning });

    lightTone[0] = 60;
    shadowTuning.reach = 0.1;

    expect(glaze.getConfig().lightTone).toEqual([12, 98]);
    expect(glaze.getConfig().shadowTuning).toEqual({ reach: 0.9 });
  });

  it("theme.getConfig() doesn't alias the live global config", () => {
    for (const theme of [glaze(0, 0), glaze(0, 0, { autoFlip: false })]) {
      const cfg = theme.getConfig();
      cfg.modes.highContrast = true;
      cfg.states.highContrast = '@hc';
      expect(glaze.getConfig().modes.highContrast).toBe(false);
      expect(glaze.getConfig().states.highContrast).toBe(
        '@media(prefers-contrast: more)',
      );
    }
  });

  it("mutating theme.getConfig() doesn't reach the theme's own resolve", () => {
    const untouched = sampleTheme();
    const reference = [...untouched.resolve()];
    const referenceConfig = untouched.getConfig();

    const theme = sampleTheme();
    const mutate = () => {
      const cfg = theme.getConfig();
      // Out of range on purpose: a value written here would skip the 0–1 clamp.
      cfg.darkDesaturation = 5;
      (cfg.lightTone as { lo: number }).lo = 60;
      cfg.pastel = true;
    };

    // Before the first resolve, the mutated object would be the one it uses.
    mutate();
    expect([...theme.resolve()]).toEqual(reference);
    expect(theme.getConfig()).toEqual(referenceConfig);

    // And after an unrelated edit drops the cache.
    mutate();
    theme.colors({});
    expect([...theme.resolve()]).toEqual(reference);
    expect(theme.getConfig()).toEqual(referenceConfig);
    expect(theme.getConfig().darkDesaturation).toBe(0.1);
  });
});

describe('per-instance overrides are copied where they are stored', () => {
  function makeOverride(): GlazeConfigOverride {
    return {
      lightTone: [10, 100],
      darkTone: { lo: 15, hi: 95, eps: 0.05 },
      shadowTuning: { reach: 0.9 },
    };
  }

  /** Mutate every nested field and replace a top-level one. */
  function mutate(override: GlazeConfigOverride): void {
    (override.lightTone as [number, number])[0] = 60;
    (override.darkTone as { hi: number }).hi = 30;
    override.shadowTuning!.reach = 0.1;
    override.darkDesaturation = 0.9;
  }

  /** An unrelated global bump that drops every instance cache. */
  function invalidate(): void {
    glaze.configure({});
  }

  it('glaze(seed, config): resolve(), getConfig(), export() and extend()', () => {
    const override = makeOverride();
    const theme = sampleTheme(override);
    theme.colors({ low: { tone: 0 } });
    const resolved = [...theme.resolve()];
    const config = theme.getConfig();
    const exported = theme.export();
    const child = theme.extend({});
    const childResolved = [...child.resolve()];

    mutate(override);
    invalidate();
    theme.colors({});

    expect([...theme.resolve()]).toEqual(resolved);
    expect(theme.getConfig()).toEqual(config);
    expect(theme.export()).toEqual(exported);
    expect(theme.export().config?.lightTone).toEqual([10, 100]);
    expect([...child.resolve()]).toEqual(childResolved);
  });

  it('extend({ config }) copies the per-extend override', () => {
    const override = makeOverride();
    const child = glaze(0, 80).extend({ config: override });
    child.colors({ a: { tone: 0 }, b: { tone: 100 } });
    const resolved = [...child.resolve()];
    const exported = child.export();

    mutate(override);
    invalidate();

    expect([...child.resolve()]).toEqual(resolved);
    expect(child.export()).toEqual(exported);
  });

  it('glaze.color() structured form: resolve() and export()', () => {
    const override = makeOverride();
    const token = glaze.color({ hue: 0, saturation: 80, tone: 0 }, override);
    const resolved = token.resolve();
    const exported = token.export();

    mutate(override);
    invalidate();

    expect(token.resolve()).toEqual(resolved);
    expect(token.export()).toEqual(exported);
    expect(token.export().config?.lightTone).toEqual([10, 100]);
  });

  it('glaze.color() value form: resolve() and export()', () => {
    const override = makeOverride();
    const token = glaze.color('#336699', override);
    const resolved = token.resolve();
    const exported = token.export();

    mutate(override);
    invalidate();

    expect(token.resolve()).toEqual(resolved);
    expect(token.export()).toEqual(exported);
    expect(token.export().config?.lightTone).toEqual([10, 100]);
  });

  it("still validates the override at resolve, not when it's copied", () => {
    const theme = glaze(0, 0, { lightTone: [90, 20] });
    theme.colors({ a: { tone: 50 } });
    expect(() => theme.resolve()).toThrow(
      'glaze: lightTone lo (90) is above hi (20).',
    );
  });
});

describe('darkDesaturation validation', () => {
  it('clamps configure() values into 0–1', () => {
    glaze.configure({ darkDesaturation: 2 });
    expect(glaze.getConfig().darkDesaturation).toBe(1);
    glaze.configure({ darkDesaturation: -0.5 });
    expect(glaze.getConfig().darkDesaturation).toBe(0);
    glaze.configure({ darkDesaturation: 0.3 });
    expect(glaze.getConfig().darkDesaturation).toBe(0.3);
  });

  it('a clamped value can no longer raise dark saturation', () => {
    glaze.configure({ darkDesaturation: -0.5 });
    const theme = glaze(0, 80);
    theme.colors({ a: { tone: 50 } });
    const a = theme.resolve().get('a')!;
    expect(a.dark.s).toBeCloseTo(a.light.s, 10);
  });

  it.each([Number.NaN, Infinity, -Infinity, '0.2'])(
    'configure() throws for %s and leaves the config untouched',
    (value) => {
      glaze.configure({ darkDesaturation: 0.25 });
      const version = getConfigVersion();
      expect(() =>
        glaze.configure({ darkDesaturation: value as number }),
      ).toThrow(/^glaze: darkDesaturation must be a finite number 0–1/);
      expect(glaze.getConfig().darkDesaturation).toBe(0.25);
      expect(getConfigVersion()).toBe(version);
    },
  );

  it('names the bad value in the message', () => {
    expect(() =>
      glaze.configure({ darkDesaturation: '0.2' as unknown as number }),
    ).toThrow(
      'glaze: darkDesaturation must be a finite number 0–1 (got "0.2").',
    );
    expect(() => glaze.configure({ darkDesaturation: Number.NaN })).toThrow(
      'glaze: darkDesaturation must be a finite number 0–1 (got NaN).',
    );
  });

  it('clamps a per-instance override', () => {
    const theme = glaze(0, 80, { darkDesaturation: 5 });
    theme.colors({ a: { tone: 50 } });
    expect(theme.getConfig().darkDesaturation).toBe(1);
    expect(theme.resolve().get('a')!.dark.s).toBe(0);

    const token = glaze.color('#3366cc', { darkDesaturation: -1 });
    const resolved = token.resolve();
    expect(resolved.dark.s).toBeCloseTo(resolved.light.s, 10);
  });

  it('throws for a non-finite per-instance override when it resolves', () => {
    const theme = glaze(0, 80, { darkDesaturation: Number.NaN });
    theme.colors({ a: { tone: 50 } });
    expect(() => theme.resolve()).toThrow(
      'glaze: darkDesaturation must be a finite number 0–1 (got NaN).',
    );
    expect(() =>
      glaze.color('#3366cc', { darkDesaturation: Infinity }).resolve(),
    ).toThrow('glaze: darkDesaturation must be a finite number 0–1');
  });
});

describe('tone window validation', () => {
  it('keeps every valid form as written', () => {
    glaze.configure({ lightTone: [12, 98], darkTone: false });
    expect(glaze.getConfig().lightTone).toEqual([12, 98]);
    expect(glaze.getConfig().darkTone).toBe(false);

    glaze.configure({ lightTone: { lo: 10, hi: 100, eps: 0.2 } });
    expect(glaze.getConfig().lightTone).toEqual({ lo: 10, hi: 100, eps: 0.2 });

    glaze.resetConfig();
    expect(glaze.getConfig().lightTone).toEqual({
      lo: 10,
      hi: 100,
      eps: 0.05,
    });
  });

  it('clamps endpoints into 0–100, keeping the form and eps', () => {
    glaze.configure({ lightTone: [-10, 120] });
    expect(glaze.getConfig().lightTone).toEqual([0, 100]);

    glaze.configure({ darkTone: { lo: -5, hi: 140, eps: 0.1 } });
    expect(glaze.getConfig().darkTone).toEqual({ lo: 0, hi: 100, eps: 0.1 });
  });

  it('a clamped window resolves like the full range', () => {
    const resolveWith = (lightTone: ToneWindow) => {
      glaze.resetConfig();
      glaze.configure({ lightTone });
      const theme = glaze(0, 0);
      theme.colors({ a: { tone: 30 }, b: { tone: 100 } });
      return [...theme.resolve()];
    };
    expect(resolveWith([-20, 150])).toEqual(resolveWith([0, 100]));
  });

  it('allows a zero-width window', () => {
    glaze.configure({ lightTone: [40, 40] });
    const theme = glaze(0, 0);
    theme.colors({ a: { tone: 0 }, b: { tone: 100 } });
    const r = theme.resolve();
    expect(r.get('a')!.light.t).toBeCloseTo(r.get('b')!.light.t, 10);
  });

  it.each<[string, unknown, string]>([
    [
      'lo > hi',
      [90, 20],
      'glaze: lightTone lo (90) is above hi (20). A window runs from its dark end to its light end: [lo, hi] with lo ≤ hi, e.g. [20, 90].',
    ],
    [
      'lo > hi (object form)',
      { lo: 60, hi: 50, eps: 0.05 },
      'glaze: lightTone lo (60) is above hi (50).',
    ],
    [
      'lo > hi, both out of range',
      [120, 110],
      'glaze: lightTone lo (120) is above hi (110).',
    ],
    [
      'NaN endpoint',
      [Number.NaN, 100],
      'glaze: lightTone lo must be a finite number (got NaN).',
    ],
    [
      'infinite endpoint',
      [0, Infinity],
      'glaze: lightTone hi must be a finite number (got Infinity).',
    ],
    [
      'string endpoint',
      ['10', 90],
      'glaze: lightTone lo must be a finite number (got "10").',
    ],
    [
      'eps of 0',
      { lo: 10, hi: 100, eps: 0 },
      'glaze: lightTone eps must be a finite number above 0 and at most 1e6 (got 0).',
    ],
    [
      'negative eps',
      { lo: 10, hi: 100, eps: -0.05 },
      'glaze: lightTone eps must be a finite number above 0 and at most 1e6 (got -0.05).',
    ],
    [
      'missing eps',
      { lo: 10, hi: 100 },
      'glaze: lightTone eps must be a finite number above 0 and at most 1e6 (got undefined).',
    ],
    [
      'eps above 1e6',
      { lo: 10, hi: 100, eps: 1e15 },
      'glaze: lightTone eps must be a finite number above 0 and at most 1e6 (got 1000000000000000).',
    ],
    [
      'infinite eps',
      { lo: 10, hi: 100, eps: Infinity },
      'glaze: lightTone eps must be a finite number above 0 and at most 1e6 (got Infinity).',
    ],
    [
      'null',
      null,
      'glaze: lightTone must be [lo, hi], { lo, hi, eps }, or false (got null).',
    ],
    [
      'one-element array',
      [10],
      'glaze: lightTone must be [lo, hi], { lo, hi, eps }, or false (got [10]).',
    ],
    [
      'three-element array',
      [10, 90, 0.2],
      'glaze: lightTone must be [lo, hi], { lo, hi, eps }, or false (got [10,90,0.2]).',
    ],
    [
      'true',
      true,
      'glaze: lightTone must be [lo, hi], { lo, hi, eps }, or false (got true).',
    ],
  ])('configure() throws for %s', (_label, lightTone, message) => {
    const version = getConfigVersion();
    expect(() =>
      glaze.configure({ lightTone: lightTone as ToneWindow }),
    ).toThrow(message);
    expect(glaze.getConfig().lightTone).toEqual({
      lo: 10,
      hi: 100,
      eps: 0.05,
    });
    expect(getConfigVersion()).toBe(version);
  });

  it.each<[string, GlazeConfig]>([
    [
      'an invalid darkDesaturation',
      {
        lightTone: [20, 90],
        states: { dark: '@x' },
        darkDesaturation: Number.NaN,
      },
    ],
    [
      'an inverted darkTone',
      {
        lightTone: [20, 90],
        modes: { highContrast: true },
        darkTone: [95, 15],
      },
    ],
    [
      'a non-finite contrastLevel',
      { lightTone: [20, 90], autoFlip: false, contrastLevel: Number.NaN },
    ],
    [
      'a null darkTone',
      {
        lightTone: [20, 90],
        shadowTuning: { reach: 0.5 },
        darkTone: null as unknown as ToneWindow,
      },
    ],
  ])('configure() with valid fields plus %s changes nothing', (_label, cfg) => {
    const before = structuredClone(glaze.getConfig());
    const version = getConfigVersion();
    expect(() => glaze.configure(cfg)).toThrow(/^glaze: /);
    expect(glaze.getConfig()).toEqual(before);
    expect(getConfigVersion()).toBe(version);
  });

  it('treats a null window the same in configure() and in an override', () => {
    const message =
      'glaze: darkTone must be [lo, hi], { lo, hi, eps }, or false (got null).';
    const version = getConfigVersion();
    expect(() =>
      glaze.configure({ darkTone: null as unknown as ToneWindow }),
    ).toThrow(message);
    expect(glaze.getConfig().darkTone).toEqual({ lo: 15, hi: 95, eps: 0.05 });
    expect(getConfigVersion()).toBe(version);

    const theme = glaze(0, 0, { darkTone: null as unknown as ToneWindow });
    theme.colors({ a: { tone: 50 } });
    expect(() => theme.resolve()).toThrow(message);
  });

  it('accepts an eps of exactly 1e6 and resolves to finite tones', () => {
    glaze.configure({ lightTone: { lo: 10, hi: 100, eps: 1e6 } });
    expect(glaze.getConfig().lightTone).toEqual({ lo: 10, hi: 100, eps: 1e6 });
    const theme = glaze(0, 0);
    theme.colors({ a: { tone: 50 } });
    const a = theme.resolve().get('a')!;
    expect(Number.isFinite(a.light.t)).toBe(true);
    expect(Number.isFinite(a.lightContrast.t)).toBe(true);
  });

  it('caps eps in a per-instance override when it resolves', () => {
    const token = glaze.color(
      { hue: 0, saturation: 0, tone: 50 },
      { lightTone: { lo: 10, hi: 100, eps: 1e15 } },
    );
    expect(() => token.resolve()).toThrow(
      'glaze: lightTone eps must be a finite number above 0 and at most 1e6 (got 1000000000000000).',
    );

    const theme = glaze(0, 0, { darkTone: { lo: 15, hi: 95, eps: 1e7 } });
    theme.colors({ a: { tone: 50 } });
    expect(() => theme.resolve()).toThrow(
      'glaze: darkTone eps must be a finite number above 0 and at most 1e6 (got 10000000).',
    );
  });

  it('names darkTone in its errors', () => {
    expect(() => glaze.configure({ darkTone: [95, 15] })).toThrow(
      'glaze: darkTone lo (95) is above hi (15).',
    );
  });

  it('validates a per-instance override when it resolves', () => {
    const theme = glaze(0, 0, { darkTone: [95, 15] });
    theme.colors({ a: { tone: 50 } });
    expect(() => theme.resolve()).toThrow(
      'glaze: darkTone lo (95) is above hi (15).',
    );

    const token = glaze.color('#808080', {
      lightTone: { lo: 0, hi: 100, eps: 0 },
    });
    expect(() => token.resolve()).toThrow(
      'glaze: lightTone eps must be a finite number above 0 and at most 1e6 (got 0).',
    );

    const clamped = glaze(0, 0, { lightTone: [-10, 110] });
    expect(clamped.getConfig().lightTone).toEqual([0, 100]);
  });

  it('freezes the clamped window into an export', () => {
    const theme = glaze(0, 0, { lightTone: [-10, 110] });
    expect(theme.export().config?.lightTone).toEqual([0, 100]);
  });
});

describe('normalizeToneWindow', () => {
  it('normalizes the three forms', () => {
    expect(normalizeToneWindow(false)).toEqual({
      lo: 0,
      hi: 100,
      eps: REF_EPS,
    });
    expect(normalizeToneWindow([10, 90])).toEqual({
      lo: 10,
      hi: 90,
      eps: REF_EPS,
    });
    expect(normalizeToneWindow({ lo: 10, hi: 90, eps: 0.2 })).toEqual({
      lo: 10,
      hi: 90,
      eps: 0.2,
    });
  });

  it('clamps endpoints and names the field in errors', () => {
    expect(normalizeToneWindow([-1, 101])).toEqual({
      lo: 0,
      hi: 100,
      eps: REF_EPS,
    });
    expect(() => normalizeToneWindow([2, 1])).toThrow(
      'glaze: tone window lo (2) is above hi (1).',
    );
    expect(() => normalizeToneWindow([2, 1], 'darkTone')).toThrow(
      'glaze: darkTone lo (2) is above hi (1).',
    );
  });

  it('normalizeToneWindowInput returns a fresh value in the written form', () => {
    const arr: ToneWindow = [10, 90];
    const obj: ToneWindow = { lo: 10, hi: 90, eps: 0.1 };
    const outArr = normalizeToneWindowInput(arr, 'lightTone');
    const outObj = normalizeToneWindowInput(obj, 'lightTone');
    expect(outArr).toEqual(arr);
    expect(outArr).not.toBe(arr);
    expect(outObj).toEqual(obj);
    expect(outObj).not.toBe(obj);
    expect(normalizeToneWindowInput(false, 'darkTone')).toBe(false);
  });
});
