import {
  formatHsl,
  formatOkhsl,
  formatOkhst,
  formatOklch,
  formatRgb,
  okhslToOklab,
  okhslToOklch,
  okhslToSrgb,
  oklabToOkhsl,
  parseHex,
  parseHexAlpha,
  resetScaleWarnings,
  srgbToHex,
  srgbToOkhsl,
} from './okhsl-color-math';
import { glaze } from './glaze';
import { okhslToOkhst, variantToOkhsl } from './okhst';
// The public barrel, so the APCA tests below also prove the export exists.
import * as publicApi from './index';

/**
 * The scale contract: every `format*` writer takes `s` / `l` / `t` on the same
 * 0–1 factor scale every converter in the library *returns*, so composing a
 * producer with a formatter is correct with no rescaling in between. The
 * percentages CSS wants are the writers' own business.
 *
 * This is the whole point of the tests below — the previous 0–100 signature
 * made the obvious composition off by 100x, and it failed silently because
 * `0.7` is a legal percentage.
 */
describe('format* scale', () => {
  const HEX = '#7A4DBF';

  it('reads s / l as 0–1 and emits them as percentages', () => {
    expect(formatOkhsl(280, 0.6, 0.95)).toBe('okhsl(280 60% 95%)');
    expect(formatOkhst(280, 0.6, 0.95)).toBe('okhst(280 60% 95%)');
  });

  it('treats 1 as full saturation / lightness, not 1%', () => {
    // s = 1 is the top of the scale, so the emitted percentage is 100%.
    expect(formatOkhsl(280, 1, 1)).toBe('okhsl(280 100% 100%)');
    // ...and the color is the corresponding near-white, not a near-black.
    expect(srgbToHex(okhslToSrgb(280, 1, 1))).toBe('#ffffff');
  });

  it('agrees with the converters it wraps, given the same 0–1 inputs', () => {
    const [h, s, l] = srgbToOkhsl(parseHex(HEX)!);

    const [r, g, b] = okhslToSrgb(h, s, l);
    expect(formatRgb(h, s, l)).toBe(
      `rgb(${parseFloat((r * 255).toFixed(2))} ${parseFloat((g * 255).toFixed(2))} ${parseFloat((b * 255).toFixed(2))})`,
    );

    const [L, C, hh] = okhslToOklch(h, s, l);
    expect(formatOklch(h, s, l)).toBe(
      `oklch(${parseFloat(L.toFixed(4))} ${parseFloat(C.toFixed(4))} ${parseFloat(hh.toFixed(2))})`,
    );
  });

  it('round-trips a hex through srgbToOkhsl and the rgb writer', () => {
    const [h, s, l] = srgbToOkhsl(parseHex(HEX)!);
    const rgb = formatRgb(h, s, l)
      .slice(4, -1)
      .split(' ')
      .map((n) => Math.round(Number(n)) / 255) as [number, number, number];
    expect(srgbToHex(rgb)).toBe(HEX.toLowerCase());
  });

  it('recomputes a pastel saturation on the 0–1 scale', () => {
    const [h, s, l] = [280, 0.8, 0.6];
    // The pastel branch re-derives the equivalent non-pastel `s` via OKLab so
    // external parsers render it identically; it must feed the converter the
    // factor it was given, not a factor scaled by 100.
    const expected = oklabToOkhsl(okhslToOklab(h, s, l, true), false)[1];
    expect(formatOkhsl(h, s, l, true)).toBe(
      `okhsl(280 ${parseFloat((expected * 100).toFixed(2))}% 60%)`,
    );
  });

  it('produces a near-black only for a genuinely near-black tone', () => {
    // The old failure mode: s / t of 0.7 / 0.45 read as percentages. Those are
    // legitimate values now, and 0.007 / 0.0045 is what actually names the
    // near-black they used to be mistaken for.
    expect(formatOkhst(298.52, 0.7, 0.45)).toBe('okhst(298.52 70% 45%)');
    expect(formatOkhst(298.52, 0.007, 0.0045)).toBe('okhst(298.52 0.7% 0.45%)');
  });

  /**
   * Values above 1 cannot be factors, so they can only be pre-2.0
   * percentage-scale input. The point of the warning is that the old call
   * shape stops being silent — it used to emit a plausible wrong color.
   */
  describe('percentage-scale guard', () => {
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      resetScaleWarnings();
      warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
      warn.mockRestore();
      resetScaleWarnings();
    });

    it('warns when handed 0–100 input', () => {
      formatOkhsl(280, 60, 95);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain('formatOkhsl');
    });

    it('warns once per writer, not once per call', () => {
      formatOkhsl(280, 60, 95);
      formatOkhsl(280, 40, 20);
      expect(warn).toHaveBeenCalledTimes(1);

      formatOklch(280, 60, 95);
      expect(warn).toHaveBeenCalledTimes(2);
    });

    it('stays quiet for in-range values, including the endpoints', () => {
      for (const [s, l] of [
        [0, 0],
        [0.6, 0.95],
        [1, 1],
      ]) {
        formatOkhsl(280, s, l);
        formatOkhst(280, s, l);
        formatRgb(280, s, l);
        formatHsl(280, s, l);
        formatOklch(280, s, l);
      }
      expect(warn).not.toHaveBeenCalled();
    });

    it('ignores hue, which is on its own 0–360 scale', () => {
      formatOkhsl(280, 0.6, 0.95);
      expect(warn).not.toHaveBeenCalled();
    });
  });

  /**
   * The composition the issue reported: read a variant off `resolve()` and
   * re-emit it. Nothing in between rescales, and the value survives a
   * round-trip back through the parser.
   */
  describe('composes with resolve()', () => {
    it('re-emits a resolved variant without rescaling', () => {
      const v = glaze.color(HEX).resolve().light;

      const okhst = formatOkhst(v.h, v.s, v.t);
      const rt = glaze.color(okhst).resolve().light;
      expect(rt.s).toBeCloseTo(v.s, 3);
      expect(rt.t).toBeCloseTo(v.t, 3);

      const okhsl = variantToOkhsl(v);
      const rtl = glaze
        .color(formatOkhsl(okhsl.h, okhsl.s, okhsl.l))
        .resolve().light;
      expect(rtl.s).toBeCloseTo(v.s, 3);
      expect(okhslToOkhst(variantToOkhsl(rtl)).t).toBeCloseTo(v.t, 3);
    });

    it('keeps the color when destructured out of variantToOkhsl', () => {
      // `variantToOkhsl`'s doc points at exactly this composition.
      const v = glaze.color(HEX).resolve().light;
      const { h, s, l } = variantToOkhsl(v);
      expect(srgbToHex(okhslToSrgb(h, s, l))).toBe(HEX.toLowerCase());
      // The writer sees the same color the converter does.
      expect(formatRgb(h, s, l)).toBe('rgb(122 77 191)');
    });
  });
});

