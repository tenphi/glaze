import { glaze } from './glaze';
import { apcaContrast } from './contrast-solver';
import {
  apcaLuminanceFromLinearRgb,
  okhslToLinearSrgb,
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
  ])('reads $title', ({ forms }) => {
    const [first, ...rest] = forms.map(rgbOf);
    for (const other of rest) expect(other).toEqual(first);
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
