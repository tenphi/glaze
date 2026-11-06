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
import type { DemoTheme, Scheme } from '../glaze-docs';
import type { ColorMap } from '../../../src/index.ts';

export interface MixRampProps extends DemoTheme {
  base: string;
  target: string;
  /** Steps from value 0 to 100 inclusive. Default 11. */
  steps?: number;
  spaces?: ('okhsl' | 'srgb')[];
  scheme?: Scheme;
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
  const scheme = props.scheme ?? 'light';
  const steps = props.steps ?? 11;
  const spaces = props.spaces ?? ['okhsl', 'srgb'];
  const values = Array.from({ length: steps }, (_, i) =>
    Number(((i * 100) / (steps - 1)).toFixed(2)),
  );

  const colors: ColorMap = { ...props.colors };
  for (const space of spaces) {
    for (const value of values) {
      colors[`mix-${space}-${value}`] = {
        type: 'mix',
        base: props.base,
        target: props.target,
        value,
        space,
      };
    }
  }
  const demo = resolveDemo({ ...props, colors });

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
