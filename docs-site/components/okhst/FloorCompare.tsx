/**
 * Tone delta vs contrast floor across hues. One neutral surface; for each hue
 * two text colors sit the same tone delta below it — one plain, one with a
 * `contrast` floor added. Each sample shows its measured WCAG ratio and
 * stored tone, so the chromatic drift of a plain delta and the solver's
 * correction are both visible. Rendered on one static scheme (default light).
 */

import type { ReactNode } from 'react';
import { tasty } from '@tenphi/cookbook/styling';
import { Figure, Panel } from '../primitives';
import {
  fixed,
  fmt,
  resolveDemo,
  toneOf,
  variantOf,
  wcagContrast,
} from '../glaze-docs';
import { floorCompare } from './figures';
import type { FloorCompareSpec } from './figures';

const Table = tasty({
  styles: {
    display: 'grid',
    gridColumns: 'auto minmax(0, 1fr) minmax(0, 1fr)',
    gap: '1x 2x',
    alignItems: 'center',
  },
});

/** Column headers and row labels, painted in the theme's own neutral text. */
const Label = tasty({
  as: 'span',
  styles: { preset: 'small', fontWeight: 600 },
});

const Sample = tasty({
  styles: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0 1x',
    alignItems: 'baseline',
  },
});

const Glyph = tasty({
  as: 'span',
  styles: { fontSize: '1.5rem', fontWeight: 700, lineHeight: '1.2' },
});

/**
 * Ratio and tone. On a phone the two stack on purpose, so a label never
 * splits from its number; wider, they share a line with a dot between.
 */
const Measure = tasty({
  as: 'span',
  styles: {
    display: { '': 'grid', '@sm': 'flex' },
    flexWrap: 'wrap',
    gap: '0 1ch',
    preset: 'code',
    fontSize: '0.75rem',
    Part: { whiteSpace: 'nowrap' },
    Dot: { hide: { '': true, '@sm': false } },
  },
  elements: { Part: 'span', Dot: 'span' },
});

export interface FloorCompareProps extends FloorCompareSpec {
  caption?: ReactNode;
}

export default function FloorCompare(props: FloorCompareProps) {
  const { scheme, delta, contrast, rows, theme } = floorCompare(props);
  const demo = resolveDemo(theme);
  const surface = variantOf(demo.resolved, 'surface', scheme);
  const ink = fixed(demo.colors['neutral-floor'], scheme);

  const sample = (name: string) => {
    const v = variantOf(demo.resolved, name, scheme);
    return (
      <Sample>
        <Glyph styles={{ color: fixed(demo.colors[name], scheme) }}>Aa</Glyph>
        <Measure styles={{ color: ink }}>
          <Measure.Part>{fmt(wcagContrast(v, surface), 2)}:1</Measure.Part>{' '}
          <Measure.Dot>·</Measure.Dot>{' '}
          <Measure.Part>tone {fmt(toneOf(v), 1)}</Measure.Part>
        </Measure>
      </Sample>
    );
  };

  const floorLabel =
    typeof contrast === 'object'
      ? 'with floor'
      : `with contrast: '${contrast}'`;

  return (
    <Figure caption={props.caption}>
      <Panel styles={{ fill: fixed(demo.colors.surface, scheme) }}>
        <Table>
          <span />
          <Label styles={{ color: ink }}>tone: '{delta}'</Label>
          <Label styles={{ color: ink }}>{floorLabel}</Label>
          {rows.map((row) => [
            <Label key={`${row.key}-label`} styles={{ color: ink }}>
              {row.label}
            </Label>,
            <div key={`${row.key}-step`}>{sample(`${row.key}-step`)}</div>,
            <div key={`${row.key}-floor`}>{sample(`${row.key}-floor`)}</div>,
          ])}
        </Table>
      </Panel>
    </Figure>
  );
}
