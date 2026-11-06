import { glaze } from './glaze';
import {
  contrastRatioFromLuminance,
  gamutClampedLuminance,
  okhslToLinearSrgb,
} from './okhsl-color-math';
import { variantToOkhsl } from './okhst';
import type * as ContrastSolver from './contrast-solver';
import type {
  FindToneForContrastOptions,
  FindToneForContrastResult,
} from './contrast-solver';
import type {
  RegularColorDef,
  ResolvedColor,
  ResolvedColorVariant,
} from './types';

/**
 * The resolver's tone solver, swappable per test. The resolver measures the
 * real chromatic color, so a variant it reports as met can't drift on its
 * own; to exercise the drift advisory, a test stands in a solver that
 * measures something else (e.g. the gray tone) and reports that as met.
 */
const solver = vi.hoisted(() => ({
  findTone: undefined as
    | ((
        opts: FindToneForContrastOptions,
        real: (o: FindToneForContrastOptions) => FindToneForContrastResult,
      ) => FindToneForContrastResult)
    | undefined,
}));

vi.mock('./contrast-solver', async (importOriginal) => {
  const actual = await importOriginal<typeof ContrastSolver>();
  return {
    ...actual,
    findToneForContrast: (opts: FindToneForContrastOptions) =>
      solver.findTone
        ? solver.findTone(opts, actual.findToneForContrast)
        : actual.findToneForContrast(opts),
  };
});

afterEach(() => {
  solver.findTone = undefined;
});

/** Run `fn` and return every `console.warn` message it printed. */
function captureWarnings(fn: () => void): string[] {
  const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    fn();
    return spy.mock.calls.map((c) => String(c[0]));
  } finally {
    spy.mockRestore();
  }
}

function schemeOf(message: string): string | undefined {
  return /in (\w+) scheme/.exec(message)?.[1];
}

function wcag(a: ResolvedColorVariant, b: ResolvedColorVariant): number {
  const y = (v: ResolvedColorVariant) => {
    const c = variantToOkhsl(v);
    return gamutClampedLuminance(okhslToLinearSrgb(c.h, c.s, c.l));
  };
  return contrastRatioFromLuminance(y(a), y(b));
}

