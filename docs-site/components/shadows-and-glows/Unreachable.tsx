/**
 * Out-of-reach steps: overlays asked for more tones than their surface has
 * room for. Each tile shows the step requested, the step reached, and the
 * opacity Glaze pinned to. Static surfaces. The resolve-time warnings are
 * expected here, so they are held back; the figure reports the outcome.
 */

import type { ReactNode } from 'react';
import { Figure } from '../primitives';
import { fmt, inkFor, resolveDemo, variantOf } from '../glaze-docs';
import type { ColorMap } from '../../../src/index.ts';
import { Big, Cells, Head, Note, Patch, Tile } from './parts';
import { compositeInk, quietly, signed, stepOf } from './lighting-docs';

export interface UnreachableProps {
  cases: { kind: 'shadow' | 'glow'; tone: number; intensity: number }[];
  caption?: ReactNode;
}

export default function Unreachable(props: UnreachableProps) {
  const colors: ColorMap = {};
  props.cases.forEach((c, i) => {
    colors[`surface-${i}`] = { tone: c.tone, saturation: 0, mode: 'static' };
    colors[`overlay-${i}`] = {
      type: c.kind,
      bg: `surface-${i}`,
      intensity: c.intensity,
    };
  });
  const demo = quietly(() => resolveDemo({ hue: 0, saturation: 0, colors }));
  const v = (name: string) => variantOf(demo.resolved, name, 'light');

  return (
    <Figure caption={props.caption}>
      <Cells>
        {props.cases.map((c, i) => {
          const bg = v(`surface-${i}`);
          const over = v(`overlay-${i}`);
          const sign = c.kind === 'shadow' ? -1 : 1;
          return (
            <Tile
              key={i}
              styles={{
                fill: demo.colors[`surface-${i}`].light,
                color: inkFor(bg),
              }}
            >
              <Head>
                {c.kind} {c.intensity} on tone {c.tone}
              </Head>
              <Patch
                styles={{
                  fill: demo.colors[`overlay-${i}`].light,
                  color: compositeInk(over, bg),
                }}
              >
                <Big>{signed(stepOf(over, bg))}</Big>
                <Note>asked {signed(sign * c.intensity)}</Note>
                <Note>α {fmt(over.alpha, 3)}</Note>
              </Patch>
            </Tile>
          );
        })}
      </Cells>
    </Figure>
  );
}
