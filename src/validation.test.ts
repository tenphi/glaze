import { glaze } from './glaze';
import { hasRelativeTone, validateColorDefs } from './validation';

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
