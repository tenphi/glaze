import { glaze } from './glaze';
import { apcaContrast } from './contrast-solver';
import {
  apcaLuminanceFromLinearRgb,
  contrastRatioFromLuminance,
  okhslToLinearSrgb,
  relativeLuminanceFromLinearRgb,
} from './okhsl-color-math';
import { variantToOkhsl } from './okhst';
import type {
  GlazeColorInput,
  GlazeColorInputExport,
  GlazeColorToken,
  GlazeColorTokenExport,
  GlazeColorValue,
  GlazeFromInput,
  ResolvedColor,
  ResolvedColorVariant,
  RoleInput,
} from './types';

const SCHEMES = ['light', 'dark', 'lightContrast', 'darkContrast'] as const;

/** Signed APCA Lc with `text` drawn on `bg`. */
function lc(text: ResolvedColorVariant, bg: ResolvedColorVariant): number {
  const y = (v: ResolvedColorVariant): number => {
    const c = variantToOkhsl(v);
    return apcaLuminanceFromLinearRgb(
      okhslToLinearSrgb(c.h, c.s, c.l, v.pastel),
    );
  };
  return apcaContrast(y(text), y(bg));
}

/** WCAG ratio between two resolved variants. */
function wcag(a: ResolvedColorVariant, b: ResolvedColorVariant): number {
  const y = (v: ResolvedColorVariant): number => {
    const c = variantToOkhsl(v);
    return relativeLuminanceFromLinearRgb(
      okhslToLinearSrgb(c.h, c.s, c.l, v.pastel),
    );
  };
  return contrastRatioFromLuminance(y(a), y(b));
}

/** The four variants without `name`, for comparing tokens across labels. */
function variants(color: ResolvedColor) {
  return SCHEMES.map((s) => color[s]);
}

/** A static copy of `value`: the explicit form of the hidden seed anchor. */
function staticAnchor(value: string) {
  return glaze.color({ from: value, mode: 'static' });
}

/** Rehydrate `token` from its export after a trip through JSON. */
function roundTrip(token: GlazeColorToken): GlazeColorToken {
  return glaze.colorFrom(
    JSON.parse(JSON.stringify(token.export())) as GlazeColorTokenExport,
  );
}

