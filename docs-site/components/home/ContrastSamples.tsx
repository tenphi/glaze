/**
 * Text samples painted on their background, each labelled with the contrast
 * measured between the two resolved colors for the active scheme — the WCAG
 * ratio by default, or the APCA Lc. Follows the reader's appearance unless a
 * scheme is pinned. Used on the home page and in Getting started.
 */

import type { ReactNode } from 'react';
import { tasty } from '@tenphi/cookbook/styling';
import { Figure } from '../primitives';
import SchemeValue from '../SchemeValue';
import {
  SCHEMES,
  apcaLc,
  fmt,
  paint,
  resolveDemo,
  variantOf,
  wcagContrast,
} from '../glaze-docs';
import type { DemoTheme, Scheme, SchemeChoice } from '../glaze-docs';

const Tiles = tasty({
  styles: {
    display: 'grid',
    gap: '1.5x',
    gridColumns: 'repeat(auto-fill, minmax(12rem, 1fr))',
  },
});

/** One sample: `fg` text on a `bg` fill. Colors arrive through `styles`. */
const Tile = tasty({
  styles: {
    display: 'grid',
    gap: '0.5x',
    alignContent: 'start',
    padding: '2x',
    radius: '1r',
    border: '1bw solid #border',
    Name: { preset: 'code', fontWeight: 600 },
    Measure: { fontSize: '1.75rem', lineHeight: '1.2', fontWeight: 600 },
    Sample: { preset: 'body' },
    Note: { preset: 'code', fontSize: '0.75rem' },
  },
  elements: { Name: 'span', Measure: 'span', Sample: 'span', Note: 'span' },
});

export interface ContrastSample {
  /** The foreground color (text, icon, label). */
  fg: string;
  /** The color it sits on. */
  bg: string;
  /** A note under the measurement, e.g. the authored floor. */
  note?: string;
  /** Which contrast to print. Default `wcag`. */
  metric?: 'wcag' | 'apca';
}

export interface ContrastSamplesProps extends DemoTheme {
  samples: ContrastSample[];
  scheme?: SchemeChoice;
  caption?: ReactNode;
}

export default function ContrastSamples(props: ContrastSamplesProps) {
  const scheme = props.scheme ?? 'auto';
  const demo = resolveDemo(props);

  return (
    <Figure caption={props.caption}>
      <Tiles>
        {props.samples.map((sample) => {
          const values = {} as Record<Scheme, string>;
          for (const s of SCHEMES) {
            const fg = variantOf(demo.resolved, sample.fg, s);
            const bg = variantOf(demo.resolved, sample.bg, s);
            values[s] =
              sample.metric === 'apca'
                ? `Lc ${fmt(apcaLc(fg, bg), 1)}`
                : `${fmt(wcagContrast(fg, bg), 2)}:1`;
          }
          return (
            <Tile
              key={`${sample.fg}/${sample.bg}`}
              styles={{
                fill: paint(demo.colors[sample.bg], scheme),
                color: paint(demo.colors[sample.fg], scheme),
              }}
            >
              <Tile.Name>{sample.fg}</Tile.Name>
              <Tile.Measure>
                <SchemeValue values={values} scheme={scheme} />
              </Tile.Measure>
              <Tile.Sample>Text at this contrast reads like this.</Tile.Sample>
              {sample.note ? <Tile.Note>{sample.note}</Tile.Note> : null}
            </Tile>
          );
        })}
      </Tiles>
    </Figure>
  );
}
