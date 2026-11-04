/**
 * Contrast-solved mixes: each tile is the mix's base with two patches on
 * top (painted directly when opaque, composited when transparent): the mix
 * as authored, without its floor, and the mix with it. Each patch gives its
 * WCAG ratio against the base and its `value` (or opacity) in the reader's
 * scheme.
 *
 * The solved value is read back from the output: the opacity for a
 * transparent mix, and for an opaque mix the position of the result along
 * the base → target segment in the mix's own space (OKHSL lightness, or the
 * linear-sRGB channel that moves the most).
 */

import type { ReactNode } from 'react';
import { Figure } from '../primitives';
import SchemeValue from '../SchemeValue';
import {
  SCHEMES,
  fmt,
  inkFor,
  inkMap,
  paint,
  resolveDemo,
  variantOf,
  wcagContrast,
} from '../glaze-docs';
import type {
  DemoTheme,
  Scheme,
  SchemeChoice,
  SchemeColors,
} from '../glaze-docs';
import {
  contrastRatioFromLuminance,
  gamutClampedLuminance,
  okhslToLinearSrgb,
  relativeLuminanceFromLinearRgb,
  variantToOkhsl,
} from '../../../src/index.ts';
import type {
  ColorMap,
  MixColorDef,
  ResolvedColorVariant,
} from '../../../src/index.ts';
import { Big, Cells, Head, Note, Patch, Tile } from '../shadows-and-glows/parts';
import {
  compositeLinear,
  compositeTone,
} from '../shadows-and-glows/lighting-docs';

export interface ContrastMixProps extends DemoTheme {
  /** Mix colors (with a WCAG `contrast`) to show. */
  show: string[];
  scheme?: SchemeChoice;
  caption?: ReactNode;
}

function linear(v: ResolvedColorVariant) {
  const { h, s, l } = variantToOkhsl(v);
  return okhslToLinearSrgb(h, s, l, v.pastel ?? false);
}

/** Where an opaque mix result sits on its base → target segment, 0–100. */
function solvedValue(
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

/** WCAG ratio of a mix (composited when transparent) against its base. */
function ratioOf(
  def: MixColorDef,
  mix: ResolvedColorVariant,
  base: ResolvedColorVariant,
): number {
  return def.blend === 'transparent'
    ? contrastRatioFromLuminance(
        relativeLuminanceFromLinearRgb(compositeLinear(mix, base)),
        gamutClampedLuminance(linear(base)),
      )
    : wcagContrast(mix, base);
}

const AUTHORED = '--as-authored';

export default function ContrastMix(props: ContrastMixProps) {
  const scheme = props.scheme ?? 'auto';
  // Each mix again without its floor, to show what the solver changed.
  const colors: ColorMap = { ...props.colors };
  for (const name of props.show) {
    const { contrast: _floor, ...rest } = props.colors[name] as MixColorDef;
    colors[name + AUTHORED] = rest;
  }
  const demo = resolveDemo({ ...props, colors });
  const v = (name: string, s: Scheme) => variantOf(demo.resolved, name, s);

  return (
    <Figure caption={props.caption}>
      <Cells>
        {props.show.map((name) => {
          const def = props.colors[name] as MixColorDef;
          const transparent = def.blend === 'transparent';
          const unit = transparent ? 'opacity' : 'value';
          const patches = [
            { color: name + AUTHORED, label: 'as authored' },
            { color: name, label: 'with contrast' },
          ];
          return (
            <Tile
              key={name}
              styles={{
                fill: paint(demo.colors[def.base], scheme),
                color: paint(inkMap(demo.resolved, def.base), scheme),
              }}
            >
              <Head>{name}</Head>
              {patches.map((patch) => {
                const ratio = {} as Record<Scheme, string>;
                const value = {} as Record<Scheme, string>;
                const ink = {} as SchemeColors;
                for (const s of SCHEMES) {
                  const mix = v(patch.color, s);
                  const base = v(def.base, s);
                  ratio[s] = fmt(ratioOf(def, mix, base), 2);
                  value[s] = fmt(
                    solvedValue(def, mix, base, v(def.target, s)),
                    1,
                  );
                  const t = transparent ? compositeTone(mix, base) / 100 : mix.t;
                  ink[s] = inkFor({ ...mix, t });
                }
                return (
                  <Patch
                    key={patch.color}
                    styles={{
                      fill: paint(demo.colors[patch.color], scheme),
                      color: paint(ink, scheme),
                    }}
                  >
                    <Big>
                      <SchemeValue values={ratio} scheme={scheme} />:1
                    </Big>
                    <Note>
                      {patch.label} · {unit}{' '}
                      <SchemeValue values={value} scheme={scheme} />
                    </Note>
                  </Patch>
                );
              })}
            </Tile>
          );
        })}
      </Cells>
    </Figure>
  );
}