describe('glaze.color role', () => {
  // Escalated high-contrast floors on mid-tone seeds can be out of reach;
  // the unmet-floor warnings are expected and not under test here.
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('without a base', () => {
    it.each(['#b3b3b3', '#3a3a8a', '#ffffff', '#202020'])(
      'solves an APCA floor as text on its own input color (%s)',
      (value) => {
        const noBase = glaze
          .color({ from: value, contrast: { apca: 60 } })
          .resolve();
        const withBase = glaze
          .color({
            from: value,
            base: staticAnchor(value),
            contrast: { apca: 60 },
          })
          .resolve();
        expect(variants(noBase)).toEqual(variants(withBase));
      },
    );

    it('measures the floor with the token as the foreground', () => {
      const anchor = staticAnchor('#ffffff').resolve();
      const token = glaze
        .color({ from: '#ffffff', contrast: { apca: 60 } })
        .resolve();
      // Text on white: |Lc| lands on the floor with the token as text.
      expect(Math.abs(lc(token.light, anchor.light))).toBeCloseTo(60.5, 0);
      // Read the other way round the pair scores higher, so a background
      // solve would have stopped at a lighter tone.
      expect(Math.abs(lc(anchor.light, token.light))).toBeGreaterThan(65);
    });

    it('matches the base-linked default in the structured form', () => {
      const seed = { hue: 280, saturation: 60, tone: 30 } as const;
      const noBase = glaze
        .color({ ...seed, contrast: { apca: 'content' } })
        .resolve();
      const withBase = glaze
        .color({
          ...seed,
          base: glaze.color({ ...seed, mode: 'static' }),
          contrast: { apca: 'content' },
        })
        .resolve();
      expect(variants(noBase)).toEqual(variants(withBase));
    });

    it('applies the default to a relative tone anchored to the seed', () => {
      const noBase = glaze
        .color({ from: '#3a3a8a', tone: '+40', contrast: { apca: 75 } })
        .resolve();
      const asText = glaze
        .color({
          from: '#3a3a8a',
          tone: '+40',
          contrast: { apca: 75 },
          role: 'text',
        })
        .resolve();
      expect(variants(noBase)).toEqual(variants(asText));
    });
  });

  describe('explicit role', () => {
    it('still wins without a base', () => {
      const anchor = staticAnchor('#ffffff').resolve();
      const asText = glaze
        .color({ from: '#ffffff', contrast: { apca: 60 } })
        .resolve();
      const asSurface = glaze
        .color({ from: '#ffffff', contrast: { apca: 60 }, role: 'surface' })
        .resolve();
      expect(asSurface.light.t).not.toBeCloseTo(asText.light.t, 2);
      // The anchor is now the text on the token.
      expect(Math.abs(lc(anchor.light, asSurface.light))).toBeCloseTo(60.5, 0);
      expect(variants(asSurface)).toEqual(
        variants(
          glaze
            .color({
              from: '#ffffff',
              base: staticAnchor('#ffffff'),
              contrast: { apca: 60 },
              role: 'surface',
            })
            .resolve(),
        ),
      );
    });

    it('accepts role aliases', () => {
      const alias = glaze
        .color({ from: '#ffffff', contrast: { apca: 60 }, role: 'bg' })
        .resolve();
      const canonical = glaze
        .color({ from: '#ffffff', contrast: { apca: 60 }, role: 'surface' })
        .resolve();
      expect(variants(alias)).toEqual(variants(canonical));
    });
  });

  describe('name', () => {
    it.each(['card-bg', 'brandFill', 'page-surface', 'label-text'])(
      'does not change the role without a base (%s)',
      (name) => {
        const plain = glaze
          .color({ from: '#ffffff', contrast: { apca: 60 } })
          .resolve();
        const named = glaze
          .color({ from: '#ffffff', contrast: { apca: 60 }, name })
          .resolve();
        expect(named.name).toBe(name);
        expect(variants(named)).toEqual(variants(plain));
      },
    );

    it('does not change the role with a base', () => {
      const bg = glaze.color('#ffffff');
      const plain = glaze
        .color({ from: '#b3b3b3', base: bg, contrast: { apca: 60 } })
        .resolve();
      const named = glaze
        .color({
          from: '#b3b3b3',
          base: bg,
          contrast: { apca: 60 },
          name: 'button-bg',
        })
        .resolve();
      expect(variants(named)).toEqual(variants(plain));
    });

    it('does not change the role in the structured form', () => {
      const input = {
        hue: 280,
        saturation: 60,
        tone: 30,
        contrast: { apca: 'content' },
      } as const;
      const plain = glaze.color(input).resolve();
      const named = glaze.color({ ...input, name: 'card-bg' }).resolve();
      expect(variants(named)).toEqual(variants(plain));
    });

    it('leaves an explicit role in charge', () => {
      const named = glaze
        .color({
          from: '#ffffff',
          contrast: { apca: 60 },
          name: 'label-text',
          role: 'surface',
        })
        .resolve();
      const unnamed = glaze
        .color({ from: '#ffffff', contrast: { apca: 60 }, role: 'surface' })
        .resolve();
      expect(variants(named)).toEqual(variants(unnamed));
    });
  });

  describe('export / colorFrom', () => {
    it("round-trips a token without a role, which resolves as 'text'", () => {
      const input = { from: '#ffffff', contrast: { apca: 60 } } as const;
      const token = glaze.color(input);
      const original = variants(token.resolve());
      expect(original).toEqual(
        variants(glaze.color({ ...input, role: 'text' }).resolve()),
      );
      expect(original).not.toEqual(
        variants(glaze.color({ ...input, role: 'surface' }).resolve()),
      );
      expect(variants(roundTrip(token).resolve())).toEqual(original);
    });

    const white = glaze.color('#ffffff');
    const valueRole = (data: GlazeColorTokenExport) => data.overrides?.role;
    const structuredRole = (data: GlazeColorTokenExport) =>
      (data.input as GlazeColorInputExport).role;

    it.each<{
      title: string;
      input: GlazeFromInput | GlazeColorInput;
      role: RoleInput;
      /** Reads the role back out of the export. */
      exported: (data: GlazeColorTokenExport) => RoleInput | undefined;
    }>([
      {
        title: 'value form',
        input: { from: '#ffffff', contrast: { apca: 60 } },
        role: 'surface',
        exported: valueRole,
      },
      {
        title: 'value form, alias',
        input: { from: '#ffffff', contrast: { apca: 60 } },
        role: 'bg',
        exported: valueRole,
      },
      {
        title: 'value form with a base',
        input: { from: '#b3b3b3', base: white, contrast: { apca: 60 } },
        role: 'surface',
        exported: valueRole,
      },
      {
        title: 'structured form',
        input: {
          hue: 280,
          saturation: 60,
          tone: 30,
          contrast: { apca: 'content' },
        },
        role: 'surface',
        exported: structuredRole,
      },
      {
        title: 'structured form with a base',
        input: {
          hue: 280,
          saturation: 60,
          tone: 30,
          base: white,
          contrast: { apca: 'content' },
        },
        role: 'surface',
        exported: structuredRole,
      },
    ])(
      'round-trips an explicit role $role in the $title',
      ({ input, role, exported }) => {
        const token = glaze.color({ ...input, role });
        const original = variants(token.resolve());
        // The role changes this token, so dropping it cannot go unnoticed.
        expect(original).not.toEqual(variants(glaze.color(input).resolve()));

        expect(exported(token.export())).toBe(role);
        const restored = roundTrip(token);
        expect(exported(restored.export())).toBe(role);
        expect(variants(restored.resolve())).toEqual(original);
      },
    );
  });
});

