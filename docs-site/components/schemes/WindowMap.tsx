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
import type { Scheme } from '../glaze-docs';
import type {
  AdaptationMode,
  ColorMap,
  GlazeConfigOverride,
} from '../../../src/index.ts';

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

export interface WindowMapRow {
  scheme: Scheme;
  /** Adaptation mode for this row. Default `'auto'`. */
  mode?: AdaptationMode;
  /** Row label. Default: the scheme name. */
  label?: string;
  /** Second label line. Default: `mode: '<mode>'`. */
  note?: string;
}

export interface WindowMapProps {
  hue?: number;
  saturation?: number;
  config?: GlazeConfigOverride;
  /** Rows, top to bottom. Default: authored, light, dark. */
  rows?: WindowMapRow[];
  /** Number of authored tones from 0 to 100. Default 11. */
  steps?: number;
  caption?: ReactNode;
}

/** A tone label: a whole tone bare (`0`, `100`), anything else to 3 digits. */
function toneLabel(t: number): string {
  const whole = Math.round(t);
  if (Math.abs(t - whole) < 0.005) return String(whole);
  return t.toPrecision(3);
}

const DEFAULT_ROWS: WindowMapRow[] = [
  { scheme: 'light', mode: 'static', label: 'Authored tone', note: '' },
  { scheme: 'light' },
  { scheme: 'dark' },
];

export default function WindowMap(props: WindowMapProps) {
  const rows = props.rows ?? DEFAULT_ROWS;
  const steps = props.steps ?? 11;
  const tones = Array.from(
    { length: steps },
    (_, i) => (i * 100) / (steps - 1),
  );
  const modes = [...new Set(rows.map((r) => r.mode ?? 'auto'))];

  const colors: ColorMap = {};
  for (const mode of modes) {
    tones.forEach((tone, i) => {
      colors[`${mode}-${i}`] = { tone, mode };
    });
  }
  const demo = resolveDemo({
    hue: props.hue ?? 0,
    saturation: props.saturation ?? 0,
    config: props.config,
    colors,
  });

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
