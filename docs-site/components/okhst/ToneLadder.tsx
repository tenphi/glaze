/**
 * A few colors that share one base, shown per scheme on that base: each chip
 * carries the color's stored tone, its tone difference from the base, and the
 * measured WCAG ratio against it. Used to compare how absolute tones, tone
 * deltas, and `'max'` / `'min'` extremes travel from light to dark. Every
 * scheme is a static rendering.
 *
 * The chip's label area follows the page, not the panel's scheme, so a
 * hairline divides it from the swatch: a tone-0 swatch on a dark page (or a
 * tone-97 one on a light page) would otherwise run into it.
 */

import type { ReactNode } from 'react';
import { tasty } from '@tenphi/cookbook/styling';
import { Chip, ChipBlock, Eyebrow, Figure, Panel } from '../primitives';
import {
  SCHEME_LABELS,
  fixed,
  fmt,
  resolveDemo,
  toneOf,
  variantOf,
  wcagContrast,
} from '../glaze-docs';
import type { DemoTheme, Scheme } from '../glaze-docs';

const Rows = tasty({ styles: { display: 'grid', gap: '2x' } });

const Row = tasty({ styles: { display: 'grid', gap: '1x' } });

const Chips = tasty({
  styles: {
    display: 'grid',
    gap: '1x',
    gridColumns: 'repeat(auto-fit, minmax(5.25rem, 1fr))',
  },
});

/**
 * A chip value line (`Chip.Value`'s look). It never wraps, so `tone` stays
 * with its number; on a phone, where three chips share a row, the text is
 * smaller so `tone 100.00` still fits.
 */
const Value = tasty({
  as: 'span',
  styles: {
    preset: 'code',
    fontSize: { '': '0.7rem', '@sm': '$code-font-size' },
    color: '#text-soft',
    whiteSpace: 'nowrap',
  },
});

export interface ToneLadderProps extends DemoTheme {
  /** The color every other chip is measured against (also the panel fill). */
  base: string;
  /** Colors to show, in order. Default: every color in `colors`. */
  show?: string[];
  /** Schemes to show, top to bottom. Default: light and dark. */
  schemes?: Scheme[];
  caption?: ReactNode;
}

function signed(n: number): string {
  const v = fmt(n, 1);
  if (Number(v) === 0) return v;
  return n > 0 ? `+${v}` : `−${fmt(-n, 1)}`;
}

export default function ToneLadder(props: ToneLadderProps) {
  const schemes = props.schemes ?? (['light', 'dark'] as Scheme[]);
  const demo = resolveDemo(props);
  const names = props.show ?? Object.keys(props.colors);

  return (
    <Figure caption={props.caption}>
      <Rows>
        {schemes.map((scheme) => {
          const base = variantOf(demo.resolved, props.base, scheme);
          return (
            <Row key={scheme}>
              <Eyebrow>{SCHEME_LABELS[scheme]}</Eyebrow>
              <Panel
                styles={{
                  fill: fixed(demo.colors[props.base], scheme),
                  padding: '1.5x',
                }}
              >
                <Chips>
                  {names.map((name) => {
                    const v = variantOf(demo.resolved, name, scheme);
                    const isBase = name === props.base;
                    return (
                      <Chip key={name}>
                        <ChipBlock
                          styles={{
                            fill: fixed(demo.colors[name], scheme),
                            border: '1bw solid #border bottom',
                          }}
                        />
                        <Chip.Label>
                          <Chip.Name>{name}</Chip.Name>
                          <Value>tone {fmt(toneOf(v), 2)}</Value>
                          <Value>
                            {isBase
                              ? 'base'
                              : `Δ ${signed(toneOf(v) - toneOf(base))}`}
                          </Value>
                          {isBase ? null : (
                            <Value>{fmt(wcagContrast(v, base), 2)}:1</Value>
                          )}
                        </Chip.Label>
                      </Chip>
                    );
                  })}
                </Chips>
              </Panel>
            </Row>
          );
        })}
      </Rows>
    </Figure>
  );
}
