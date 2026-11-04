/**
 * A grid of named swatches for a demo theme.
 *
 * Follows the reader's appearance by default (`scheme="auto"`); pin a scheme
 * to render a static one. Translucent colors (shadow, glow, transparent mix,
 * `opacity`) are drawn over the color they composite onto, so the swatch shows
 * what the browser actually paints.
 */

import type { ReactNode } from 'react';
import { Chip, ChipBlock, Figure, Grid, Layer, Panel } from './primitives';
import SchemeValue from './SchemeValue';
import {
  SCHEMES,
  fmt,
  paint,
  resolveDemo,
  toneOf,
  variantOf,
} from './glaze-docs';
import type { DemoTheme, Scheme, SchemeChoice } from './glaze-docs';
import type { ColorDef } from '../../src/index.ts';

export interface SwatchesProps extends DemoTheme {
  /** Colors to show, in order. Default: every color in `colors`. */
  show?: string[];
  scheme?: SchemeChoice;
  /** Caption under the value line: the color's tone (default), CSS, or none. */
  value?: 'tone' | 'css' | 'none';
  /** Render the grid on a panel filled with this color. */
  on?: string;
  caption?: ReactNode;
}

/** The color a translucent def composites over, if any. */
function underlayOf(def: ColorDef | undefined): string | undefined {
  if (!def) return undefined;
  if ('type' in def && (def.type === 'shadow' || def.type === 'glow')) {
    return def.bg;
  }
  if ('type' in def && def.type === 'mix' && def.blend === 'transparent') {
    return def.base;
  }
  return undefined;
}

export default function Swatches(props: SwatchesProps) {
  const scheme = props.scheme ?? 'auto';
  const demo = resolveDemo(props);
  const names = props.show ?? Object.keys(props.colors);
  const valueMode = props.value ?? 'tone';

  const chips = names.map((name) => {
    const under = underlayOf(props.colors[name]);
    const values = {} as Record<Scheme, string>;
    for (const s of SCHEMES) {
      const v = variantOf(demo.resolved, name, s);
      values[s] =
        valueMode === 'css'
          ? demo.colors[name][s]
          : `tone ${fmt(toneOf(v), 1)}${v.alpha < 1 ? ` · α ${fmt(v.alpha, 3)}` : ''}`;
    }
    return (
      <Chip key={name}>
        <ChipBlock
          styles={{
            fill: paint(demo.colors[under ?? name], scheme),
          }}
        >
          {under ? (
            <Layer styles={{ fill: paint(demo.colors[name], scheme) }} />
          ) : null}
        </ChipBlock>
        <Chip.Label>
          <Chip.Name>{name}</Chip.Name>
          {valueMode === 'none' ? null : (
            <Chip.Value>
              <SchemeValue values={values} scheme={scheme} />
            </Chip.Value>
          )}
        </Chip.Label>
      </Chip>
    );
  });

  const grid = <Grid>{chips}</Grid>;
  return (
    <Figure caption={props.caption}>
      {props.on ? (
        <Panel styles={{ fill: paint(demo.colors[props.on], scheme) }}>
          {grid}
        </Panel>
      ) : (
        grid
      )}
    </Figure>
  );
}