describe('mix contrast warnings', () => {
  it('warns once per scheme when the floor is out of reach, across resolves', () => {
    const resolveWash = () => {
      const theme = glaze(0, 0);
      theme.colors({
        surface: { tone: 50 },
        accent: { tone: 62 },
        'unmet-wash': {
          type: 'mix',
          base: 'surface',
          target: 'accent',
          value: 20,
          contrast: 'AA',
        },
      });
      return theme.resolve();
    };

    let resolved!: Map<string, ResolvedColor>;
    const warnings = captureWarnings(() => {
      resolved = resolveWash();
      resolveWash();
    });

    const mix = warnings.filter((m) => m.includes('mix "unmet-wash"'));
    expect(mix.map(schemeOf)).toEqual([
      'light',
      'lightContrast',
      'dark',
      'darkContrast',
    ]);
    expect(mix[0]).toContain(
      'mix "unmet-wash" cannot meet WCAG 4.50 against its base in light scheme',
    );
    expect(mix[0]).toContain('Even the pure target falls short');
    // 'AA' escalates to 'AAA' in high contrast.
    expect(mix[1]).toContain('cannot meet WCAG 7.00');
    // Mixes are not re-measured, so there is no drift advisory on top.
    expect(warnings.some((m) => m.includes('drifts below'))).toBe(false);

    // The mix settles at the pure target, and the warning reports its contrast.
    const wash = resolved.get('unmet-wash')!.light;
    const accent = resolved.get('accent')!.light;
    const surface = resolved.get('surface')!.light;
    expect(wash.t).toBeCloseTo(accent.t, 6);
    expect(mix[0]).toContain(`(got ${wcag(wash, surface).toFixed(2)})`);
  });

  it('warns for a transparent mix too, once per session', () => {
    const resolveWash = () => {
      const theme = glaze(0, 0);
      theme.colors({
        surface: { tone: 50 },
        accent: { tone: 62 },
        'deduped-wash': {
          type: 'mix',
          base: 'surface',
          target: 'accent',
          value: 20,
          blend: 'transparent',
          contrast: 3,
        },
      });
      theme.resolve();
    };

    const first = captureWarnings(resolveWash);
    const second = captureWarnings(resolveWash);
    expect(first.filter((m) => m.includes('"deduped-wash"'))).toHaveLength(4);
    expect(second).toEqual([]);
  });

  it('reports the base when a value of 100 falls back to it', () => {
    let resolved!: Map<string, ResolvedColor>;
    const warnings = captureWarnings(() => {
      const theme = glaze(0, 0);
      theme.colors({
        surface: { tone: 50 },
        accent: { tone: 62 },
        'full-wash': {
          type: 'mix',
          base: 'surface',
          target: 'accent',
          value: 100,
          contrast: 'AA',
        },
      });
      resolved = theme.resolve();
    });

    expect(resolved.get('full-wash')!.light.t).toBeCloseTo(
      resolved.get('surface')!.light.t,
      6,
    );
    expect(
      warnings.find(
        (m) => m.includes('"full-wash"') && schemeOf(m) === 'light',
      ),
    ).toContain('(got 1.00)');
  });

  it('stays quiet for a mix that meets its floor', () => {
    const warnings = captureWarnings(() => {
      const theme = glaze(280, 80);
      theme.colors({
        surface: { tone: 97 },
        text: { base: 'surface', tone: 15 },
        accent: { tone: 30 },
        'met-border': {
          type: 'mix',
          base: 'surface',
          target: 'text',
          value: 10,
          contrast: 3,
        },
        'met-wash': {
          type: 'mix',
          base: 'surface',
          target: 'accent',
          value: 4,
          blend: 'transparent',
          contrast: 1.25,
        },
      });
      const r = theme.resolve();
      // The floor moved the border: at its authored 10% it is under 3:1.
      expect(r.get('met-border')!.light.t).toBeLessThan(
        r.get('surface')!.light.t - 0.2,
      );
    });
    expect(warnings).toEqual([]);
  });

  it('points at the pastel gamut when it caps the target', () => {
    const warningFor = (target: RegularColorDef) =>
      captureWarnings(() => {
        const theme = glaze(300, 90, { pastel: true });
        theme.colors({
          surface: { tone: 80 },
          brand: target,
          'brand-text': {
            type: 'mix',
            base: 'surface',
            target: 'brand',
            value: 40,
            space: 'srgb',
            contrast: 'AA',
          },
        });
        theme.resolve();
      }).find((m) => m.includes('"brand-text"') && schemeOf(m) === 'light');

    // The vivid brand clears 4.5:1, but the pastel mix paints it capped.
    const capped = warningFor({ tone: 30, pastel: false });
    expect(capped).toContain("once the mix's pastel gamut caps its saturation");
    expect(capped).toContain('`pastel: false` on the mix');
  });

  it('leaves the pastel cap out when the full target misses too', () => {
    const warnings = captureWarnings(() => {
      const theme = glaze(140, 90, { pastel: true });
      theme.colors({
        surface: { tone: 90 },
        brand: { tone: 50, pastel: false },
        'brand-ink': {
          type: 'mix',
          base: 'surface',
          target: 'brand',
          value: 50,
          contrast: 'AA',
        },
      });
      theme.resolve();
    });
    // The capped brand reaches about 3.1:1 and the vivid one about 3.05:1, so
    // `pastel: false` on the mix wouldn't help.
    const light = warnings.find(
      (m) => m.includes('"brand-ink"') && schemeOf(m) === 'light',
    );
    expect(light).toContain('Even the pure target falls short; try lowering');
  });

  it('scores the full target with the floor polarity for the cap hint', () => {
    const warnings = captureWarnings(() => {
      const theme = glaze(84, 95, { pastel: true });
      theme.colors({
        surface: { tone: 15, saturation: 0 },
        accent: { tone: 85, hue: 140, pastel: false },
        'accent-fill': {
          type: 'mix',
          base: 'surface',
          target: 'accent',
          value: 50,
          contrast: { apca: 75 },
          role: 'surface',
        },
      });
      theme.resolve();
    });
    // As a surface the full accent reaches Lc 74.2 (as text it would be
    // 75.7), so `pastel: false` on the mix wouldn't meet Lc 75.
    const light = warnings.find(
      (m) => m.includes('"accent-fill"') && schemeOf(m) === 'light',
    );
    expect(light).toContain('Even the pure target falls short; try lowering');
  });

  it('stays quiet when the pure target misses by less than the slack', () => {
    const build = (contrast?: number) => {
      const theme = glaze(0, 0, { lightTone: false });
      theme.colors({
        surface: { tone: 90 },
        accent: { tone: 40 },
        'slack-wash': {
          type: 'mix',
          base: 'surface',
          target: 'accent',
          value: 20,
          ...(contrast === undefined ? {} : { contrast }),
        },
      });
      return theme.resolve();
    };
    const plain = build();
    const reach = wcag(plain.get('accent')!.light, plain.get('surface')!.light);
    const lightWarnings = (contrast: number) =>
      captureWarnings(() => build(contrast)).filter(
        (m) => m.includes('"slack-wash"') && schemeOf(m) === 'light',
      );

    // 1% short of the target: the solver reports unmet, but that is rounding.
    expect(lightWarnings(reach / 0.99)).toEqual([]);
    // 3% short is past the 2% WCAG slack.
    expect(lightWarnings(reach / 0.97)).toHaveLength(1);
  });
});

