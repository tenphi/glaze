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
import { Big, Head, NarrowCells, Note, Patch, Tile } from './parts';
import { compositeInk, signed, stepOf } from './lighting-docs';
import { stepCompare } from './figures';
import type { StepCompareSpec } from './figures';

export interface StepCompareProps extends StepCompareSpec {
  caption?: ReactNode;
}

export default function StepCompare(props: StepCompareProps) {
  const { kind, intensity, fixedAlpha, pigment, surfaces, theme } =
    stepCompare(props);
  const demo = resolveDemo(theme);
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
              <Patch
                styles={{
                  fill: demo.colors[`${kind}-${s.name}`].light,
                  color: compositeInk(over, bg),
                }}
              >
                <Big>{signed(stepOf(over, bg))}</Big>
                <Note>
                  {kind} {intensity}
                  <br />α {fmt(over.alpha, 3)}
                </Note>
              </Patch>
              <Patch
                styles={{
                  fill: demo.colors.fixed.light,
                  color: compositeInk(fixed, bg),
                }}
              >
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
