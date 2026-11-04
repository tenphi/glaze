import { glaze } from './glaze';
import {
  mapToneForScheme,
  toTone,
  unmapDarkTone,
  unmapLightTone,
} from './okhst';
import type {
  ColorMap,
  GlazeColorToken,
  GlazeConfigOverride,
  ResolvedColor,
  ResolvedColorVariant,
  ToneWindow,
} from './types';

type Slot = 'light' | 'dark' | 'lightContrast' | 'darkContrast';

function resolve(
  colors: ColorMap,
  config?: GlazeConfigOverride,
): Map<string, ResolvedColor> {
  const theme = glaze(280, 40, config);
  theme.colors(colors);
  return theme.resolve();
}

/** Tone step (0–100 scale) from `base` to `name` in one slot. */
function step(
  map: Map<string, ResolvedColor>,
  name: string,
  base: string,
  slot: Slot,
): number {
  return (map.get(name)![slot].t - map.get(base)![slot].t) * 100;
}

/** Tone-axis scale of a `[lo, hi]` lightness window (reference eps). */
function windowScale(lo: number, hi: number): number {
  return (toTone(hi / 100) - toTone(lo / 100)) / 100;
}

const DEFAULT_DARK_SCALE = windowScale(15, 95);

const BASE_TONES = [97, 70, 50, 30];
const DELTAS = ['+4', '-4', '-20'] as const;

/** A root base per tone, with one `auto` dependent per delta. */
function ladder(baseTone: number): ColorMap {
  const colors: ColorMap = { base: { tone: baseTone } };
  for (const d of DELTAS) colors[`c${d}`] = { base: 'base', tone: d };
  return colors;
}

/**
 * Bases whose dark tone is not the inversion of an authored tone — a
 * contrast-solved color, a mix, and both extremes on a base — each with a
 * delta child whose step stays inside the window (and doesn't flip).
 */
const DARK_ANCHORED: ColorMap = {
  surface: { tone: 97 },
  text: { base: 'surface', tone: '-52', contrast: 'AA' },
  'text-up': { base: 'text', tone: '+6' },
  'text-down': { base: 'text', tone: '-6' },
  a: { tone: 90 },
  b: { tone: 20 },
  mixed: { type: 'mix', base: 'a', target: 'b', value: 40 },
  'mixed-up': { base: 'mixed', tone: '+6' },
  'mixed-down': { base: 'mixed', tone: '-6' },
  mid: { tone: 50 },
  max: { base: 'mid', tone: 'max' },
  'max-down': { base: 'max', tone: '-6' },
  low: { tone: 30 },
  min: { base: 'low', tone: 'min' },
  'min-up': { base: 'min', tone: '+6' },
};

const DARK_ANCHORED_STEPS = [
  ['text-up', 'text', 6],
  ['text-down', 'text', -6],
  ['mixed-up', 'mixed', 6],
  ['mixed-down', 'mixed', -6],
  ['max-down', 'max', -6],
  ['min-up', 'min', 6],
] as const;