/**
 * Hex parsing is strict: `parseInt` alone stops at the first non-hex
 * character, so without an up-front digit check `'#1z2z3z'` read as
 * `#010203` and `'#-1-2-3'` produced negative channels.
 */
describe('hex parsing', () => {
  const INVALID = [
    // 3-digit
    '#1z2',
    '#gab',
    // 4-digit
    '#1z2f',
    '#fffg',
    // 6-digit: each pair's second character used to be ignored
    '#1z2z3z',
    '#12345g',
    '1z2z3z',
    // 8-digit
    '#1z2z3z4z',
    '#ffffffzz',
    // signs, whitespace, and prefixes parseInt would accept
    '#-1-2-3',
    '#+f+f+f',
    ' fffff',
    '#0x12ab',
    '##fff',
    '#',
    '',
  ];

  it.each(INVALID)('rejects %j', (hex) => {
    expect(parseHexAlpha(hex)).toBeNull();
    expect(parseHex(hex)).toBeNull();
  });

  it('still rejects wrong lengths', () => {
    for (const hex of ['#12', '#12345', '#1234567', '#123456789']) {
      expect(parseHexAlpha(hex)).toBeNull();
    }
  });

  it('parses upper-, lower-, and mixed-case digits identically', () => {
    expect(parseHex('#ABCDEF')).toEqual(parseHex('#abcdef'));
    expect(parseHex('#AbCdEf')).toEqual([0xab / 255, 0xcd / 255, 0xef / 255]);
    expect(parseHex('#AbC')).toEqual([0xaa / 255, 0xbb / 255, 0xcc / 255]);
    expect(parseHex('abc')).toEqual(parseHex('#ABC'));
  });

  it('parses the alpha forms', () => {
    expect(parseHexAlpha('#AbCd')).toEqual({
      rgb: [0xaa / 255, 0xbb / 255, 0xcc / 255],
      alpha: 0xdd / 255,
    });
    expect(parseHexAlpha('#7A4DBF80')).toEqual({
      rgb: [0x7a / 255, 0x4d / 255, 0xbf / 255],
      alpha: 0x80 / 255,
    });
    expect(parseHexAlpha('#7a4dbf')).toEqual({
      rgb: [0x7a / 255, 0x4d / 255, 0xbf / 255],
    });
    // parseHex keeps rejecting the alpha forms.
    expect(parseHex('#7a4dbf80')).toBeNull();
    expect(parseHex('#abcd')).toBeNull();
  });

  it('makes every hex entry point throw on a non-hex digit', () => {
    const message = 'glaze: invalid hex color "#1z2z3z".';
    expect(() => glaze.color('#1z2z3z')).toThrow(message);
    expect(() => glaze.fromHex('#1z2z3z')).toThrow(message);
    expect(() => glaze.fromHex('1z2z3z')).toThrow(
      'glaze: invalid hex color "1z2z3z".',
    );
    expect(() => glaze.shadow({ bg: '#1z2z3z', intensity: 6 })).toThrow(
      message,
    );

    const theme = glaze({ hue: 280, saturation: 60 });
    theme.colors({ brand: { from: '#1z2z3z' } });
    expect(() => theme.resolve()).toThrow(
      'glaze: color "brand" has an invalid "from" value. ' + message,
    );
  });
});

