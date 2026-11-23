/**
 * What the mix figures build and measure. Each figure uses these, and so does
 * its Markdown form (`../markdown.ts`), so the site and the shipped docs print
 * the same values.
 */

import { okhslToLinearSrgb, variantToOkhsl } from '../../../src/index.ts';
import type {
  ColorMap,
  MixColorDef,
  ResolvedColorVariant,
} from '../../../src/index.ts';
import type { DemoTheme, Scheme } from '../glaze-docs';

export interface MixRampSpec extends DemoTheme {
  base: string;
  target: string;
  /** Steps from value 0 to 100 inclusive. Default 11. */
  steps?: number;
  spaces?: ('okhsl' | 'srgb')[];
  scheme?: Scheme;
}

/**
 * `MixRamp`: the theme plus a `mix-<space>-<value>` from `base` to `target`
 * per space and value.
 */
export function mixRamp(spec: MixRampSpec) {
  const scheme = spec.scheme ?? 'light';
  const steps = spec.steps ?? 11;
  const spaces = spec.spaces ?? ['okhsl', 'srgb'];
  const values = Array.from({ length: steps }, (_, i) =>
    Number(((i * 100) / (steps - 1)).toFixed(2)),
  );

  const colors: ColorMap = { ...spec.colors };
  for (const space of spaces) {
    for (const value of values) {
      colors[`mix-${space}-${value}`] = {
        type: 'mix',
        base: spec.base,
        target: spec.target,
        value,
        space,
      };
    }
  }
  const theme: DemoTheme = { ...spec, colors };
  return { scheme, spaces, values, theme };
}

function linear(v: ResolvedColorVariant) {
  const { h, s, l } = variantToOkhsl(v);
  return okhslToLinearSrgb(h, s, l, v.pastel ?? false);
}

/**
 * The `value` a mix ended up with, 0–100: the opacity of a transparent mix,
 * else where the result sits on the base → target segment in the mix's own
 * space (OKHSL lightness, or the linear-sRGB channel that moves the most).
 */
export function solvedValue(
  def: MixColorDef,
  mix: ResolvedColorVariant,
  base: ResolvedColorVariant,
  target: ResolvedColorVariant,
): number {
  if (def.blend === 'transparent') return mix.alpha * 100;
  if (def.space === 'srgb') {
    const [m, b, t] = [linear(mix), linear(base), linear(target)];
    let axis = 0;
    for (let i = 1; i < 3; i++) {
      if (Math.abs(t[i] - b[i]) > Math.abs(t[axis] - b[axis])) axis = i;
    }
    return ((m[axis] - b[axis]) / (t[axis] - b[axis])) * 100;
  }
  const [m, b, t] = [mix, base, target].map((v) => variantToOkhsl(v).l);
  return ((m - b) / (t - b)) * 100;
}
