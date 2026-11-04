/**
 * The scheme pipeline at the model level: evenly spaced authored tones
 * (`tone: 0`, `10`, … `100`) resolved by a real Glaze theme, one strip per
 * scheme. Each cell is labelled with the canonical tone Glaze stores for that
 * scheme, so the dark inversion, the tone windows, and the high-contrast
 * bypass are all visible at once. Every strip is a static rendering.
 */

import type { ReactNode } from 'react';
import { tasty } from '@tenphi/cookbook/styling';
import { Eyebrow, Figure, Strip } from '../primitives';
import {
  SCHEMES,
  SCHEME_LABELS,
  fixed,
  fmt,
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

const Row = tasty({ styles: { display: 'grid', gap: '0.5x' } });

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
    fontSize: { '': '0.58rem', '@sm': '0.7rem' },
    fontWeight: 600,
  },
});

/** Authored tones above the strips. */
const Scale = tasty({
  styles: {
    display: 'grid',
    gap: '0.5x',
    color: '#text-soft',
    Values: {
      display: 'grid',
      gridAutoFlow: 'column',
      gridAutoColumns: 'minmax(0, 1fr)',
      gap: '0.5x',
      preset: 'code',
      fontSize: '0.7rem',
      textAlign: 'center',
    },
  },
  elements: { Values: 'div' },
});

export interface SchemeRampProps {
  hue?: number;
  /** Theme seed saturation, 0–100. Default 0 (neutral). */
  saturation?: number;
  /** Adaptation mode of every step. Default `'auto'`. */
  mode?: AdaptationMode;
  /** Per-theme config override (tone windows, contrast level). */
  config?: GlazeConfigOverride;
  /** Schemes to show, top to bottom. Default: all four. */
  schemes?: Scheme[];
  /** Number of steps from 0 to 100 inclusive. Default 11. */
  steps?: number;
  caption?: ReactNode;
}

export default function SchemeRamp(props: SchemeRampProps) {
  const steps = props.steps ?? 11;
  const schemes = props.schemes ?? SCHEMES;
  const tones = Array.from(
    { length: steps },
    (_, i) => (i * 100) / (steps - 1),
  );
  const names = tones.map((t) => `tone-${fmt(t, 1)}`);

  const colors: ColorMap = {};
  tones.forEach((t, i) => {
    colors[names[i]] = props.mode ? { tone: t, mode: props.mode } : { tone: t };
  });
  const demo = resolveDemo({
    hue: props.hue ?? 280,
    saturation: props.saturation ?? 0,
    config: props.config,
    colors,
  });

  return (
    <Figure caption={props.caption}>
      <Rows>
        <Scale>
          <Eyebrow>Authored tone</Eyebrow>
          <Scale.Values>
            {tones.map((t) => (
              <span key={t}>{fmt(t, 0)}</span>
            ))}
          </Scale.Values>
        </Scale>
        {schemes.map((scheme) => (
          <Row key={scheme}>
            <Eyebrow>{SCHEME_LABELS[scheme]} · stored tone</Eyebrow>
            <Strip>
              {names.map((name) => {
                const v = variantOf(demo.resolved, name, scheme);
                return (
                  <Cell
                    key={name}
                    styles={{
                      fill: fixed(demo.colors[name], scheme),
                      color: inkFor(v),
                    }}
                  >
                    {fmt(toneOf(v), 1)}
                  </Cell>
                );
              })}
            </Strip>
          </Row>
        ))}
      </Rows>
    </Figure>
  );
}