describe('srgbToOkhsl grays', () => {
  // An exact sRGB gray leaves float residue in OKLab a / b, which OKHSL
  // saturation inflates toward white. It reads as saturation 0 instead.
  it.each([false, true])(
    'reads every gray as saturation 0 (pastel: %s)',
    (pastel) => {
      for (let n = 0; n <= 255; n++) {
        const c = n / 255;
        expect(srgbToOkhsl([c, c, c], pastel)[1]).toBe(0);
      }
      // Decimal grays up to white, where the residue saturation peaks.
      for (let i = 0; i <= 1000; i++) {
        const c = (254 + i / 1000) / 255;
        expect(srgbToOkhsl([c, c, c], pastel)[1]).toBe(0);
      }
    },
  );

  it.each([false, true])('keeps the faintest tints (pastel: %s)', (pastel) => {
    // One 8-bit step off gray, and one channel 0.01 of 255 off it.
    expect(srgbToOkhsl([254 / 255, 1, 1], pastel)[1]).toBeGreaterThan(0);
    expect(
      srgbToOkhsl([254.51 / 255, 254.5 / 255, 254.5 / 255], pastel)[1],
    ).toBeGreaterThan(0);
  });
});

/**
 * `apcaLuminanceFromLinearRgb` is the `Ys` the solver feeds `apcaContrast`,
 * exported so consumers can re-score a pair and get the solver's own Lc.
 */
describe('apcaLuminanceFromLinearRgb', () => {
  const {
    apcaContrast,
    apcaLuminanceFromLinearRgb,
    findToneForContrast,
    fromTone,
    okhslToLinearSrgb,
    REF_EPS,
  } = publicApi;

  /** Lc of `text` on `bg`, computed only from public exports. */
  const lc = (
    text: [number, number, number],
    bg: [number, number, number],
  ): number =>
    apcaContrast(
      apcaLuminanceFromLinearRgb(text),
      apcaLuminanceFromLinearRgb(bg),
    );

  it('is exported from the package entry', () => {
    expect(typeof apcaLuminanceFromLinearRgb).toBe('function');
    expect(apcaLuminanceFromLinearRgb([0, 0, 0])).toBe(0);
    expect(apcaLuminanceFromLinearRgb([1, 1, 1])).toBeCloseTo(1, 12);
  });

  it.each([
    { polarity: 'fg' as const, baseTone: 0.97, preferredTone: 0.6 },
    { polarity: 'fg' as const, baseTone: 0.12, preferredTone: 0.4 },
    { polarity: 'bg' as const, baseTone: 0.15, preferredTone: 0.4 },
    { polarity: 'bg' as const, baseTone: 0.9, preferredTone: 0.6 },
  ])(
    'reproduces the solver Lc for a solved pair ($polarity on tone $baseTone)',
    ({ polarity, baseTone, preferredTone }) => {
      const hue = 265;
      const saturation = 0.7;
      const baseLinearRgb = okhslToLinearSrgb(
        hue,
        0.2,
        fromTone(baseTone * 100, REF_EPS),
      );
      const result = findToneForContrast({
        hue,
        saturation,
        preferredTone,
        baseLinearRgb,
        contrast: { metric: 'apca', target: 75, polarity },
        flip: true,
      });
      expect(result.met).toBe(true);
      expect(result.branch).not.toBe('preferred');

      // The solver scores each candidate at its tone rounded to 4 decimals.
      const scoredTone = Math.round(result.tone * 1e4) / 1e4;
      const candidate = okhslToLinearSrgb(
        hue,
        saturation,
        fromTone(scoredTone * 100, REF_EPS),
      );
      const score =
        polarity === 'bg'
          ? lc(baseLinearRgb, candidate)
          : lc(candidate, baseLinearRgb);

      expect(Math.abs(score)).toBe(result.contrast);
    },
  );

  it('re-scores a resolved APCA pair at or above its floor in every scheme', () => {
    const theme = glaze({ hue: 265, saturation: 70 });
    theme.colors({
      surface: { tone: 97 },
      text: { base: 'surface', tone: 60, contrast: { apca: 75 } },
    });
    const resolved = theme.resolve();
    const text = resolved.get('text')!;
    const surface = resolved.get('surface')!;
    const linear = (v: typeof text.light): [number, number, number] => {
      const { h, s, l } = variantToOkhsl(v);
      return okhslToLinearSrgb(h, s, l, v.pastel);
    };

    for (const [scheme, target] of [
      ['light', 75],
      ['dark', 75],
      ['lightContrast', 90],
      ['darkContrast', 90],
    ] as const) {
      const score = lc(linear(text[scheme]), linear(surface[scheme]));
      // Positive: dark text on a light surface; negative: the reverse.
      expect(Math.sign(score)).toBe(scheme.startsWith('light') ? 1 : -1);
      expect(Math.abs(score)).toBeGreaterThanOrEqual(target);
    }
  });
});
