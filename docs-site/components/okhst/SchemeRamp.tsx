/**
 * The scheme pipeline at the model level: evenly spaced authored tones
 * (`tone: 0`, `10`, … `100`) resolved by a real Glaze theme, one strip per
 * scheme. Each cell is labelled with the canonical tone Glaze stores for that
 * scheme, so the dark inversion, the tone windows, and the high-contrast
 * bypass are all visible at once. Every strip is a static rendering.
 *
 * Interior labels use one decimal. The two end cells sit on the window edges,
 * so they print the edge the way the prose quotes it (4.95–100, 9.25–95.9):
 * two decimals, trailing zeros dropped.
 */

import type { ReactNode } from 'react';
import { tasty } from '@tenphi/cookbook/styling';
import { Eyebrow, Figure, Strip } from '../primitives';
import {
  SCHEME_LABELS,
  fixed,
  fmt,
  inkFor,
  resolveDemo,
  toneOf,
  variantOf,
} from '../glaze-docs';
import { edgeLabel, schemeRamp } from './figures';
import type { SchemeRampSpec } from './figures';

const Rows = tasty({ styles: { display: 'grid', gap: '1.5x' } });

const Row = tasty({ styles: { display: 'grid', gap: '0.5x' } });

const Cell = tasty({
  styles: {
    display: 'grid',
    alignContent: 'end',
    justifyItems: 'center',
    minHeight: '3rem',
    padding: '0.5x 0',
    radius: '0.5r',
    border: '1bw solid #border',
    preset: 'code',
    fontSize: { '': '0.58rem', '@sm': '0.7rem' },
    fontWeight: 600,
  },
});

/** Authored tones above the strips. */
const Scale = tasty({
  styles: {
    display: 'grid',
    gap: '0.5x',
    color: '#text-soft',
    Values: {
      display: 'grid',
      gridAutoFlow: 'column',
      gridAutoColumns: 'minmax(0, 1fr)',
      gap: '0.5x',
      preset: 'code',
      fontSize: '0.7rem',
      textAlign: 'center',
    },
  },
  elements: { Values: 'div' },
});

export interface SchemeRampProps extends SchemeRampSpec {
  caption?: ReactNode;
}

export default function SchemeRamp(props: SchemeRampProps) {
  const { schemes, tones, names, theme } = schemeRamp(props);
  const demo = resolveDemo(theme);

  return (
    <Figure caption={props.caption}>
      <Rows>
        <Scale>
          <Eyebrow>Authored tone</Eyebrow>
          <Scale.Values>
            {tones.map((t) => (
              <span key={t}>{fmt(t, 0)}</span>
            ))}
          </Scale.Values>
        </Scale>
        {schemes.map((scheme) => (
          <Row key={scheme}>
            <Eyebrow>{SCHEME_LABELS[scheme]} · stored tone</Eyebrow>
            <Strip>
              {names.map((name, i) => {
                const v = variantOf(demo.resolved, name, scheme);
                const edge = i === 0 || i === names.length - 1;
                return (
                  <Cell
                    key={name}
                    styles={{
                      fill: fixed(demo.colors[name], scheme),
                      color: inkFor(v),
                    }}
                  >
                    {edge ? edgeLabel(toneOf(v)) : fmt(toneOf(v), 1)}
                  </Cell>
                );
              })}
            </Strip>
          </Row>
        ))}
      </Rows>
    </Figure>
  );
}