describe('glaze.color links', () => {
  beforeEach(() => {
    glaze.resetConfig();
  });

  // A structured base renders through its own windows; a link resolves against
  // what it paints, in light too, whatever config the base carries.
  it.each([
    ['no config', undefined],
    ['its own lightTone', { lightTone: [20, 100] as [number, number] }],
    ['its own darkTone', { darkTone: [20, 80] as [number, number] }],
    ['its own contrastLevel', { contrastLevel: 60 }],
  ])('lands on a structured base with %s', (_title, config) => {
    const base = glaze.color({ hue: 280, saturation: 40, tone: 50 }, config);
    const painted = base.resolve();

    const same = glaze.color({ from: '#808080', base, tone: '+0' }).resolve();
    const up = glaze.color({ from: '#808080', base, tone: '+4' }).resolve();
    for (const scheme of SCHEMES) {
      expect(same[scheme].t).toBeCloseTo(painted[scheme].t, 9);
    }
    expect((up.light.t - painted.light.t) * 100).toBeCloseTo(4, 9);
    expect((up.lightContrast.t - painted.lightContrast.t) * 100).toBeCloseTo(
      4,
      9,
    );

    const text = glaze
      .color({ from: '#808080', base, contrast: 'AA' })
      .resolve();
    for (const scheme of SCHEMES) {
      expect(wcag(text[scheme], painted[scheme])).toBeGreaterThanOrEqual(4.5);
    }
  });
});

