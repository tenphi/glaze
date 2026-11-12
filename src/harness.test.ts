/**
 * The agent tools in harness/: their measurements must agree with the
 * solver, so a ✗ from `glaze:inspect` means what a Glaze warning means.
 */
import pkg from '../package.json';
import * as g from './index';
import * as measure from '../harness/dev.harnesspm/scripts/measure.mjs';
import {
  filterThemes,
  inspectColor,
  inspectTheme,
  measurePair,
  missesOf,
  roleOf,
  themesFromSnapshot,
} from '../harness/dev.harnesspm/scripts/measure.mjs';
import {
  listOf,
  parseColorArg,
  parseContrast,
} from '../harness/dev.harnesspm/scripts/cli.mjs';

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

  it('resolves one color in every scheme, keeping a value exact in light', () => {
    const color = inspectColor(g, '#2563eb');
    expect(color.role).toBe('text');
    expect(color.metric).toBeUndefined();
    expect(color.schemes.light).toMatchObject({ value: '#2563eb', alpha: 1 });
    expect(color.schemes.light.tone).toBeCloseTo(47.6, 1);
    expect(color.schemes.light.hue).toBeCloseTo(262.9, 1);
    // Dark is lighter; without a base, nothing is measured.
    expect(color.schemes.dark.tone).toBeGreaterThan(color.schemes.light.tone);
    expect(color.schemes.dark.wcag).toBeUndefined();
  });

  it('measures a color against its base in every scheme, like the solver', () => {
    const color = inspectColor(g, '#2563eb', {
      base: '#ffffff',
      contrast: 'AA',
    });
    expect(color.metric).toBe('wcag');
    expect(color.schemes.light).toMatchObject({
      base: '#ffffff',
      target: 4.5,
      pass: true,
    });
    expect(color.schemes.lightContrast.target).toBe(7);
    // In light the pair is the literal pair glaze:contrast measures.
    expect(color.schemes.light.wcag).toBeCloseTo(
      measurePair(g, '#2563eb', '#ffffff').wcag,
      6,
    );
    // The base adapts: it is dark in the dark schemes.
    expect(color.schemes.dark.base).not.toBe('#ffffff');
    for (const scheme of measure.SCHEMES) {
      expect(color.schemes[scheme.key].pass).toBe(true);
    }

    // APCA: the solver lands 0.5 Lc past the floor, and the tool sees it.
    const apca = inspectColor(
      g,
      { from: '#aaaaaa', contrast: { apca: 'content' } },
      { base: '#ffffff' },
    );
    expect(apca.metric).toBe('apca');
    expect(apca.schemes.light.apca).toBeCloseTo(60.5, 1);
    expect(apca.schemes.lightContrast.target).toBe(75);
  });

  it('marks a floor the solver cannot meet, and takes tokens', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // No tone reaches 7:1 on a mid gray.
    const base = glaze.color('#777777');
    const color = inspectColor(
      g,
      glaze.color({ from: '#336699', base, contrast: 'AAA' }),
    );
    expect(color.schemes.light.base).toBe('#777777');
    expect(color.schemes.light.pass).toBe(false);
    expect(color.schemes.light.wcag).toBeLessThan(7);
    expect(warn).toHaveBeenCalled();
  });

  it('filters themes and colors, keeping the base of each color', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const theme = harnessTheme(253);
    const all = [
      inspectTheme(g, theme, 'default'),
      inspectTheme(g, theme.extend({ hue: 20 }), 'danger'),
    ];
    const names = (themes: measure.InspectedTheme[]) =>
      themes.map((t) => `${t.name}: ${t.colors.map((c) => c.name).join(' ')}`);

    expect(names(filterThemes(all, { colors: ['hint'] }))).toEqual([
      'default: surface hint',
      'danger: surface hint',
    ]);
    expect(
      names(
        filterThemes(all, {
          themes: ['danger'],
          colors: ['#accent-fill-text', 'hint'],
        }),
      ),
    ).toEqual(['danger: surface hint accent-fill accent-fill-text']);
    expect(filterThemes(all, {})).toBe(all);
    expect(() => filterThemes(all, { themes: ['nope'] })).toThrow(
      /no theme named "nope". Themes: default, danger/,
    );
    expect(() => filterThemes(all, { colors: ['zzz'] })).toThrow(
      /no color name contains "zzz"/,
    );
  });

  it('reads command-line colors, floors and lists', () => {
    expect(parseContrast('AA')).toBe('AA');
    expect(parseContrast('4.5')).toBe(4.5);
    expect(parseContrast('apca:content')).toEqual({ apca: 'content' });
    expect(parseContrast('APCA:75')).toEqual({ apca: 75 });
    expect(parseContrast('wcag:AAA')).toEqual({ wcag: 'AAA' });
    expect(parseContrast('{"apca":["content","body"]}')).toEqual({
      apca: ['content', 'body'],
    });
    expect(parseColorArg('#2563eb')).toBe('#2563eb');
    expect(parseColorArg('{"from":"#2563eb","tone":40}')).toEqual({
      from: '#2563eb',
      tone: 40,
    });
    expect(() => parseColorArg('{bad')).toThrow(/invalid JSON/);
    expect(listOf('text, border,,')).toEqual(['text', 'border']);
    expect(listOf(undefined)).toEqual([]);
  });

  it('exports the measuring module, with its types', () => {
    // The declarations sit next to the module, so TypeScript reads them here
    // too: a function used in these tests must be declared.
    expect(pkg.exports['./harness/measure']).toEqual({
      types: './harness/dev.harnesspm/scripts/measure.d.mts',
      default: './harness/dev.harnesspm/scripts/measure.mjs',
    });
    expect(Object.keys(measure).sort()).toEqual([
      'FORMATS',
      'SCHEMES',
      'WCAG_PRESETS',
      'filterThemes',
      'formatVariant',
      'inspectColor',
      'inspectTheme',
      'kindOf',
      'measurePair',
      'missesOf',
      'parseColor',
      'roleOf',
      'themesFromObject',
      'themesFromSnapshot',
    ]);
  });
});