describe('resolver: dark tone deltas', () => {
  beforeEach(() => {
    glaze.resetConfig();
  });

  it('steps every base by the dark window scale × the delta, mirrored', () => {
    const ratios: number[] = [];
    for (const baseTone of BASE_TONES) {
      const map = resolve(ladder(baseTone));
      for (const d of DELTAS) {
        const light = step(map, `c${d}`, 'base', 'light');
        const dark = step(map, `c${d}`, 'base', 'dark');
        // The light step is the delta as written (or its autoFlip mirror).
        expect(Math.abs(light)).toBeCloseTo(Math.abs(Number(d)), 9);
        ratios.push(-dark / light);
      }
    }

    for (const ratio of ratios) {
      expect(Math.abs(ratio - ratios[0])).toBeLessThan(1e-6);
    }
    expect(ratios[0]).toBeCloseTo(DEFAULT_DARK_SCALE, 9);
  });

  it('resolves a delta in dark like the absolute tone it lands on', () => {
    // `{ eps }` windows make the window map non-linear, so this also checks
    // that the light window is undone exactly, not just its slope.
    for (const config of [
      undefined,
      { lightTone: [20, 95], darkTone: [10, 98] },
      {
        lightTone: { lo: 8, hi: 98, eps: 0.1 },
        darkTone: { lo: 12, hi: 92, eps: 0.02 },
      },
    ] as (GlazeConfigOverride | undefined)[]) {
      const map = resolve(
        {
          base: { tone: 50 },
          up: { base: 'base', tone: '+4' },
          down: { base: 'base', tone: '-20' },
          at54: { tone: 54 },
          at30: { tone: 30 },
        },
        config,
      );
      expect(map.get('up')!.dark.t).toBeCloseTo(map.get('at54')!.dark.t, 12);
      expect(map.get('down')!.dark.t).toBeCloseTo(map.get('at30')!.dark.t, 12);
    }
  });

  it('keeps the light window out of dark', () => {
    const colors: ColorMap = {
      ...ladder(50),
      low: { tone: 30 },
      'low-up': { base: 'low', tone: '+10' },
    };
    const windowed = resolve(colors);
    const unwindowed = resolve(colors, { lightTone: false });
    for (const name of ['c+4', 'c-4', 'c-20', 'low-up']) {
      expect(windowed.get(name)!.dark.t).toBeCloseTo(
        unwindowed.get(name)!.dark.t,
        12,
      );
    }
  });

  it('steps evenly along a chain of deltas', () => {
    const map = resolve({
      surface: { tone: 97 },
      'surface-2': { base: 'surface', tone: '-4' },
      'surface-3': { base: 'surface-2', tone: '-4' },
      'surface-4': { base: 'surface-3', tone: '-4' },
      mid: { tone: 50 },
      same: { base: 'mid' },
      'same-up': { base: 'same', tone: '+10' },
      placed: { base: 'mid', tone: 60 },
      'placed-up': { base: 'placed', tone: '+5' },
    });
    for (const [name, base, delta] of [
      ['surface-2', 'surface', -4],
      ['surface-3', 'surface-2', -4],
      ['surface-4', 'surface-3', -4],
      ['same-up', 'same', 10],
      ['placed-up', 'placed', 5],
    ] as const) {
      expect(step(map, name, base, 'dark')).toBeCloseTo(
        -delta * DEFAULT_DARK_SCALE,
        9,
      );
    }
  });

  it('steps a `from` base and a `from` dependent evenly', () => {
    // A `from` color skips the light window; the step must not undo a lift
    // its base never had, nor keep one its base did have.
    const map = resolve({
      brand: { from: '#2f5bff' },
      'brand-up': { base: 'brand', tone: '+6' },
      mid: { tone: 50 },
      'from-child': { from: '#808080', base: 'mid', tone: '+4' },
    });
    expect(step(map, 'brand-up', 'brand', 'dark')).toBeCloseTo(
      -6 * DEFAULT_DARK_SCALE,
      9,
    );
    expect(step(map, 'from-child', 'mid', 'dark')).toBeCloseTo(
      -4 * DEFAULT_DARK_SCALE,
      9,
    );
  });

  it('matches a standalone token with the same base tone', () => {
    const map = resolve(ladder(50));
    const base = glaze.color({ h: 280, s: 0.4, t: 0.5 });
    for (const d of DELTAS) {
      const token = glaze.color({ from: '#808080', base, tone: d }).resolve();
      const tokenStep = (token.dark.t - base.resolve().dark.t) * 100;
      expect(step(map, `c${d}`, 'base', 'dark')).toBeCloseTo(tokenStep, 9);
    }
  });

  it('flips on the light scale, so dark mirrors the light side', () => {
    const map = resolve({
      // The light window lifts tone 96 to 96.2, so '+4' overshoots in light
      // (and flips) though 96 + 4 does not.
      top: { tone: 96 },
      'top-up': { base: 'top', tone: '+4' },
      'top-up-clamped': { base: 'top', tone: '+4', autoFlip: false },
      // The lift leaves room for '-4' in light (tone 6.85 → 2.85), but not on
      // the authored scale (2 → -2): dark stops at the window, still mirrored.
      bottom: { tone: 2 },
      'bottom-down': { base: 'bottom', tone: '-4' },
    });

    expect(step(map, 'top-up', 'top', 'light')).toBeCloseTo(-4, 9);
    expect(step(map, 'top-up', 'top', 'dark')).toBeCloseTo(
      4 * DEFAULT_DARK_SCALE,
      9,
    );

    expect(step(map, 'top-up-clamped', 'top', 'light')).toBeGreaterThan(0);
    expect(step(map, 'top-up-clamped', 'top', 'dark')).toBeCloseTo(
      -4 * DEFAULT_DARK_SCALE,
      9,
    );

    expect(step(map, 'bottom-down', 'bottom', 'light')).toBeCloseTo(-4, 9);
    const darkDown = step(map, 'bottom-down', 'bottom', 'dark');
    expect(darkDown).toBeGreaterThan(0);
    expect(darkDown).toBeCloseTo(2 * DEFAULT_DARK_SCALE, 9);
    expect(map.get('bottom-down')!.dark.t * 100).toBeCloseTo(toTone(0.95), 9);
  });

  it('keeps high-contrast steps exact', () => {
    for (const baseTone of BASE_TONES) {
      const map = resolve(ladder(baseTone));
      for (const d of DELTAS) {
        const light = step(map, `c${d}`, 'base', 'lightContrast');
        const dark = step(map, `c${d}`, 'base', 'darkContrast');
        expect(Math.abs(light)).toBeCloseTo(Math.abs(Number(d)), 9);
        expect(dark).toBeCloseTo(-light, 9);
      }
    }
  });

  it('reads the light tone as stored in high contrast at default windows', () => {
    // The HC light window is the identity here, so a tone-placed base's light
    // HC tone is its authored tone: the anchor reads it as stored, keeping the
    // HC variants bit-identical to the light-tone formula they always used.
    const map = resolve({
      ...ladder(50),
      'c-chain': { base: 'c-20', tone: ['-4', '-8'] },
    });
    const config = glaze.getConfig();
    for (const [name, base, delta] of [
      ...DELTAS.map((d) => [`c${d}`, 'base', Number(d)] as const),
      ['c-chain', 'c-20', -8] as const,
    ]) {
      const baseLight = map.get(base)!.lightContrast.t * 100;
      expect(map.get(name)!.darkContrast.t * 100).toBe(
        mapToneForScheme(
          Math.min(100, Math.max(0, baseLight + delta)),
          'auto',
          true,
          true,
          config,
        ),
      );
    }
  });

  it('steps high contrast exactly under a custom light eps', () => {
    // A full-range window at a custom eps is not the identity: the light HC
    // tone carries a lift, so the anchor is the authored tone.
    const map = resolve(ladder(50), {
      lightTone: { lo: 8, hi: 98, eps: 0.1 },
    });
    for (const d of DELTAS) {
      expect(step(map, `c${d}`, 'base', 'darkContrast')).toBeCloseTo(
        -Number(d),
        9,
      );
    }

    const override: GlazeConfigOverride = {
      lightTone: { lo: 8, hi: 98, eps: 0.1 },
      darkTone: { lo: 12, hi: 92, eps: 0.02 },
    };
    const custom = resolve(ladder(50), override);
    const config = { ...glaze.getConfig(), ...override };
    for (const d of DELTAS) {
      expect(custom.get(`c${d}`)!.darkContrast.t * 100).toBe(
        mapToneForScheme(50 + Number(d), 'auto', true, true, config),
      );
    }
  });

  it('keeps the dark variant continuous up to level 100 under a custom eps', () => {
    const lightTone = { lo: 10, hi: 100, eps: 0.2 };
    const colors: ColorMap = {
      base: { tone: 50 },
      up: { base: 'base', tone: '+10' },
      at60: { tone: 60 },
      surface: { tone: 53 },
      text: { base: 'surface', tone: '-2', contrast: 'AA' },
    };
    // `text` cannot meet its floor near level 100 either way; only its side
    // matters here.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const near = resolve(colors, { lightTone, contrastLevel: 99.9999 });
    const at100 = resolve(colors, { lightTone, contrastLevel: 100 });
    const auto = resolve(colors, { lightTone });
    warn.mockRestore();
    for (const name of ['up', 'text']) {
      expect(at100.get(name)!.dark.t * 100).toBeCloseTo(
        near.get(name)!.dark.t * 100,
        2,
      );
      expect(at100.get(name)!.dark.t).toBe(auto.get(name)!.darkContrast.t);
    }
    // At level 100 '+10' on 50 lands where the absolute 60 does.
    expect(at100.get('up')!.dark.t).toBeCloseTo(at100.get('at60')!.dark.t, 12);
  });

  it('steps by the interpolated dark window under a contrast level', () => {
    // Level 50 puts the dark window halfway to the full range: [7.5, 97.5].
    const scale = windowScale(7.5, 97.5);
    for (const baseTone of BASE_TONES) {
      const map = resolve(ladder(baseTone), { contrastLevel: 50 });
      for (const d of DELTAS) {
        const light = step(map, `c${d}`, 'base', 'light');
        const dark = step(map, `c${d}`, 'base', 'dark');
        expect(-dark / light).toBeCloseTo(scale, 9);
      }
    }
  });

  it('keeps level 100 identical to the high-contrast variants', () => {
    const colors: ColorMap = {
      ...ladder(50),
      'c-chain': { base: 'c-20', tone: ['-4', '-8'] },
      ...DARK_ANCHORED,
    };
    for (const config of [
      undefined,
      { lightTone: { lo: 8, hi: 98, eps: 0.1 } },
      {
        lightTone: { lo: 8, hi: 98, eps: 0.1 },
        darkTone: { lo: 12, hi: 92, eps: 0.02 },
      },
    ] as (GlazeConfigOverride | undefined)[]) {
      const atLevel = resolve(colors, { ...config, contrastLevel: 100 });
      const auto = resolve(colors, config);
      for (const name of Object.keys(colors)) {
        const a = atLevel.get(name)!;
        const b = auto.get(name)!;
        const pick = ({ h, s, t, alpha }: ResolvedColorVariant) => ({
          h,
          s,
          t,
          alpha,
        });
        expect(pick(a.light)).toEqual(pick(b.lightContrast));
        expect(pick(a.dark)).toEqual(pick(b.darkContrast));
      }
    }
  });

  it('steps from where a solved, mixed, or extreme base sits in dark', () => {
    // These bases' dark tones are not the inversion of an authored tone, so
    // the anchor is their own dark tone taken back through the dark window.
    const map = resolve(DARK_ANCHORED);
    const config = glaze.getConfig();
    for (const [name, base, delta] of DARK_ANCHORED_STEPS) {
      for (const isHighContrast of [false, true]) {
        const slot = isHighContrast ? 'darkContrast' : 'dark';
        const baseDark = map.get(base)![slot].t * 100;
        const expected = mapToneForScheme(
          unmapDarkTone(baseDark, 'auto', isHighContrast, config) + delta,
          'auto',
          true,
          isHighContrast,
          config,
        );
        expect(map.get(name)![slot].t * 100).toBeCloseTo(expected, 9);
        // Inside the window: the dark window's scale × the delta, mirrored
        // (exact in high contrast, whose window is the full range).
        expect(step(map, name, base, slot)).toBeCloseTo(
          -delta * (isHighContrast ? 1 : DEFAULT_DARK_SCALE),
          9,
        );
        // Light is untouched: the delta as written.
        const lightSlot = isHighContrast ? 'lightContrast' : 'light';
        expect(step(map, name, base, lightSlot)).toBeCloseTo(delta, 9);
      }
    }
  });

  it('steps from an external token base on its own light window', () => {
    // A value-form base with an explicit light window lifts its light tone;
    // its dark tone is still the inversion of its authored tone, which the
    // base token reports in its own resolve context.
    for (const lightTone of [[10, 100], false] as ToneWindow[]) {
      const base = glaze.color('#808080', { lightTone });
      const baseColor = base.resolve();
      const config = glaze.getConfig();
      for (const d of DELTAS) {
        const delta = Number(d);
        const child = glaze.color({ from: '#808080', base, tone: d }).resolve();
        for (const isHighContrast of [false, true]) {
          const slot = isHighContrast ? 'darkContrast' : 'dark';
          const baseDark = baseColor[slot].t * 100;
          expect(child[slot].t * 100).toBeCloseTo(
            mapToneForScheme(
              unmapDarkTone(baseDark, 'auto', isHighContrast, config) + delta,
              'auto',
              true,
              isHighContrast,
              config,
            ),
            9,
          );
          expect((child[slot].t - baseColor[slot].t) * 100).toBeCloseTo(
            -delta * (isHighContrast ? 1 : DEFAULT_DARK_SCALE),
            9,
          );
          const lightSlot = isHighContrast ? 'lightContrast' : 'light';
          expect(
            (child[lightSlot].t - baseColor[lightSlot].t) * 100,
          ).toBeCloseTo(delta, 9);
        }
      }
    }
  });

  it('reads an unknown token-like base back through the dark window', () => {
    // An object that only quacks like a token supplies no anchor of its own.
    const real = glaze.color('#808080', { lightTone: [10, 100] });
    const duck: GlazeColorToken = {
      ...real,
      resolve: () => real.resolve(),
      export: () => real.export(),
    };
    const child = glaze
      .color({ from: '#808080', base: duck, tone: '+4' })
      .resolve();
    expect((child.dark.t - real.resolve().dark.t) * 100).toBeCloseTo(
      -4 * DEFAULT_DARK_SCALE,
      9,
    );
  });

  it('clamps a low base at the dark window top (flip decided on light)', () => {
    // The light window lifts tone 0 to 4.95, so a negative delta that fits in
    // light can overshoot 0 on the authored scale: dark mirrors light's side
    // but stops at the dark window's top, so its step comes out shorter.
    const map = resolve({
      b0: { tone: 0 },
      'b0-down': { base: 'b0', tone: '-4.9' },
      b2: { tone: 2 },
      'b2-down': { base: 'b2', tone: '-4' },
      b50: { tone: 50 },
      'b50-down': { base: 'b50', tone: '-52' },
    });
    const top = toTone(0.95);
    for (const [name, base, delta, room] of [
      ['b0-down', 'b0', -4.9, 0],
      ['b2-down', 'b2', -4, 2],
      ['b50-down', 'b50', -52, 50],
    ] as const) {
      expect(step(map, name, base, 'light')).toBeCloseTo(delta, 9);
      expect(step(map, name, base, 'dark')).toBeCloseTo(
        room * DEFAULT_DARK_SCALE,
        9,
      );
      expect(map.get(name)!.dark.t * 100).toBeCloseTo(top, 9);
    }
    // A tone-0 base doesn't move in dark at all; about +1.7 on tone 2.
    expect(step(map, 'b0-down', 'b0', 'dark')).toBeCloseTo(0, 9);
    expect(step(map, 'b2-down', 'b2', 'dark')).toBeCloseTo(1.73, 2);
  });

  it('resolves a long chain of deltas without deep recursion', () => {
    const colors: ColorMap = { c0: { tone: 50 } };
    const length = 6500;
    for (let i = 1; i < length; i++) {
      colors[`c${i}`] = { base: `c${i - 1}`, tone: i % 2 ? '+1' : '-1' };
    }
    const map = resolve(colors);
    const last = length - 1;
    expect(step(map, `c${last}`, `c${last - 1}`, 'dark')).toBeCloseTo(
      (last % 2 ? -1 : 1) * DEFAULT_DARK_SCALE,
      9,
    );
  });

  it('replays the light shift of an extreme exactly (no lift counted)', () => {
    // Bases chosen so neither replay reaches the 0–100 clamp.
    const map = resolve({
      mid: { tone: 50 },
      max: { base: 'mid', tone: 'max' },
      low: { tone: 30 },
      min: { base: 'low', tone: 'min' },
    });
    for (const [name, base] of [
      ['max', 'mid'],
      ['min', 'low'],
    ]) {
      expect(step(map, name, base, 'dark')).toBeCloseTo(
        -step(map, name, base, 'light'),
        9,
      );
    }
  });
});

