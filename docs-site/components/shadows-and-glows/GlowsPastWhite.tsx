/**
 * Glows whose step may pass white, each drawn over its surface as CSS paints
 * it: the step it reached, the step it asked for, and its opacity. Where the
 * target passes white, SDR falls short; that shortfall is what an HDR value
 * covers. Follows the reader's Appearance menu.
 */

import type { ReactNode } from 'react';
import { Figure } from '../primitives';
import SchemeValue from '../SchemeValue';
import {
  SCHEMES,
  fmt,
  inkMap,
  paint,
  resolveDemo,
  variantOf,
} from '../glaze-docs';
import type { DemoTheme, Scheme, SchemeColors } from '../glaze-docs';
import type { GlowColorDef } from '../../../src/index.ts';
import { Big, Cells, Head, Note, Patch, Tile } from './parts';
import { askedStep, compositeInk, signed, stepOf } from './lighting-docs';

export interface GlowsPastWhiteProps extends DemoTheme {
  /** Glow colors to show, each over its own `bg`. */
  glows: string[];
  caption?: ReactNode;
}

type Lines = Record<'step' | 'asked' | 'alpha', SchemeColors>;

/** Non-breaking space: keeps a label on the same line as its number. */
const NB = '\u00a0';

export default function GlowsPastWhite(props: GlowsPastWhiteProps) {
  const demo = resolveDemo(props);

  return (
    <Figure caption={props.caption}>
      <Cells>
        {props.glows.map((name) => {
          const def = props.colors[name] as GlowColorDef;
          const lines = { step: {}, asked: {}, alpha: {} } as Lines;
          const ink = {} as SchemeColors;
          for (const s of SCHEMES) {
            const bg = variantOf(demo.resolved, def.bg, s);
            const over = variantOf(demo.resolved, name, s);
            const asked = askedStep(def, s, bg);
            lines.step[s] = signed(stepOf(over, bg));
            lines.asked[s] = `asked${NB}${signed(asked)}`;
            lines.alpha[s] = `α${NB}${fmt(over.alpha, 4)}`;
            ink[s] = compositeInk(over, bg);
          }
          const show = (key: keyof Lines) => (
            <SchemeValue values={lines[key] as Record<Scheme, string>} />
          );
          return (
            <Tile
              key={name}
              styles={{
                fill: paint(demo.colors[def.bg], 'auto'),
                color: paint(inkMap(demo.resolved, def.bg), 'auto'),
              }}
            >
              <Head>
                {name} on {def.bg}
              </Head>
              <Patch
                styles={{
                  fill: paint(demo.colors[name], 'auto'),
                  color: paint(ink, 'auto'),
                }}
              >
                <Big>{show('step')}</Big>
                <Note>{show('asked')}</Note>
                <Note>{show('alpha')}</Note>
              </Patch>
            </Tile>
          );
        })}
      </Cells>
    </Figure>
  );
}
