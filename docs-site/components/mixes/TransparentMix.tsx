/**
 * Transparent mixes drawn over their base: each tile is the base color with
 * the mix painted on top, labelled with the emitted opacity and the tone
 * step the browser composite lands. Follows the reader's scheme unless
 * `scheme` is pinned.
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
} from '../glaze-docs';
import type {
  DemoTheme,
  Scheme,
  SchemeChoice,
  SchemeColors,
} from '../glaze-docs';
import { Big, Cells, Head, Note, Patch, Stage } from '../shadows-and-glows/parts';
import {
  compositeTone,
  signed,
  stepOf,
} from '../shadows-and-glows/lighting-docs';

export interface TransparentMixProps extends DemoTheme {
  /** The color the mixes composite onto (their `base`). */
  base: string;
  /** Transparent mix colors to draw. */
  show: string[];
  scheme?: SchemeChoice;
  caption?: ReactNode;
}

export default function TransparentMix(props: TransparentMixProps) {
  const scheme = props.scheme ?? 'auto';
  const demo = resolveDemo(props);
  const v = (name: string, s: Scheme) => variantOf(demo.resolved, name, s);
  const per = (fn: (s: Scheme) => string) => {
    const out = {} as Record<Scheme, string>;
    for (const s of SCHEMES) out[s] = fn(s);
    return <SchemeValue values={out} scheme={scheme} />;
  };

  return (
    <Figure caption={props.caption}>
      <Stage
        styles={{
          fill: paint(demo.colors[props.base], scheme),
          color: paint(inkMap(demo.resolved, props.base), scheme),
        }}
      >
        <Head>{props.base}</Head>
        <Cells>
          {props.show.map((name) => {
            const ink = {} as SchemeColors;
            for (const s of SCHEMES) {
              // Ink for the composite: `inkFor` reads only the tone.
              const t = compositeTone(v(name, s), v(props.base, s)) / 100;
              ink[s] = inkFor({ ...v(props.base, s), t });
            }
            return (
            <Patch
              key={name}
              styles={{
                fill: paint(demo.colors[name], scheme),
                color: paint(ink, scheme),
              }}
            >
              <Big>{per((s) => signed(stepOf(v(name, s), v(props.base, s))))}</Big>
              <Note>{name}</Note>
              <Note>α {per((s) => fmt(v(name, s).alpha, 3))}</Note>
            </Patch>
            );
          })}
        </Cells>
      </Stage>
    </Figure>
  );
}
