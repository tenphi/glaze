import { glaze } from './glaze';
import { hasRelativeTone, validateColorDefs } from './validation';
import type { ColorDef, ContrastSpec } from './types';

afterEach(() => {
  glaze.resetConfig();
});

describe('hasRelativeTone', () => {
  it('checks both entries of a pair', () => {
    expect(hasRelativeTone(undefined)).toBe(false);
    expect(hasRelativeTone(50)).toBe(false);
    expect(hasRelativeTone('max')).toBe(false);
    expect(hasRelativeTone('+20')).toBe(true);
    expect(hasRelativeTone([50, 70])).toBe(false);
    expect(hasRelativeTone([50, 'min'])).toBe(false);
    expect(hasRelativeTone(['+20', 70])).toBe(true);
    expect(hasRelativeTone([50, '+20'])).toBe(true);
  });
});

describe('relative tone without base', () => {
  const message = 'glaze: color "odd" has relative "tone" without "base".';

  it('throws for a relative high-contrast entry on a root color', () => {
    expect(() => validateColorDefs({ odd: { tone: [50, '+20'] } })).toThrow(
      message,
    );

    const theme = glaze(0, 0);
    theme.colors({ odd: { tone: [50, '+20'] } });
    expect(() => theme.resolve()).toThrow(message);
  });

  it('throws for a relative normal entry, as before', () => {
    expect(() => validateColorDefs({ odd: { tone: ['+20', 50] } })).toThrow(
      message,
    );
    expect(() => validateColorDefs({ odd: { tone: '-10' } })).toThrow(message);
  });

  it('throws at every contrast level', () => {
    for (const contrastLevel of [0, 50, 100]) {
      glaze.configure({ contrastLevel });
      const theme = glaze(0, 0);
      theme.colors({ odd: { tone: [50, '+20'] } });
      expect(() => theme.resolve()).toThrow(message);
    }
  });

  it('allows absolute and extreme entries on a root', () => {
    expect(() =>
      validateColorDefs({ a: { tone: [50, 70] }, b: { tone: [50, 'max'] } }),
    ).not.toThrow();
  });

  it('resolves a relative high-contrast entry against its base', () => {
    const theme = glaze(0, 0);
    theme.colors({
      bg: { tone: 90 },
      odd: { base: 'bg', tone: [50, '-20'] },
    });
    const r = theme.resolve();
    const bg = r.get('bg')!;
    const odd = r.get('odd')!;

    // Normal: absolute tone 50 through the default light window.
    expect(odd.light.t).toBeCloseTo(0.5247, 4);
    // High contrast: an exact delta from the base in that scheme.
    expect(odd.lightContrast.t).toBeCloseTo(bg.lightContrast.t - 0.2, 10);
    // Dark high contrast, mode 'auto': the step keeps its contrast, inverted.
    expect(odd.darkContrast.t).toBeCloseTo(bg.darkContrast.t + 0.2, 10);
  });

  it("anchors a token's relative high-contrast entry to its own color", () => {
    // A token measures a delta from its input color when it has no `base`; a
    // delta in the high-contrast entry must do the same, not read as tone 20.
    const seedTone = glaze.color('#808080').resolve().light.t;
    const token = glaze.color({ from: '#808080', tone: [50, '+20'] });
    const r = token.resolve();
    expect(r.light.t).toBeCloseTo(0.5, 10);
    expect(r.lightContrast.t).toBeCloseTo(seedTone + 0.2, 10);
  });
});

