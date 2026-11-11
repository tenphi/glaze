/**
 * The agent tools in harness/: their measurements must agree with the
 * solver, so a ✗ from `glaze:inspect` means what a Glaze warning means.
 */
import * as g from './index';
import {
  inspectTheme,
  measurePair,
  missesOf,
  roleOf,
  themesFromSnapshot,
} from '../harness/dev.harnesspm/scripts/measure.mjs';

const { glaze } = g;

function harnessTheme(hue: number) {
  const theme = glaze({ hue, saturation: 20 });
  theme.colors({
    surface: { tone: 97 },
    'surface-text': {
      base: 'surface',
      tone: 12,
      contrast: { apca: 'content' },
    },
    hint: { base: 'surface', tone: 40, contrast: 'AA' },
    'accent-fill': { tone: 52, mode: 'fixed' },
    'accent-fill-text': {
      base: 'accent-fill',
      tone: 100,
      mode: 'fixed',
      contrast: 'AA',
    },
  });
  return theme;
}

describe('harness tools', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('measures a literal pair with WCAG and APCA', () => {
    const pair = measurePair(g, '#777777', '#ffffff');
    expect(pair.wcag).toBeCloseTo(4.48, 2);
    expect(pair.passes.wcag).toMatchObject({ AA: false, 'AA-large': true });
    expect(pair.apca).toBeGreaterThan(60);
    expect(pair.passes.apca.content).toBe(true);
    // APCA is not symmetric: light text on a dark background is negative.
    expect(measurePair(g, '#ffffff', '#000000').apca).toBeLessThan(0);
  });

  it('marks a floor as missed exactly where the solver warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = inspectTheme(g, harnessTheme(251), 'default');

    const text = result.colors.find((c) => c.name === 'surface-text')!;
    expect(text.contrast).toMatchObject({ base: 'surface', metric: 'apca' });
    expect(text.contrast!.schemes.light).toMatchObject({
      target: 60,
      pass: true,
    });
    expect(text.contrast!.schemes.lightContrast).toMatchObject({
      target: 75,
      pass: true,
    });

    const misses = missesOf([result]);
    expect(misses.map((m) => `${m.color} ${m.scheme}`)).toEqual([
      'accent-fill-text light HC',
      'accent-fill-text dark HC',
    ]);
    const warned = warn.mock.calls.map((call) => String(call[0]));
    expect(warned).toEqual([
      expect.stringContaining(
        '"accent-fill-text" cannot meet WCAG 7.00 in lightContrast',
      ),
      expect.stringContaining(
        '"accent-fill-text" cannot meet WCAG 7.00 in darkContrast',
      ),
    ]);
  });

  it('measures APCA with the polarity of the role, like the solver', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const theme = glaze({ hue: 200, saturation: 10 });
    theme.colors({
      label: { tone: 20 },
      'chip-surface': { base: 'label', tone: 25, contrast: { apca: 75 } },
    });
    const chip = inspectTheme(g, theme, 'x').colors.find(
      (c) => c.name === 'chip-surface',
    )!;
    expect(chip.contrast!.role).toBe('surface');
    // The solver lands just past the floor (+0.5 Lc) when it can reach it…
    expect(chip.contrast!.schemes.light.value).toBeCloseTo(75.5, 1);
    // …and reports the same measurement as the tool when it cannot.
    const got = /got ([\d.]+)/.exec(String(warn.mock.calls[0]![0]))![1];
    expect(chip.contrast!.schemes.dark.value!.toFixed(2)).toBe(got);
    expect(chip.contrast!.schemes.dark.pass).toBe(false);
  });

  it('gives colors the roles the resolver gives them', () => {
    const defs = {
      canvas: { tone: 97 },
      'accent-surface-hover': { base: 'canvas', tone: '-4' },
      note: { base: 'canvas', tone: 20 },
      chip: { base: 'note', tone: 90 },
    } as const;
    // By name, else the opposite of the base's role, else text.
    expect(roleOf(g, 'canvas', defs, true)).toBe('surface');
    expect(roleOf(g, 'accent-surface-hover', defs, true)).toBe('surface');
    expect(roleOf(g, 'note', defs, true)).toBe('text');
    expect(roleOf(g, 'chip', defs, true)).toBe('surface');
    expect(roleOf(g, 'canvas', defs, false)).toBe('text');
    expect(roleOf(g, 'note', defs, false)).toBe('surface');
  });

  it('reads theme and palette snapshots', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const theme = harnessTheme(252);
    expect(themesFromSnapshot(g, theme.export(), 'mine')).toEqual([
      ['mine', expect.anything()],
    ]);
    const palette = glaze.palette({
      default: theme,
      danger: theme.extend({ hue: 20 }),
    });
    const themes = themesFromSnapshot(g, palette.export());
    expect(themes.map(([name]) => name)).toEqual(['default', 'danger']);
    expect(() => themesFromSnapshot(g, [])).toThrow(/snapshot/);
  });
});
