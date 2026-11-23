/**
 * Where an authored tone lands in each scheme. Every row resolves the same
 * evenly spaced authored tones (0, 10, … 100) through one scheme and
 * adaptation mode, and labels each cell with the tone Glaze stores — so the
 * tone window's squeeze and the dark inversion are visible column by column.
 * Each row is pinned to its scheme.
 *
 * Labels carry three significant digits, so the window edges read as the
 * exact values the prose quotes (4.95, 9.25, 95.9); whole tones print bare.
 */

import type { ReactNode } from 'react';
import { tasty } from '@tenphi/cookbook/styling';
import { Figure, Strip } from '../primitives';
import {
  SCHEME_LABELS,
  inkFor,
  resolveDemo,
  toneOf,
  variantOf,
} from '../glaze-docs';
import { toneLabel, windowMap } from './figures';
import type { WindowMapSpec } from './figures';

const Rows = tasty({ styles: { display: 'grid', gap: '1.5x' } });

const Row = tasty({
  styles: {
    display: 'grid',
    gap: { '': '0.5x', '@sm': '1.5x' },
    gridColumns: { '': '1fr', '@sm': '9rem minmax(0, 1fr)' },
    alignItems: 'center',
  },
});

const Label = tasty({
  styles: {
    display: 'grid',
    preset: 'small',
    color: '#text',
    Mode: { preset: 'code', fontSize: '0.75rem', color: '#text-soft' },
  },
  elements: { Mode: 'span' },
});

const Step = tasty({
  styles: {
    display: 'grid',
    alignContent: 'end',
    justifyItems: 'center',
    minHeight: '3.25rem',
    padding: '0.5x 0',
    radius: '0.5r',
    border: '1bw solid #border',
  },
});

const Value = tasty({
  as: 'span',
  styles: {
    preset: 'code',
    fontSize: { '': '0.6rem', '@sm': '0.68rem' },
    fontWeight: 600,
    letterSpacing: '-0.02em',
  },
});

export interface WindowMapProps extends WindowMapSpec {
  caption?: ReactNode;
}

export default function WindowMap(props: WindowMapProps) {
  const { rows, tones, theme } = windowMap(props);
  const demo = resolveDemo(theme);

  return (
    <Figure caption={props.caption}>
      <Rows>
        {rows.map((row, r) => {
          const mode = row.mode ?? 'auto';
          return (
            <Row key={r}>
              <Label>
                <span>{row.label ?? SCHEME_LABELS[row.scheme]}</span>
                {row.note === '' ? null : (
                  <Label.Mode>{row.note ?? `mode: '${mode}'`}</Label.Mode>
                )}
              </Label>
              <Strip>
                {tones.map((_, i) => {
                  const name = `${mode}-${i}`;
                  const v = variantOf(demo.resolved, name, row.scheme);
                  return (
                    <Step
                      key={i}
                      styles={{
                        fill: demo.colors[name][row.scheme],
                        color: inkFor(v),
                      }}
                    >
                      <Value>{toneLabel(toneOf(v))}</Value>
                    </Step>
                  );
                })}
              </Strip>
            </Row>
          );
        })}
      </Rows>
    </Figure>
  );
}