describe('contrast drift advisory', () => {
  it('leaves an unmet regular color to the "cannot meet" warning alone', () => {
    const warnings = captureWarnings(() => {
      const theme = glaze(280, 80);
      theme.colors({
        badge: { tone: 50 },
        'unmet-text': { base: 'badge', contrast: 'AAA' },
      });
      const r = theme.resolve();
      // Chromatic, so the achromatic skip plays no part here.
      expect(r.get('unmet-text')!.light.s).toBeGreaterThan(0);
    });

    const own = warnings.filter((m) => m.includes('"unmet-text"'));
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((m) => m.includes('cannot meet'))).toBe(true);
    expect(own.map(schemeOf)).toContain('light');
  });

  it('never fires for an achromatic color', () => {
    // Unmet: only the solver's warning.
    const unmet = captureWarnings(() => {
      const theme = glaze(0, 0);
      theme.colors({
        badge: { tone: 50 },
        'gray-unmet': { base: 'badge', contrast: 'AAA' },
      });
      theme.resolve();
    });
    expect(unmet.some((m) => m.includes('"gray-unmet" cannot meet'))).toBe(
      true,
    );
    expect(unmet.some((m) => m.includes('drifts below'))).toBe(false);

    // A solver that reports met at the authored tone without searching: the
    // shortfall is real, but a gray has no chromatic luminance to blame, so it
    // gets no advisory. The chromatic twin proves the shortfall is measured.
    solver.findTone = (opts) => ({
      tone: opts.preferredTone,
      contrast: opts.contrast.target,
      met: true,
      branch: 'preferred',
    });
    const short = captureWarnings(() => {
      const theme = glaze(150, 80);
      theme.colors({
        surface: { tone: 97, saturation: 0 },
        'gray-short': {
          base: 'surface',
          tone: '-10',
          saturation: 0,
          contrast: 'AA',
        },
        'tinted-short': { base: 'surface', tone: '-10', contrast: 'AA' },
      });
      theme.resolve();
    });
    expect(short.some((m) => m.includes('"gray-short"'))).toBe(false);
    expect(
      short.some((m) => m.includes('"tinted-short" drifts below WCAG 4.50')),
    ).toBe(true);
  });

  it('still fires for a chromatic color whose luminance drifts from its tone', () => {
    // Solve on the gray tone (saturation 0) and report it as met: the emitted
    // full-saturation green reads lighter than that gray, so it lands under AA
    // on a light surface (about 4.25:1).
    solver.findTone = (opts, real) => real({ ...opts, saturation: 0 });
    const warnings = captureWarnings(() => {
      const theme = glaze(150, 100);
      theme.colors({
        surface: { tone: 97, saturation: 0 },
        'drift-text': { base: 'surface', contrast: 'AA' },
      });
      theme.resolve();
    });

    const own = warnings.filter((m) => m.includes('"drift-text"'));
    expect(own.some((m) => m.includes('cannot meet'))).toBe(false);
    const light = own.find(
      (m) => m.includes('drifts below') && schemeOf(m) === 'light',
    );
    expect(light).toContain(
      'color "drift-text" drifts below WCAG 4.50 in light scheme (measured 4.2',
    );
  });
});