describe('contrast spec', () => {
  const contrastOf = (contrast: unknown) =>
    validateColorDefs({
      bg: { tone: 90 },
      fg: { base: 'bg', contrast: contrast as ContrastSpec },
    });

  it.each<unknown>([
    4.5,
    'AA',
    'AAA-large',
    { wcag: 7 },
    { wcag: ['AA', 'AAA'] },
    { apca: 60 },
    { apca: 'body' },
    { apca: [60, 'preferred'] },
    ['AA', { wcag: 'AAA' }],
    [{ wcag: 3 }, 7],
    { apca: 60, wcag: undefined },
    { wcag: 4.5, apca: undefined },
    { apca: 60, note: 'body copy' },
  ])('accepts %j', (contrast) => {
    expect(() => contrastOf(contrast)).not.toThrow();
  });

  it('reads a metric key holding undefined as unset', () => {
    const fg = (contrast: unknown) => {
      const theme = glaze(250, 80);
      theme.colors({
        s: { tone: 97 },
        x: { base: 's', tone: '-10', contrast: contrast as ContrastSpec },
      });
      return theme.tokens({ format: 'oklch' });
    };
    expect(fg({ apca: 60, wcag: undefined })).toEqual(fg({ apca: 60 }));
    expect(fg({ wcag: 4.5, apca: undefined })).toEqual(fg({ wcag: 4.5 }));
  });

  it.each<unknown>([
    'aa',
    'AAA_large',
    NaN,
    Infinity,
    { apca: 'Body' },
    { wcag: 'body' },
    { apca: NaN },
    {},
    { wcag: 4.5, apca: 60 },
    { lc: 60 },
    ['AA'],
    ['AA', 'AAA', 'AAA'],
    { apca: [60] },
    { wcag: undefined },
    // eslint-disable-next-line no-sparse-arrays
    [, 7],
    // eslint-disable-next-line no-sparse-arrays
    { wcag: [, 7] },
    null,
  ])('rejects %j, naming the color', (contrast) => {
    expect(() => contrastOf(contrast)).toThrow(
      /^glaze: color "fg" has an invalid "contrast"/,
    );
  });

  it('rejects a malformed contrast on a mix', () => {
    expect(() =>
      validateColorDefs({
        a: { tone: 90 },
        b: { tone: 10 },
        m: {
          type: 'mix',
          base: 'a',
          target: 'b',
          value: 50,
          contrast: 'aa' as ContrastSpec,
        },
      }),
    ).toThrow('glaze: color "m" has an invalid "contrast" "aa".');
  });

  it('throws from a theme at resolve', () => {
    const theme = glaze(0, 0);
    theme.colors({
      bg: { tone: 90 },
      fg: { base: 'bg', contrast: 'aa' as ContrastSpec },
    });
    expect(() => theme.resolve()).toThrow(/invalid "contrast" "aa"/);
  });
});

describe('numeric fields', () => {
  /** Validate a regular color `c` on a tone-50 base. */
  const fieldOf = (def: Record<string, unknown>) =>
    validateColorDefs({ base: { tone: 50 }, c: { base: 'base', ...def } });

  it.each<[string, unknown]>([
    ['tone', 50],
    ['tone', '+4'],
    ['tone', '-.5'],
    ['tone', '+1e1'],
    ['tone', 'max'],
    ['tone', [40, '-10']],
    ['tone', '-5 '],
    ['tone', ' +5'],
    ['hue', 120],
    ['hue', '-30'],
    ['darkHue', '+15'],
    ['saturation', 40],
    ['darkSaturation', 0],
    ['opacity', 0],
    ['opacity', 1],
  ])('accepts %s %j', (field, value) => {
    expect(() => fieldOf({ [field]: value })).not.toThrow();
  });

  it.each<[string, unknown]>([
    ['tone', NaN],
    ['tone', Infinity],
    ['tone', '+-5'],
    ['tone', '+abc'],
    ['tone', '4'],
    ['tone', [40, NaN]],
    ['tone', [40]],
    // eslint-disable-next-line no-sparse-arrays
    ['tone', [, 40]],
    ['tone', null],
    ['hue', NaN],
    ['hue', 'max'],
    ['darkHue', Infinity],
    ['saturation', NaN],
    ['saturation', '+10'],
    ['darkSaturation', NaN],
    ['opacity', 1.5],
    ['opacity', -0.1],
    ['opacity', NaN],
  ])('rejects %s %j, naming the color and field', (field, value) => {
    expect(() => fieldOf({ [field]: value })).toThrow(
      new RegExp(`^glaze: color "c" has an invalid "${field}"`),
    );
  });

  it('rejects a non-finite mix value', () => {
    expect(() =>
      validateColorDefs({
        a: { tone: 90 },
        b: { tone: 10 },
        m: { type: 'mix', base: 'a', target: 'b', value: NaN },
      }),
    ).toThrow('glaze: color "m" has an invalid "value" NaN.');
  });

  it('rejects a non-finite shadow intensity', () => {
    expect(() =>
      validateColorDefs({
        bg: { tone: 90 },
        s: { type: 'shadow', bg: 'bg', intensity: [10, NaN] },
      }),
    ).toThrow('glaze: color "s" has an invalid "intensity" [10,NaN].');
  });

  it('rejects a shadow or glow without bg, naming it', () => {
    for (const type of ['shadow', 'glow'] as const) {
      expect(() =>
        validateColorDefs({
          s: { type, intensity: 10 } as unknown as ColorDef,
        }),
      ).toThrow(`glaze: ${type} "s" is missing "bg".`);
    }
  });

  it('rejects a theme seed that is not a finite number', () => {
    expect(() => glaze(NaN, 50)).toThrow(
      'glaze: theme seed hue must be a finite number (got NaN).',
    );
    expect(() => glaze({ hue: 250, saturation: Infinity })).toThrow(
      'glaze: theme seed saturation must be a finite number (got Infinity).',
    );
    expect(() => glaze({ hue: 250, saturation: 50, darkHue: NaN })).toThrow(
      'glaze: theme seed darkHue must be a finite number (got NaN).',
    );
  });
});
