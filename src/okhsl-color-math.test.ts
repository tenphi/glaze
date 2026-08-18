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
  resetScaleWarnings,
  srgbToHex,
  srgbToOkhsl,
} from './okhsl-color-math';
import { glaze } from './glaze';
import { okhslToOkhst, variantToOkhsl } from './okhst';

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