// Pins the component scales the `GlazeColorValue` JSDoc documents.
describe('glaze.color value strings', () => {
  /** The token's four variants as `rgb()` strings. */
  const rgbOf = (value: GlazeColorValue) =>
    glaze.color(value).json({ format: 'rgb' });

  it.each<{ title: string; forms: GlazeColorValue[] }>([
    {
      title: 'rgb() channels as 0–255 or percentages',
      forms: ['rgb(255 0 0)', 'rgb(100% 0% 0%)', { r: 255, g: 0, b: 0 }],
    },
    {
      title: 'hsl() saturation and lightness as percentages or fractions',
      forms: [
        'hsl(120 50% 50%)',
        'hsl(120, 0.5, 0.5)',
        { r: 63.75, g: 191.25, b: 63.75 },
      ],
    },
    {
      title: 'okhsl() saturation and lightness as percentages or fractions',
      forms: [
        'okhsl(120 50% 50%)',
        'okhsl(120 0.5 0.5)',
        { h: 120, s: 0.5, l: 0.5 },
      ],
    },
    {
      title: 'okhst() saturation and tone as percentages or fractions',
      forms: [
        'okhst(120 50% 50%)',
        'okhst(120 0.5 0.5)',
        { h: 120, s: 0.5, t: 0.5 },
      ],
    },
    {
      title: 'oklch() L as 0–1 or a percentage, and C with 100% as 0.4',
      forms: [
        'oklch(0.5 0.1 120)',
        'oklch(50% 25% 120)',
        { l: 0.5, c: 0.1, h: 120 },
      ],
    },
    {
      title: 'hue as bare degrees or deg',
      forms: ['hsl(180 50% 50%)', 'hsl(180deg 50% 50%)'],
    },
    {
      title: 'hue in turn, rad and grad',
      forms: [
        'okhsl(180 50% 50%)',
        'okhsl(0.5turn 50% 50%)',
        `okhsl(${Math.PI}rad 50% 50%)`,
        'okhsl(200grad 50% 50%)',
        'okhsl(180DEG 50% 50%)',
      ],
    },
    {
      title: 'none as 0',
      forms: ['oklch(0.5 none 120)', 'oklch(0.5 0 120)'],
    },
    {
      title: 'an rgb() channel past 255 or below 0 as clamped',
      forms: ['rgb(300 -20 0)', 'rgb(255 0 0)', 'rgb(120% 0% 0%)'],
    },
    {
      title: 'an hsl() percentage past 100% as clamped',
      forms: ['hsl(120 150% 50%)', 'hsl(120 100% 50%)'],
    },
    {
      title: 'an oklch() lightness past 1 and a negative chroma as clamped',
      forms: ['oklch(1.2 -0.1 120)', 'oklch(1 0 120)'],
    },
  ])('reads $title', ({ forms }) => {
    const [first, ...rest] = forms.map(rgbOf);
    for (const other of rest) expect(other).toEqual(first);
  });

  it.each([
    'hsl(abc 50% 50%)',
    'rgb(1px 0 0)',
    'rgb(1e999 0 0)',
    'oklch(0.5 0.1 120%)',
    'okhsl(120 50%% 50%)',
    'rgb(-- 0 0)',
  ])('rejects %s, naming the component', (value) => {
    expect(() => glaze.color(value)).toThrow(/^glaze: invalid component "/);
  });

  it.each<[GlazeColorValue, string]>([
    [{ h: 0, s: -0.1, l: 0.5 }, 'OkhslColor s must be 0 or more (got -0.1)'],
    [{ h: 0, s: 0.5, l: -0.1 }, 'OkhslColor l must be 0 or more (got -0.1)'],
    [{ h: 0, s: -0.1, t: 0.5 }, 'OkhstColor s must be 0 or more (got -0.1)'],
    [{ l: -0.1, c: 0.1, h: 0 }, 'OklchColor l must be 0 or more (got -0.1)'],
    [{ l: 0.5, c: -0.1, h: 0 }, 'OklchColor c must be 0 or more (got -0.1)'],
  ])('rejects a negative component in %j, naming it', (value, message) => {
    expect(() => glaze.color(value)).toThrow(`glaze.color: ${message}.`);
  });

  it('reads value objects by property access, like a theme color', () => {
    class Rgb {
      #r: number;
      #g: number;
      #b: number;
      constructor(r: number, g: number, b: number) {
        this.#r = r;
        this.#g = g;
        this.#b = b;
      }
      get r() {
        return this.#r;
      }
      get g() {
        return this.#g;
      }
      get b() {
        return this.#b;
      }
    }
    const plain = (value: GlazeColorValue) => glaze.color(value).json();
    expect(plain(new Rgb(51, 102, 255))).toEqual(
      plain({ r: 51, g: 102, b: 255 }),
    );
    expect(plain(Object.create({ h: 250, s: 0.5, l: 0.5 }))).toEqual(
      plain({ h: 250, s: 0.5, l: 0.5 }),
    );
    expect(
      glaze
        .color({
          from: new Rgb(51, 102, 255),
          base: new Rgb(255, 255, 255),
          contrast: 'AA',
        })
        .json(),
    ).toEqual(
      glaze.color({ from: '#3366ff', base: '#ffffff', contrast: 'AA' }).json(),
    );
    expect(
      glaze
        .color({
          hue: 250,
          saturation: 80,
          tone: 50,
          base: new Rgb(255, 255, 255),
          contrast: 'AA',
        })
        .json(),
    ).toEqual(
      glaze
        .color({
          hue: 250,
          saturation: 80,
          tone: 50,
          base: '#ffffff',
          contrast: 'AA',
        })
        .json(),
    );
  });

  it('warns once per string when a theme color re-parses it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const theme = glaze(0, 0);
      theme.colors({ a: { from: 'rgb(10 20 30 / 0.5)' } });
      theme.resolve();
      glaze.configure({});
      theme.resolve();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toBe(
        'glaze: alpha component dropped from "rgb(10 20 30 / 0.5)"; use the color\'s `opacity` (or a transparent mix) for translucency.',
      );
    } finally {
      warn.mockRestore();
      glaze.resetConfig();
    }
  });

  it.each([
    '#26fcb2cc',
    'rgb(38 252 178 / 0.8)',
    'rgba(38, 252, 178, 0.8)',
    'rgb(38 252 178 0.8)',
  ])('drops the alpha component of %s with a warning', (value) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(rgbOf(value)).toEqual(rgbOf('rgb(38 252 178)'));
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain(
        `alpha component dropped from "${value}"`,
      );
    } finally {
      warn.mockRestore();
    }
  });
});

