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
import type { Scheme } from '../glaze-docs';
import type {
  ColorMap,
  ContrastSpec,
  RelativeValue,
} from '../../../src/index.ts';

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

const Measure = tasty({
  as: 'span',
  styles: { preset: 'code', fontSize: '0.75rem' },
});

export interface FloorCompareProps {
  /** Hues of the chromatic text colors. A neutral row is always first. */
  hues: number[];
  /** Theme seed saturation for the chromatic rows, 0–100. Default 90. */
  saturation?: number;
  /** Tone of the neutral surface. Default 97. */
  surfaceTone?: number;
  /** Tone delta of every text color from the surface. Default `'-49.4'`. */
  delta?: RelativeValue;
  /** Contrast floor of the second column. Default `'AA'`. */
  contrast?: ContrastSpec;
  scheme?: Scheme;
  caption?: ReactNode;
}

export default function FloorCompare(props: FloorCompareProps) {
  const scheme = props.scheme ?? 'light';
  const delta = props.delta ?? '-49.4';
  const contrast = props.contrast ?? 'AA';

  const rows = [
    { key: 'neutral', label: 'neutral', extra: { saturation: 0 } },
    ...props.hues.map((h) => ({
      key: `hue-${h}`,
      label: `hue ${h}`,
      extra: { hue: h },
    })),
  ];
  const colors: ColorMap = {
    surface: { tone: props.surfaceTone ?? 97, saturation: 0 },
  };
  for (const row of rows) {
    colors[`${row.key}-step`] = { base: 'surface', tone: delta, ...row.extra };
    colors[`${row.key}-floor`] = {
      base: 'surface',
      tone: delta,
      contrast,
      ...row.extra,
    };
  }
  const demo = resolveDemo({
    hue: props.hues[0] ?? 0,
    saturation: props.saturation ?? 90,
    colors,
  });
  const surface = variantOf(demo.resolved, 'surface', scheme);
  const ink = fixed(demo.colors['neutral-floor'], scheme);

  const sample = (name: string) => {
    const v = variantOf(demo.resolved, name, scheme);
    return (
      <Sample>
        <Glyph styles={{ color: fixed(demo.colors[name], scheme) }}>Aa</Glyph>
        <Measure styles={{ color: ink }}>
          {fmt(wcagContrast(v, surface), 2)}:1 · tone {fmt(toneOf(v), 1)}
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