describe('unmapLightTone', () => {
  beforeEach(() => {
    glaze.resetConfig();
  });

  it('inverts the light window, including a custom eps', () => {
    for (const lightTone of [
      [10, 100],
      [20, 95],
      { lo: 8, hi: 98, eps: 0.1 },
      false,
    ] as GlazeConfigOverride['lightTone'][]) {
      const config = { ...glaze.getConfig(), lightTone: lightTone! };
      for (const authored of [0, 3, 50, 97, 100]) {
        const stored = mapToneForScheme(authored, 'auto', false, false, config);
        expect(unmapLightTone(stored, 'auto', false, config)).toBeCloseTo(
          authored,
          9,
        );
      }
    }
  });

  it('is the identity for static colors', () => {
    expect(unmapLightTone(42.5, 'static', false, glaze.getConfig())).toBe(42.5);
  });
});

describe('unmapDarkTone', () => {
  beforeEach(() => {
    glaze.resetConfig();
  });

  it('inverts the dark window per mode, including a custom eps and HC', () => {
    for (const darkTone of [
      [15, 95],
      [10, 98],
      { lo: 12, hi: 92, eps: 0.02 },
      false,
    ] as GlazeConfigOverride['darkTone'][]) {
      for (const contrastLevel of ['auto', 50] as const) {
        const config = {
          ...glaze.getConfig(),
          darkTone: darkTone!,
          contrastLevel,
        };
        for (const mode of ['auto', 'fixed', 'static'] as const) {
          for (const isHighContrast of [false, true]) {
            for (const authored of [0, 3, 50, 97, 100]) {
              const stored = mapToneForScheme(
                authored,
                mode,
                true,
                isHighContrast,
                config,
              );
              expect(
                unmapDarkTone(stored, mode, isHighContrast, config),
              ).toBeCloseTo(authored, 9);
            }
          }
        }
      }
    }
  });

  it('reads a tone past the window back outside 0–100', () => {
    const config = glaze.getConfig();
    // The default dark window tops out at lightness 95: a contrast floor can
    // push a color above it, which lands below authored 0.
    expect(unmapDarkTone(100, 'auto', false, config)).toBeLessThan(0);
    expect(unmapDarkTone(0, 'auto', false, config)).toBeGreaterThan(100);
  });
});
