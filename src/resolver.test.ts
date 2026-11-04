import { glaze } from './glaze';
import { mapToneForScheme, toTone, unmapLightTone } from './okhst';
import type {
  ColorMap,
  GlazeConfigOverride,
  ResolvedColor,
  ResolvedColorVariant,
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

  it('leaves the high-contrast variants on the light-tone anchor', () => {
    // The HC window is the full range, so the dark HC variant is the base's
    // light HC tone stepped, inverted, and mapped — the pre-fix formula, bit
    // for bit. The windows here are non-default to make any drift visible.
    const override: GlazeConfigOverride = {
      lightTone: { lo: 8, hi: 98, eps: 0.1 },
      darkTone: { lo: 12, hi: 92, eps: 0.02 },
    };
    const map = resolve(ladder(50), override);
    const config = { ...glaze.getConfig(), ...override };
    const baseLight = map.get('base')!.lightContrast.t * 100;
    for (const d of DELTAS) {
      const expected = mapToneForScheme(
        Math.min(100, Math.max(0, baseLight + Number(d))),
        'auto',
        true,
        true,
        config,
      );
      expect(map.get(`c${d}`)!.darkContrast.t * 100).toBe(expected);
    }
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
    };
    const atLevel = resolve(colors, { contrastLevel: 100 });
    const auto = resolve(colors);
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
  });

  it('reads a contrast-solved base back through the light window', () => {
    const map = resolve({
      surface: { tone: 97 },
      text: { base: 'surface', tone: '-52', contrast: 'AA' },
      'text-hover': { base: 'text', tone: '-6' },
    });
    const config = glaze.getConfig();
    const anchor = unmapLightTone(
      map.get('text')!.light.t * 100,
      'auto',
      false,
      config,
    );
    expect(map.get('text-hover')!.dark.t * 100).toBeCloseTo(
      mapToneForScheme(anchor - 6, 'auto', true, false, config),
      12,
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
