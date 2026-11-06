/**
 * Chromatic drift on the tone axis. Each row is one hue/saturation drawn at
 * evenly spaced tones; every cell is labelled with its *measured* tone — the
 * tone of the gray that has the same WCAG luminance. A neutral row matches
 * its authored tones exactly; chromatic rows show how far real luminance
 * drifts from the tone. Static colors: this is the color space, not a scheme.
 */

import type { ReactNode } from 'react';
import { tasty } from '@tenphi/cookbook/styling';
import { Eyebrow, Figure, Strip } from '../primitives';
import { fmt, inkFor } from '../glaze-docs';
import {
  formatRgb,
  fromTone,
  gamutClampedLuminance,
  okhslToLinearSrgb,
  toneFromY,
} from '../../../src/index.ts';

const Rows = tasty({ styles: { display: 'grid', gap: '1.5x' } });

const Row = tasty({ styles: { display: 'grid', gap: '0.5x' } });

const Header = tasty({
  styles: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0 1x',
    alignItems: 'baseline',
    color: '#text-soft',
  },
});

const Note = tasty({ as: 'span', styles: { preset: 'small' } });

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
    fontSize: '0.7rem',
    fontWeight: 600,
  },
});

/** Authored tones above the first row. */
const Scale = tasty({
  styles: {
    display: 'grid',
    gridAutoFlow: 'column',
    gridAutoColumns: 'minmax(0, 1fr)',
    gap: '0.5x',
    color: '#text-soft',
    preset: 'code',
    fontSize: '0.7rem',
    textAlign: 'center',
  },
});

export interface ToneDriftRow {
  hue: number;
  /** OKHSL saturation, 0–100. */
  saturation: number;
  /** Row title. Default: `hue H · saturation S`. */
  label?: string;
}

export interface ToneDriftProps {
  rows: ToneDriftRow[];
  /** Number of steps from 0 to 100 inclusive. Default 11. */
  steps?: number;
  caption?: ReactNode;
}

/** Luminance-equivalent tone of an OKHSL color. */
function measuredTone(h: number, s: number, l: number): number {
  return toneFromY(gamutClampedLuminance(okhslToLinearSrgb(h, s, l)));
}

/** The widest drift below and above the authored tone, at 1-tone resolution. */
function driftRange(h: number, s: number): [number, number] {
  let lo = 0;
  let hi = 0;
  for (let t = 0; t <= 100; t++) {
    const d = measuredTone(h, s, fromTone(t)) - t;
    lo = Math.min(lo, d);
    hi = Math.max(hi, d);
  }
  return [lo, hi];
}

function summary(lo: number, hi: number): string {
  const parts: string[] = [];
  if (lo <= -0.05) parts.push(`up to ${fmt(-lo, 1)} tones darker`);
  if (hi >= 0.05) parts.push(`up to ${fmt(hi, 1)} tones lighter`);
  return parts.length ? `reads ${parts.join(', ')}` : 'matches its tone';
}

export default function ToneDrift(props: ToneDriftProps) {
  const steps = props.steps ?? 11;
  const tones = Array.from(
    { length: steps },
    (_, i) => (i * 100) / (steps - 1),
  );

  return (
    <Figure caption={props.caption}>
      <Rows>
        <Scale aria-label="Authored tone of each column">
          {tones.map((t) => (
            <span key={t}>{fmt(t, 0)}</span>
          ))}
        </Scale>
        {props.rows.map((row) => {
          const s = row.saturation / 100;
          const [lo, hi] = driftRange(row.hue, s);
          return (
            <Row key={`${row.hue}-${row.saturation}`}>
              <Header>
                <Eyebrow>
                  {row.label ?? `hue ${row.hue} · saturation ${row.saturation}`}
                </Eyebrow>
                <Note>{summary(lo, hi)}</Note>
              </Header>
              <Strip>
                {tones.map((t) => {
                  const l = fromTone(t);
                  const measured = measuredTone(row.hue, s, l);
                  return (
                    <Cell
                      key={t}
                      styles={{
                        fill: formatRgb(row.hue, s, l),
                        color: inkFor({ h: row.hue, s, t: t / 100, alpha: 1 }),
                      }}
                    >
                      {fmt(measured, 0)}
                    </Cell>
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
