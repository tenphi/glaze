/**
 * The token names a palette actually emits under several prefix settings.
 *
 * Builds one real `glaze.palette()` from props and runs `palette.tokens()`
 * once per call, so every name in a column is exactly what the exporter
 * returns (in its order), with a swatch of the color behind it. The swatches
 * follow the reader's Appearance menu.
 *
 * Each column spans three rows of the outer grid through `subgrid`, so the
 * call, the token count, and the list start at the same height in every
 * column however the call text wraps.
 */

import type { ReactNode } from 'react';
import { tasty } from '@tenphi/cookbook/styling';
import { Figure, Grid, Mono, Panel } from '../primitives';
import { SCHEMES, paint } from '../glaze-docs';
import type { SchemeColors } from '../glaze-docs';
import { buildPalette, callText } from './palette-demo';
import type { PaletteDemoProps } from './palette-demo';

const Call = tasty({
  as: 'span',
  styles: {
    preset: 'code',
    fontWeight: 600,
    color: '#text',
    wordBreak: 'break-word',
  },
});

const Count = tasty({
  as: 'span',
  styles: { preset: 'small', color: '#text-soft' },
});

const List = tasty({
  styles: { display: 'grid', gap: '0.75x', alignContent: 'start' },
});

/** A `Panel` whose three rows (call, count, list) join the outer grid's. */
const COLUMN = { gridRow: 'span 3', gridRows: 'subgrid', gap: '1x' };

const Row = tasty({
  styles: {
    display: 'grid',
    gridColumns: '1.25rem minmax(0, 1fr)',
    gap: '1x',
    placeItems: 'center start',
  },
});

const Dot = tasty({
  styles: {
    width: '1.25rem',
    height: '1.25rem',
    radius: '0.5r',
    border: '1bw solid #border',
  },
});

export interface PrefixTableProps extends PaletteDemoProps {
  caption?: ReactNode;
}

export default function PrefixTable(props: PrefixTableProps) {
  const palette = buildPalette(props);

  const panels = props.calls.map((call) => {
    const maps = palette.tokens({
      ...call,
      format: 'rgb',
      modes: { dark: true, highContrast: true },
    });
    const names = Object.keys(maps.light);
    const label = callText(call);
    return (
      <Panel key={label} styles={COLUMN}>
        <Call>{label}</Call>
        <Count>
          {names.length} {names.length === 1 ? 'token' : 'tokens'}
        </Count>
        <List>
          {names.map((name) => {
            const c = {} as SchemeColors;
            for (const s of SCHEMES) c[s] = maps[s][name];
            return (
              <Row key={name}>
                <Dot styles={{ fill: paint(c, 'auto') }} />
                <Mono>{name}</Mono>
              </Row>
            );
          })}
        </List>
      </Panel>
    );
  });

  return (
    <Figure caption={props.caption}>
      <Grid styles={{ gridColumns: 'repeat(auto-fill, minmax(14rem, 1fr))' }}>
        {panels}
      </Grid>
    </Figure>
  );
}
