/**
 * Opaque mix ramps: the same two colors mixed at evenly spaced `value`s in
 * each blend space (`okhsl`, `srgb`), one strip per space, each step
 * labelled with its value and resulting tone. Rendered in one pinned scheme
 * (light by default) so the ramp shows the space, not the reader's scheme.
 */

import type { ReactNode } from 'react';
import { tasty } from '@tenphi/cookbook/styling';
import { Figure, Strip } from '../primitives';
import { fmt, inkFor, resolveDemo, toneOf, variantOf } from '../glaze-docs';
import { mixRamp } from './figures';
import type { MixRampSpec } from './figures';

export interface MixRampProps extends MixRampSpec {
  caption?: ReactNode;
}

const Rows = tasty({ styles: { display: 'grid', gap: '1.5x' } });
const Group = tasty({ styles: { display: 'grid', gap: '0.5x' } });

const RowHead = tasty({
  as: 'span',
  styles: { preset: 'code', fontSize: '0.8rem', color: '#text-soft' },
});

const Step = tasty({
  styles: {
    display: 'grid',
    alignContent: 'space-between',
    minHeight: '4.5rem',
    padding: '0.5x',
    radius: '0.5r',
    border: '1bw solid #border',
  },
});

const Value = tasty({
  as: 'span',
  styles: { preset: 'code', fontSize: '0.7rem', fontWeight: 600 },
});

const Tone = tasty({
  as: 'span',
  styles: { preset: 'code', fontSize: '0.7rem' },
});

export default function MixRamp(props: MixRampProps) {
  const { scheme, spaces, values, theme } = mixRamp(props);
  const demo = resolveDemo(theme);

  return (
    <Figure caption={props.caption}>
      <Rows>
        {spaces.map((space) => (
          <Group key={space}>
            <RowHead>space: '{space}'</RowHead>
            <Strip>
              {values.map((value) => {
                const name = `mix-${space}-${value}`;
                const v = variantOf(demo.resolved, name, scheme);
                return (
                  <Step
                    key={value}
                    styles={{
                      fill: demo.colors[name][scheme],
                      color: inkFor(v),
                    }}
                  >
                    <Value>{fmt(value, 0)}</Value>
                    <Tone>{fmt(toneOf(v), 0)}</Tone>
                  </Step>
                );
              })}
            </Strip>
          </Group>
        ))}
      </Rows>
    </Figure>
  );
}
