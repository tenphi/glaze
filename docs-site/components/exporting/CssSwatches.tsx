/**
 * Each color of a theme next to the `rgb()` value `css({ format: 'rgb' })`
 * emits for it, in the scheme the reader is viewing.
 *
 * A compact list instead of `Swatches` chips: a CSS value is about 24
 * characters, too wide for a chip, so each row keeps its value on one line.
 */

import type { ReactNode } from 'react';
import { tasty } from '@tenphi/cookbook/styling';
import { Figure } from '../primitives';
import SchemeValue from '../SchemeValue';
import { paint, resolveDemo } from '../glaze-docs';
import type { DemoTheme } from '../glaze-docs';

const List = tasty({
  styles: {
    display: 'grid',
    gridColumns: 'repeat(auto-fill, minmax(min(17rem, 100%), 1fr))',
    gap: '1.5x 3x',
    padding: '2x',
    radius: '$card-radius',
    border: '1bw solid #border',
  },
});

const Row = tasty({
  styles: {
    display: 'grid',
    gridColumns: '2.5rem minmax(0, 1fr)',
    gap: '1.5x',
    placeItems: 'center start',
  },
});

const Swatch = tasty({
  styles: {
    width: '2.5rem',
    height: '2.5rem',
    radius: '1r',
    border: '1bw solid #border',
  },
});

const Text = tasty({
  styles: { display: 'grid', gap: '0.25x', minWidth: '0' },
});

const Name = tasty({
  as: 'span',
  styles: {
    preset: 'code',
    fontWeight: 600,
    color: '#text',
    wordBreak: 'break-word',
  },
});

const Value = tasty({
  as: 'span',
  styles: { preset: 'code', color: '#text-soft', whiteSpace: 'nowrap' },
});

export interface CssSwatchesProps extends DemoTheme {
  show?: string[];
  caption?: ReactNode;
}

export default function CssSwatches(props: CssSwatchesProps) {
  const demo = resolveDemo(props);
  const names = props.show ?? Object.keys(props.colors);

  return (
    <Figure caption={props.caption}>
      <List>
        {names.map((name) => (
          <Row key={name}>
            <Swatch styles={{ fill: paint(demo.colors[name], 'auto') }} />
            <Text>
              <Name>{name}</Name>
              <Value>
                <SchemeValue values={demo.colors[name]} />
              </Value>
            </Text>
          </Row>
        ))}
      </List>
    </Figure>
  );
}
