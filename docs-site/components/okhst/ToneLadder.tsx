/**
 * A few colors that share one base, shown per scheme on that base: each chip
 * carries the color's stored tone, its tone difference from the base, and the
 * measured WCAG ratio against it. Used to compare how absolute tones, tone
 * deltas, and `'max'` / `'min'` extremes travel from light to dark. Every
 * scheme is a static rendering.
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
  if (v === '0') return '0';
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
                          styles={{ fill: fixed(demo.colors[name], scheme) }}
                        />
                        <Chip.Label>
                          <Chip.Name>{name}</Chip.Name>
                          <Chip.Value>tone {fmt(toneOf(v), 2)}</Chip.Value>
                          <Chip.Value>
                            {isBase
                              ? 'base'
                              : `Δ ${signed(toneOf(v) - toneOf(base))}`}
                          </Chip.Value>
                          {isBase ? null : (
                            <Chip.Value>
                              {fmt(wcagContrast(v, base), 2)}:1
                            </Chip.Value>
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
