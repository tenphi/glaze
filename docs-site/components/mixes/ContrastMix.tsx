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
import { tasty } from '@tenphi/cookbook/styling';
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
import type {
  ColorMap,
  MixColorDef,
  ResolvedColorVariant,
} from '../../../src/index.ts';
import { Big, Head, Note, Patch, Tile } from '../shadows-and-glows/parts';
import {
  compositeInk,
  compositeRatio,
} from '../shadows-and-glows/lighting-docs';
import { solvedValue } from './figures';

export interface ContrastMixProps extends DemoTheme {
  /** Mix colors (with a WCAG `contrast`) to show. */
  show: string[];
  scheme?: SchemeChoice;
  caption?: ReactNode;
}

/** WCAG ratio of a mix (composited when transparent) against its base. */
function ratioOf(
  def: MixColorDef,
  mix: ResolvedColorVariant,
  base: ResolvedColorVariant,
): number {
  return def.blend === 'transparent'
    ? compositeRatio(mix, base)
    : wcagContrast(mix, base);
}

const AUTHORED = '--as-authored';

/** One tile per mix, stretched so each label fits on one line. */
const Cells = tasty({
  styles: {
    display: 'grid',
    gap: '1.5x',
    gridColumns: 'repeat(auto-fit, minmax(15rem, 1fr))',
  },
});

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
                  ink[s] = transparent ? compositeInk(mix, base) : inkFor(mix);
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
                      <SchemeValue values={ratio} scheme={scheme} />
                      :1
                    </Big>
                    <Note>
                      {/* Non-breaking around "·": no dangling separator. */}
                      {`${patch.label}\u00a0·\u00a0${unit}\u00a0`}
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
