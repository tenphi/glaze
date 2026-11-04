/**
 * HDR glows: each glow drawn over its surface as the page paints it (SDR,
 * since the site and its screenshots are SDR), with the HDR value an HDR
 * display would get printed as text — exposure, tone past 100, and the
 * `srgb-linear` components — or why there is none. Follows the reader's
 * Appearance menu.
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
import {
  relativeLuminanceFromLinearRgb,
  toneFromY,
} from '../../../src/index.ts';
import type { GlowColorDef } from '../../../src/index.ts';
import { hdrToLinearSrgb } from '../../../src/lighting.ts';
import { Big, Cells, Head, Note, Patch, Tile } from './parts';
import {
  askedStep,
  compositeInk,
  luminanceTone,
  signed,
  stepOf,
} from './lighting-docs';

export interface HdrGlowsProps extends DemoTheme {
  /** Glow colors to show, each over its own `bg`. */
  glows: string[];
  caption?: ReactNode;
}

type Lines = Record<
  'step' | 'asked' | 'alpha' | 'hdr' | 'gain' | 'value',
  SchemeColors
>;

/** Non-breaking space: keeps a label on the same line as its number. */
const NB = '\u00a0';

export default function HdrGlows(props: HdrGlowsProps) {
  const demo = resolveDemo(props);

  return (
    <Figure caption={props.caption}>
      <Cells>
        {props.glows.map((name) => {
          const def = props.colors[name] as GlowColorDef;
          const lines = {
            step: {},
            asked: {},
            alpha: {},
            hdr: {},
            gain: {},
            value: {},
          } as Lines;
          const ink = {} as SchemeColors;
          for (const s of SCHEMES) {
            const bg = variantOf(demo.resolved, def.bg, s);
            const over = variantOf(demo.resolved, name, s);
            const asked = askedStep(def, s, bg);
            lines.step[s] = signed(stepOf(over, bg));
            lines.asked[s] = `asked${NB}${signed(asked)}`;
            lines.alpha[s] = `SDR${NB}α${NB}${fmt(over.alpha, 4)}`;
            ink[s] = compositeInk(over, bg);
            if (over.hdr) {
              const rgb = hdrToLinearSrgb(over.hdr);
              const tone = toneFromY(relativeLuminanceFromLinearRgb(rgb));
              lines.hdr[s] = `HDR${NB}tone${NB}${fmt(tone, 1)}`;
              lines.gain[s] = `${fmt(over.hdr.exposure, 3)}${NB}stops`;
              lines.value[s] = rgb.map((c) => fmt(c, 4)).join(' ');
            } else {
              const target = luminanceTone(bg) + asked;
              lines.hdr[s] = `no${NB}HDR`;
              lines.gain[s] = `target${NB}${fmt(target, 1)}`;
              lines.value[s] = '';
            }
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
              <Note>{show('hdr')}</Note>
              <Note>{show('gain')}</Note>
              <Note>{show('value')}</Note>
            </Tile>
          );
        })}
      </Cells>
    </Figure>
  );
}
