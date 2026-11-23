/**
 * A ramp of evenly spaced steps for one hue/saturation, along OKHST tone
 * (`axis="tone"`, default) or along OKHSL lightness, labelled with each step's
 * value. The steps touch, so each edge between neighbors shows the contrast
 * step itself; a row underneath gives its WCAG ratio. Static colors: the ramp
 * shows the color space itself, not a scheme.
 */

import type { ReactNode } from 'react';
import { tasty } from '@tenphi/cookbook/styling';
import { Figure } from './primitives';
import { fmt, inkForLuminance } from './glaze-docs';
import { contrastRatioFromLuminance, formatRgb } from '../../src/index.ts';
import { toneRampCells } from './okhst/figures';
import type { ToneRampSpec } from './okhst/figures';

/** The steps, joined edge to edge in one frame. */
const Ramp = tasty({
  styles: {
    display: 'grid',
    gridAutoFlow: 'column',
    gridAutoColumns: 'minmax(0, 1fr)',
    overflow: 'clip',
    radius: '0.5r',
    // Keeps the black and white ends visible on a page of the same color.
    border: '1bw solid #border',
  },
});

const Step = tasty({
  styles: {
    display: 'grid',
    alignContent: 'end',
    minHeight: '4.5rem',
    padding: '0.5x',
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

export interface ToneRampProps extends ToneRampSpec {
  caption?: ReactNode;
}

export default function ToneRamp(props: ToneRampProps) {
  const hue = props.hue ?? 280;
  const sat = (props.saturation ?? 0) / 100;
  const cells = toneRampCells(props);

  return (
    <Figure caption={props.caption}>
      <Ramp>
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
      </Ramp>
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