describe('glaze.color input and snapshots are detached', () => {
  afterEach(() => {
    glaze.resetConfig();
  });

  it('copies its input, so editing it later changes nothing', () => {
    const tone: [string, string] = ['+10', '+20'];
    const contrast = { apca: [45, 60] as [number, number] };
    const base = { h: 250, s: 0.3, l: 0.9 };
    const value = { h: 250, s: 0.6, l: 0.4 };
    const input = { from: value, base, tone, contrast } as GlazeFromInput;
    const token = glaze.color(input);
    const before = token.resolve();
    const exported = JSON.stringify(token.export());

    tone[0] = '+40';
    contrast.apca[0] = 90;
    base.l = 0.2;
    value.l = 0.8;
    glaze.configure({}); // drop the resolve cache

    expect(token.resolve()).toEqual(before);
    expect(JSON.stringify(token.export())).toBe(exported);
  });

  it('copies a structured input', () => {
    const input = {
      hue: 250,
      saturation: 60,
      tone: [40, 30] as [number, number],
      base: { h: 250, s: 0.3, l: 0.9 },
      contrast: { wcag: 'AA' as const },
    };
    const token = glaze.color(input);
    const before = token.resolve();
    input.tone[1] = 80;
    input.base.l = 0.1;
    input.contrast.wcag = 'AAA' as 'AA';
    glaze.configure({});
    expect(token.resolve()).toEqual(before);
  });

  it('hands out a snapshot editing which never reaches the token', () => {
    const token = glaze.color({
      from: '#5b4cff',
      tone: ['-4', '-8'],
      base: glaze.color('#f0f0f0'),
      contrast: { apca: [60, 75] },
    });
    const first = token.export();
    const pristine = JSON.stringify(first);
    const overrides = first.overrides!;
    (overrides.tone as string[])[0] = '+40';
    (overrides.contrast as { apca: number[] }).apca[0] = 15;
    (overrides.base as GlazeColorTokenExport).config = { lightTone: false };
    expect(JSON.stringify(token.export())).toBe(pristine);
  });

  it('snapshots a raw base as its token, config frozen', () => {
    const token = glaze.color({
      from: '#5b4cff',
      base: '#f0f0f0',
      contrast: 'AA',
    });
    const exported = token.export();
    expect(glaze.isColorTokenExport(exported.overrides!.base)).toBe(true);

    const restored = glaze.colorFrom(
      JSON.parse(JSON.stringify(exported)) as GlazeColorTokenExport,
    );
    const before = restored.resolve();
    expect(before).toEqual(token.resolve());

    // A later global change reaches neither the token nor its base.
    glaze.configure({ lightTone: [20, 90], darkTone: [25, 80] });
    expect(restored.resolve()).toEqual(before);
  });

  it('reads structured and override fields by property access', () => {
    // Accessor fields, as a reactive store's class compiles to.
    class Input {
      #data = {
        hue: 10,
        saturation: 50,
        tone: 30,
        mode: 'fixed' as const,
        opacity: 0.5,
      };
      get hue() {
        return this.#data.hue;
      }
      get saturation() {
        return this.#data.saturation;
      }
      get tone() {
        return this.#data.tone;
      }
      get mode() {
        return this.#data.mode;
      }
      get opacity() {
        return this.#data.opacity;
      }
    }
    const plain = { hue: 10, saturation: 50, tone: 30, mode: 'fixed' } as const;
    const token = glaze.color(new Input());
    expect(token.json()).toEqual(
      glaze.color({ ...plain, opacity: 0.5 }).json(),
    );
    expect(token.export().input).toEqual({ ...plain, opacity: 0.5 });

    // A non-enumerable token base still counts.
    const withBase = { hue: 200, saturation: 40, tone: 30, contrast: 'AA' };
    Object.defineProperty(withBase, 'base', {
      value: glaze.color('#1a1a2e'),
      enumerable: false,
    });
    expect(glaze.color(withBase as GlazeColorInput).json()).toEqual(
      glaze
        .color({ ...withBase, base: glaze.color('#1a1a2e') } as GlazeColorInput)
        .json(),
    );

    // The value form reads its overrides the same way.
    class From {
      #data = { from: '#3366cc', tone: '-10' as const };
      get from() {
        return this.#data.from;
      }
      get tone() {
        return this.#data.tone;
      }
    }
    expect(glaze.color(new From() as GlazeFromInput).json()).toEqual(
      glaze.color({ from: '#3366cc', tone: '-10' }).json(),
    );
  });

  it('clamps a value object field between 1 and 1.5 like a string', () => {
    const json = (value: GlazeColorValue) => glaze.color(value).json();
    expect(json({ h: 30, s: 1.3, l: 0.5 })).toEqual(json('okhsl(30 100% 50%)'));
    expect(json({ h: 30, s: 1.3, t: 0.5 })).toEqual(json('okhst(30 100% 50%)'));
    expect(json({ l: 1.2, c: 0.1, h: 30 })).toEqual(json('oklch(1 0.1 30)'));
  });

  it('rejects a structured darkHue that is neither a number nor an offset', () => {
    const input = { hue: 250, saturation: 60, tone: 50 };
    expect(() => glaze.color({ ...input, darkHue: '+20' })).not.toThrow();
    expect(() =>
      glaze.color({ ...input, darkHue: '10' as `+${number}` }),
    ).toThrow(`offset (got "10").`);
    for (const darkHue of [Number.NaN, '+abc', '20', '+-5']) {
      expect(() =>
        glaze.color({ ...input, darkHue: darkHue as number }),
      ).toThrow(
        /^glaze\.color: structured darkHue must be a finite number or a '\+N' \/ '-N' offset/,
      );
    }
  });
});

