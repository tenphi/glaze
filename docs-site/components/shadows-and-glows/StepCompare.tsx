/**
 * The headline comparison: on each surface, a `shadow` (or `glow`) with one
 * `intensity` next to a fixed-opacity black (or white) layer, each labelled
 * with the tone step it actually paints. The solved overlay lands the same
 * step everywhere; the fixed one does not.
 *
 * Surfaces are `mode: 'static'` so they sit at exactly the listed tone; the
 * figure shows the color space, not a scheme.
 */

import type { ReactNode } from 'react';
import { Figure } from '../primitives';
import { fmt, inkFor, resolveDemo, variantOf } from '../glaze-docs';
import type { ColorMap } from '../../../src/index.ts';
import { Big, Head, NarrowCells, Note, Patch, Tile } from './parts';
import { signed, stepOf } from './lighting-docs';

export interface StepCompareProps {
  kind?: 'shadow' | 'glow';
  /** Seed hue and saturation (0–100) of the chromatic surface. */
  hue?: number;
  saturation?: number;
  /** Neutral surface tones. */
  tones: number[];
  /** Tone of a chromatic surface appended to the row. */
  accentTone?: number;
  intensity?: number;
  /** Opacity of the fixed black / white layer, 0–1. */
  fixedAlpha?: number;
  caption?: ReactNode;
}

export default function StepCompare(props: StepCompareProps) {
  const kind = props.kind ?? 'shadow';
  const intensity = props.intensity ?? 6;
  const fixedAlpha = props.fixedAlpha ?? 0.08;
  const pigment = kind === 'shadow' ? 'black' : 'white';

  const surfaces = props.tones.map((tone) => ({
    name: `surface-${tone}`,
    label: `tone ${tone}`,
    def: { tone, saturation: 0, mode: 'static' as const },
  }));
  if (props.accentTone !== undefined) {
    surfaces.push({
      name: 'accent',
      label: `accent ${props.accentTone}`,
      def: { tone: props.accentTone, saturation: 1, mode: 'static' as const },
    });
  }

  const colors: ColorMap = {
    fixed: {
      tone: kind === 'shadow' ? 0 : 100,
      saturation: 0,
      mode: 'static',
      opacity: fixedAlpha,
    },
  };
  for (const s of surfaces) {
    colors[s.name] = s.def;
    colors[`${kind}-${s.name}`] = { type: kind, bg: s.name, intensity };
  }

  const demo = resolveDemo({
      hue: props.hue ?? 280,
      saturation: props.saturation ?? 80,
      colors,
    });
  const fixed = variantOf(demo.resolved, 'fixed', 'light');

  return (
    <Figure caption={props.caption}>
      <NarrowCells>
        {surfaces.map((s) => {
          const bg = variantOf(demo.resolved, s.name, 'light');
          const over = variantOf(demo.resolved, `${kind}-${s.name}`, 'light');
          return (
            <Tile
              key={s.name}
              styles={{ fill: demo.colors[s.name].light, color: inkFor(bg) }}
            >
              <Head>{s.label}</Head>
              <Patch styles={{ fill: demo.colors[`${kind}-${s.name}`].light }}>
                <Big>{signed(stepOf(over, bg))}</Big>
                <Note>
                  {kind} {intensity}
                  <br />α {fmt(over.alpha, 3)}
                </Note>
              </Patch>
              <Patch styles={{ fill: demo.colors.fixed.light }}>
                <Big>{signed(stepOf(fixed, bg))}</Big>
                <Note>
                  {pigment} {fmt(fixedAlpha * 100, 1)}%
                  <br />α {fmt(fixedAlpha, 3)}
                </Note>
              </Patch>
            </Tile>
          );
        })}
      </NarrowCells>
    </Figure>
  );
}
