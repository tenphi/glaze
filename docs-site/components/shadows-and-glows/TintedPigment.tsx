/**
 * Pigment tuning: the same `shadow` on light, mid, and dark surfaces with
 * the default neutral pigment and with tuned ones (`tint`, `reach`,
 * `hueBleed`). Each tile shows the pigment at full opacity, the solved
 * opacity, and the step the composite lands. Static surfaces.
 */

import type { ReactNode } from 'react';
import { tasty } from '@tenphi/cookbook/styling';
import { Figure } from '../primitives';
import { fmt, inkFor, resolveDemo, toneOf, variantOf } from '../glaze-docs';
import type { ColorMap, LightingTuning } from '../../../src/index.ts';
import { Big, Dot, Head, Legend, Note, Patch, Tile } from './parts';
import { compositeInk, opaqueCss, signed, stepOf } from './lighting-docs';

export interface TintedPigmentProps {
  /** Seed hue and saturation (0–100) the surfaces are tinted with. */
  hue: number;
  saturation: number;
  /** Saturation factor of the surfaces (0–1). Default 0.3. */
  surfaceSaturation?: number;
  tones: number[];
  intensity?: number;
  /** Object for `hueBleed` columns: an absolute hue at full saturation. */
  object?: { hue: number; tone: number };
  columns: { label: string; tuning: LightingTuning; withObject?: boolean }[];
  caption?: ReactNode;
}

const Rows = tasty({ styles: { display: 'grid', gap: '2x' } });
const Group = tasty({ styles: { display: 'grid', gap: '1x' } });

/** One column per tuning, stretched across the figure; stacked on mobile. */
const Columns = tasty({
  styles: {
    display: 'grid',
    gap: '1.5x',
    gridColumns: 'repeat(auto-fit, minmax(11rem, 1fr))',
  },
});

export default function TintedPigment(props: TintedPigmentProps) {
  const intensity = props.intensity ?? 8;
  const colors: ColorMap = {};
  if (props.object) {
    colors.object = {
      tone: props.object.tone,
      hue: props.object.hue,
      saturation: 1,
      mode: 'static',
    };
  }
  props.tones.forEach((tone) => {
    colors[`surface-${tone}`] = {
      tone,
      saturation: props.surfaceSaturation ?? 0.3,
      mode: 'static',
    };
    props.columns.forEach((col, j) => {
      colors[`shadow-${tone}-${j}`] = {
        type: 'shadow',
        bg: `surface-${tone}`,
        ...(col.withObject && props.object ? { fg: 'object' } : {}),
        intensity,
        tuning: col.tuning,
      };
    });
  });

  const demo = resolveDemo({
    hue: props.hue,
    saturation: props.saturation,
    colors,
  });
  const v = (name: string) => variantOf(demo.resolved, name, 'light');

  return (
    <Figure caption={props.caption}>
      <Rows>
        {props.tones.map((tone) => {
          const bg = v(`surface-${tone}`);
          return (
            <Group key={tone}>
              <Legend>surface · tone {tone}</Legend>
              <Columns>
                {props.columns.map((col, j) => {
                  const over = v(`shadow-${tone}-${j}`);
                  return (
                    <Tile
                      key={j}
                      styles={{
                        fill: demo.colors[`surface-${tone}`].light,
                        color: inkFor(bg),
                      }}
                    >
                      <Head>{col.label}</Head>
                      <Patch
                        styles={{
                          fill: demo.colors[`shadow-${tone}-${j}`].light,
                          color: compositeInk(over, bg),
                        }}
                      >
                        <Big>{signed(stepOf(over, bg))}</Big>
                        <Note>α {fmt(over.alpha, 3)}</Note>
                      </Patch>
                      <Note>
                        <Dot styles={{ fill: opaqueCss(over) }} /> pigment
                        <br />
                        {/* Non-breaking: the line never starts with "·". */}
                        {`tone\u00a0${fmt(toneOf(over), 1)}`}
                        {over.s > 0
                          ? `\u00a0·\u00a0h\u00a0${fmt(over.h, 0)}`
                          : ''}
                      </Note>
                    </Tile>
                  );
                })}
              </Columns>
            </Group>
          );
        })}
      </Rows>
    </Figure>
  );
}
