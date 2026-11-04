/**
 * One `glaze.shadow()` / `glaze.glow()` intensity over several surfaces. Each
 * cell paints the bare surface with a patch of the overlay composited on top,
 * and prints the opacity Glaze solved plus the tone step the composite
 * measures — so the reader sees the opacity change while the step does not.
 * Static colors: the strip shows surfaces, not a scheme.
 */

import type { ReactNode } from 'react';
import { tasty } from '@tenphi/cookbook/styling';
import { Figure } from '../primitives';
import { fmt } from '../glaze-docs';
import { glaze, okhslToLinearSrgb, variantToOkhsl } from '../../../src/index.ts';
import {
  compositeOverGamma,
  relativeLuminanceFromLinearRgb,
  toDisplayGamma,
} from '../../../src/okhsl-color-math.ts';
import { toneFromY } from '../../../src/okhst.ts';
import type { ResolvedColorVariant } from '../../../src/index.ts';

const Cells = tasty({
  styles: {
    display: 'grid',
    gap: '1x',
    gridColumns: 'repeat(auto-fit, minmax(8rem, 1fr))',
  },
});

/** The bare surface. Its fill and ink arrive through `styles`. */
const Cell = tasty({
  styles: {
    display: 'grid',
    gap: '0.75x',
    padding: '1.5x',
    radius: '1r',
    border: '1bw solid #border',
    Label: { preset: 'code', fontSize: '0.75rem' },
    Value: { preset: 'code', fontSize: '0.75rem', fontWeight: 600 },
  },
  elements: { Label: 'span', Value: 'span' },
});

/** The overlay, composited by the browser over the cell's surface. */
const Patch = tasty({ styles: { height: '3rem', radius: '0.5r' } });

export interface LightingSurface {
  /** Tone, 0–100. */
  tone: number;
  hue?: number;
  /** OKHSL saturation, 0–100. Default 0. */
  saturation?: number;
}

export interface LightingStripProps {
  kind: 'shadow' | 'glow';
  intensity: number;
  surfaces: LightingSurface[];
  caption?: ReactNode;
}

/** Tone the browser's `source-over` composite of `over` on `under` lands at. */
function compositeTone(
  under: ResolvedColorVariant,
  over: ResolvedColorVariant,
  alpha: number,
): number {
  const gamma = (v: ResolvedColorVariant) => {
    const { h, s, l } = variantToOkhsl(v);
    return toDisplayGamma(okhslToLinearSrgb(h, s, l));
  };
  return toneFromY(
    relativeLuminanceFromLinearRgb(
      compositeOverGamma(gamma(under), gamma(over), alpha),
    ),
  );
}

export default function LightingStrip(props: LightingStripProps) {
  const cells = props.surfaces.map((surface) => {
    const bg = {
      h: surface.hue ?? 280,
      s: (surface.saturation ?? 0) / 100,
      t: surface.tone / 100,
    };
    const overlay =
      props.kind === 'shadow'
        ? glaze.shadow({ bg, intensity: props.intensity })
        : glaze.glow({ bg, intensity: props.intensity });
    const bare: ResolvedColorVariant = { ...bg, alpha: 1 };
    const step =
      compositeTone(bare, overlay, overlay.alpha) -
      compositeTone(bare, overlay, 0);
    return {
      surface,
      fill: glaze.format(bare, 'rgb'),
      overlay: glaze.format(overlay, 'rgb'),
      ink: surface.tone > 58 ? 'rgb(0 0 0 / 0.86)' : 'rgb(255 255 255 / 0.94)',
      alpha: overlay.alpha,
      step,
    };
  });

  return (
    <Figure caption={props.caption}>
      <Cells>
        {cells.map((cell, i) => (
          <Cell key={i} styles={{ fill: cell.fill, color: cell.ink }}>
            <Cell.Label>
              tone {fmt(cell.surface.tone, 0)}
              {cell.surface.saturation ? ' · chromatic' : ''}
            </Cell.Label>
            <Patch styles={{ fill: cell.overlay }} />
            <Cell.Value>α {fmt(cell.alpha, 3)}</Cell.Value>
            <Cell.Label>
              {cell.step > 0 ? '+' : '−'}
              {fmt(Math.abs(cell.step), 1)} tones
            </Cell.Label>
          </Cell>
        ))}
      </Cells>
    </Figure>
  );
}
