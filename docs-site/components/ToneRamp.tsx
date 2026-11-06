/**
 * A ramp of evenly spaced steps for one hue/saturation, along OKHST tone
 * (`axis="tone"`, default) or along OKHSL lightness, labelled with each step's
 * value. A row underneath gives the WCAG contrast between each pair of
 * neighbors. Static colors: the ramp shows the color space itself, not a
 * scheme.
 */

import type { ReactNode } from 'react';
import { tasty } from '@tenphi/cookbook/styling';
import { Figure, Strip } from './primitives';
import { fmt, inkForLuminance } from './glaze-docs';
import {
  contrastRatioFromLuminance,
  formatRgb,
  fromTone,
  gamutClampedLuminance,
  okhslToLinearSrgb,
  toTone,
} from '../../src/index.ts';

const Step = tasty({
  styles: {
    display: 'grid',
    alignContent: 'end',
    minHeight: '4.5rem',
    padding: '0.5x',
    radius: '0.5r',
    // Keeps the end swatches visible on a page of the same color.
    border: '1bw solid #border',
  },
});

const Value = tasty({
  as: 'span',
  styles: { preset: 'code', fontSize: '0.75rem', fontWeight: 600 },
});

/** The ratio row sits between neighbors, under the strip. */
const Ratios = tasty({
  styles: {
    display: 'grid',
    gridAutoFlow: 'column',
    gridAutoColumns: 'minmax(0, 1fr)',
    color: '#text-soft',
    preset: 'code',
    fontSize: { '': '0.56rem', '@sm': '0.7rem' },
    letterSpacing: { '': '-0.03em', '@sm': '0' },
    textAlign: 'center',
  },
});

const RatioCell = tasty({
  as: 'span',
  styles: { gridColumn: 'span 2', whiteSpace: 'nowrap' },
});

const Offset = tasty({ as: 'span', styles: { gridColumn: 'span 1' } });

export interface ToneRampProps {
  hue?: number;
  /** OKHSL saturation, 0–100. */
  saturation?: number;
  /** Number of steps from 0 to 100 inclusive. Default 11. */
  steps?: number;
  axis?: 'tone' | 'lightness';
  /** Show the contrast ratio between neighbors. Default true. */
  contrast?: boolean;
  caption?: ReactNode;
}

export default function ToneRamp(props: ToneRampProps) {
  const hue = props.hue ?? 280;
  const sat = (props.saturation ?? 0) / 100;
  const steps = props.steps ?? 11;
  const axis = props.axis ?? 'tone';

  const cells = Array.from({ length: steps }, (_, i) => {
    const value = (i * 100) / (steps - 1);
    const l = axis === 'tone' ? fromTone(value) : value / 100;
    const y = gamutClampedLuminance(okhslToLinearSrgb(hue, sat, l));
    return { value, l, y, tone: toTone(l) };
  });

  return (
    <Figure caption={props.caption}>
      <Strip>
        {cells.map((cell, i) => {
          const ink = inkForLuminance(cell.y);
          return (
            <Step
              key={i}
              styles={{ fill: formatRgb(hue, sat, cell.l), color: ink }}
            >
              <Value>{fmt(cell.value, 0)}</Value>
            </Step>
          );
        })}
      </Strip>
      {props.contrast === false ? null : (
        <Ratios aria-label="WCAG contrast between neighboring steps">
          <Offset />
          {cells.slice(0, -1).map((cell, i) => (
            <RatioCell key={i}>
              {fmt(contrastRatioFromLuminance(cell.y, cells[i + 1].y), 2)}
            </RatioCell>
          ))}
          <Offset />
        </Ratios>
      )}
    </Figure>
  );
}