describe('glaze.color copies by property access', () => {
  it('takes a reactive (proxy) contrast and keeps it detached', () => {
    const contrast = new Proxy({ wcag: [4.5, 7] as [number, number] }, {});
    const token = glaze.color({ from: '#3366cc', base: '#ffffff', contrast });
    const reference = glaze.color({
      from: '#3366cc',
      base: '#ffffff',
      contrast: { wcag: [4.5, 7] },
    });
    expect(token.json()).toEqual(reference.json());
    expect(token.export()).toEqual(reference.export());

    const pair = new Proxy(['AA', 'AAA'] as ['AA', 'AAA'], {});
    expect(
      glaze
        .color({ hue: 250, saturation: 60, tone: 40, contrast: pair })
        .json(),
    ).toEqual(
      glaze
        .color({ hue: 250, saturation: 60, tone: 40, contrast: ['AA', 'AAA'] })
        .json(),
    );
  });

  it('exports a value object with extra fields as its color only', () => {
    const value = {
      r: 10,
      g: 20,
      b: 30,
      toJSON() {
        return 'ignored';
      },
    };
    expect(glaze.color(value).export().input).toEqual({ r: 10, g: 20, b: 30 });
  });

  it('exports a long chain of links in linear time', () => {
    let token = glaze.color('#808080');
    for (let i = 0; i < 1000; i++) {
      token = glaze.color({
        from: '#3366cc',
        base: token,
        tone: i % 2 ? '+1' : '-1',
      });
    }
    const start = performance.now();
    const snapshot = token.export();
    expect(performance.now() - start).toBeLessThan(250);
    let depth = 0;
    for (
      let node: GlazeColorTokenExport | undefined = snapshot;
      node !== undefined;
      node = node.overrides?.base as GlazeColorTokenExport | undefined
    ) {
      depth++;
    }
    expect(depth).toBe(1001);
  });
});
