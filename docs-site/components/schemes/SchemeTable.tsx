/**
 * One theme, several colors, side by side in the schemes you pick — each
 * column pinned to its scheme on a static background, so a light and a dark
 * resolution can be compared directly.
 *
 * Every row holds one or more colors. A color with a `base` is drawn as an
 * inset over that base, and can be annotated with its tone step from the base
 * (`delta`) and its measured WCAG ratio against it (`ratio`). `value="channels"`
 * prints hue and saturation instead of tone, for dark-seed demos.
 *
 * Tones print to one decimal, except a tone that sits on its scheme's window
 * edge, which prints to two (4.95, 9.25) so it reads as the edge the prose
 * quotes.
 */

import type { ReactNode } from 'react';
import { tasty } from '@tenphi/cookbook/styling';
import { Eyebrow, Figure } from '../primitives';
import {
  fmt,
  resolveDemo,
  toneOf,
  variantOf,
  wcagContrast,
} from '../glaze-docs';
import type { DemoTheme, Scheme } from '../glaze-docs';
import type { ColorDef } from '../../../src/index.ts';

const Table = tasty({
  styles: {
    display: 'grid',
    gap: '1.5x 2x',
    alignItems: 'start',
  },
});

const Corner = tasty({ styles: { hide: { '': true, '@sm': false } } });

const RowLabel = tasty({
  styles: {
    gridColumn: { '': '1 / -1', '@sm': 'auto' },
    alignSelf: 'center',
    preset: 'code',
    fontSize: '0.8rem',
    color: '#text',
    wordBreak: 'break-word',
  },
});

const Cell = tasty({
  styles: {
    display: 'grid',
    gap: '1x',
    gridAutoFlow: 'column',
    gridAutoColumns: 'minmax(0, 1fr)',
  },
});

const Item = tasty({ styles: { display: 'grid', gap: '0.5x' } });

const Swatch = tasty({
  styles: {
    position: 'relative',
    minHeight: '3rem',
    radius: '1r',
    border: '1bw solid #border',
    overflow: 'hidden',
  },
});

/** A dependent color, drawn over its base. */
const Inset = tasty({
  styles: {
    position: 'absolute',
    inset: '0.75x 1.5x',
    radius: '0.5r',
  },
});

const Meta = tasty({
  styles: {
    display: 'grid',
    preset: 'code',
    fontSize: '0.72rem',
    lineHeight: '1.35',
    color: '#text-soft',
  },
});

const Line = tasty({ as: 'span', styles: {} });

export interface SchemeTableRow {
  /** Row label. Default: the color names joined. */
  label?: string;
  /** Colors in this row, left to right. */
  show: string[];
}

export interface SchemeTableProps extends DemoTheme {
  /** Rows of colors. Default: one row per color in `show` (or `colors`). */
  rows?: SchemeTableRow[];
  /** Colors, one per row, when `rows` is omitted. */
  show?: string[];
  /** Columns. Default: light and dark. */
  schemes?: Scheme[];
  /** Print tone (default) or hue / saturation. */
  value?: 'tone' | 'channels';
  /** For colors with a `base`: print the tone step from it (`Δ`). */
  delta?: boolean;
  /** For colors with a `base`: print the WCAG ratio against it. */
  ratio?: boolean;
  caption?: ReactNode;
}

/** Column headings — short, so four columns fit side by side. */
const COLUMN_LABELS: Record<Scheme, string> = {
  light: 'Light',
  dark: 'Dark',
  lightContrast: 'Light HC',
  darkContrast: 'Dark HC',
};

function baseOf(def: ColorDef | undefined): string | undefined {
  if (!def || 'type' in def) return undefined;
  return def.base;
}

/**
 * The tone-window edges of each scheme: where authored tones 0 and 100 land
 * for a `fixed` color (remapped, never inverted) under the same seed and
 * config.
 */
function windowEdges(theme: DemoTheme, schemes: Scheme[]) {
  const probe = resolveDemo({
    ...theme,
    colors: {
      lo: { tone: 0, mode: 'fixed' },
      hi: { tone: 100, mode: 'fixed' },
    },
  });
  const edges = {} as Record<Scheme, number[]>;
  for (const s of schemes) {
    edges[s] = ['lo', 'hi'].map((n) => toneOf(variantOf(probe.resolved, n, s)));
  }
  return edges;
}

/** A tone label: one decimal, or two on a window edge (`9.25`, `95.9`). */
function toneText(t: number, edges: number[]): string {
  if (!edges.some((e) => Math.abs(t - e) < 1e-6)) return fmt(t, 1);
  const s = fmt(t, 2);
  return s.endsWith('0') ? s.slice(0, -1) : s;
}

function signed(n: number): string {
  const v = fmt(Math.abs(n), 1);
  if (Number(v) === 0) return v;
  return `${n < 0 ? '-' : '+'}${v}`;
}

export default function SchemeTable(props: SchemeTableProps) {
  const schemes = props.schemes ?? ['light', 'dark'];
  const demo = resolveDemo(props);
  const rows: SchemeTableRow[] =
    props.rows ??
    (props.show ?? Object.keys(props.colors)).map((name) => ({
      show: [name],
    }));
  const valueMode = props.value ?? 'tone';
  const n = schemes.length;
  const edges = windowEdges(props, schemes);

  function lines(name: string, scheme: Scheme): string[] {
    const v = variantOf(demo.resolved, name, scheme);
    if (valueMode === 'channels') {
      return [`h ${fmt(v.h, 1)}`, `s ${fmt(v.s, 2)}`];
    }
    const out = [`tone ${toneText(toneOf(v), edges[scheme])}`];
    const base = baseOf(props.colors[name]);
    if (base) {
      const b = variantOf(demo.resolved, base, scheme);
      if (props.delta) out.push(`Δ ${signed(toneOf(v) - toneOf(b))}`);
      if (props.ratio) out.push(`${fmt(wcagContrast(v, b), 2)}:1`);
    }
    return out;
  }

  return (
    <Figure caption={props.caption}>
      <Table
        styles={{
          gridColumns: {
            '': `repeat(${n}, minmax(0, 1fr))`,
            '@sm': `auto repeat(${n}, minmax(0, 1fr))`,
          },
        }}
      >
        <Corner />
        {schemes.map((s) => (
          <Eyebrow key={s}>{COLUMN_LABELS[s]}</Eyebrow>
        ))}
        {rows.map((row) => [
          <RowLabel key={`${row.show.join()}-label`}>
            {row.label ?? row.show.join(', ')}
          </RowLabel>,
          ...schemes.map((s) => (
            <Cell key={`${row.show.join()}-${s}`}>
              {row.show.map((name) => {
                const base = baseOf(props.colors[name]);
                return (
                  <Item key={name}>
                    <Swatch
                      styles={{ fill: demo.colors[base ?? name][s] }}
                      title={name}
                    >
                      {base ? (
                        <Inset styles={{ fill: demo.colors[name][s] }} />
                      ) : null}
                    </Swatch>
                    <Meta>
                      {lines(name, s).map((line) => (
                        <Line key={line}>{line}</Line>
                      ))}
                    </Meta>
                  </Item>
                );
              })}
            </Cell>
          )),
        ])}
      </Table>
    </Figure>
  );
}
