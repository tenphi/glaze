/**
 * State layers: a rest / hover / pressed (and optional highlight) chip on
 * several fills, each overlay drawn over its fill and labelled with the
 * step it paints in the reader's scheme (or what it reached, where the fill
 * has no room left). Follows the Appearance menu unless `scheme` is pinned.
 * Layers have no `fg`, so each asks for exactly its intensity.
 */

import type { ReactNode } from 'react';
import { tasty } from '@tenphi/cookbook/styling';
import { Figure } from '../primitives';
import SchemeValue from '../SchemeValue';
import { SCHEMES, inkMap, paint, resolveDemo, variantOf } from '../glaze-docs';
import type {
  DemoTheme,
  Scheme,
  SchemeChoice,
  SchemeColors,
} from '../glaze-docs';
import { Head, Note } from './parts';
import type { GlowColorDef, ShadowColorDef } from '../../../src/index.ts';
import {
  askedStep,
  compositeInk,
  quietly,
  stepLabel,
  stepOf,
} from './lighting-docs';

export interface StateRow {
  /** The fill the layers sit on. */
  fill: string;
  label: string;
  /** Overlay colors (`shadow` / `glow`) with `bg: fill`, and their labels. */
  layers: { name: string; label: string }[];
}

export interface StateLayersProps extends DemoTheme {
  rows: StateRow[];
  scheme?: SchemeChoice;
  caption?: ReactNode;
}

const Rows = tasty({ styles: { display: 'grid', gap: '2x' } });

const Group = tasty({ styles: { display: 'grid', gap: '1x' } });

const Line = tasty({
  styles: {
    display: 'grid',
    gap: '1x',
    gridColumns: 'repeat(auto-fill, minmax(7.5rem, 1fr))',
  },
});

const RowHead = tasty({
  as: 'span',
  styles: { preset: 'small', fontWeight: 600, color: '#text-soft' },
});

/** The control's fill. */
const Control = tasty({
  styles: {
    display: 'grid',
    radius: '1r',
    overflow: 'hidden',
    border: '1bw solid #border',
  },
});

/** The state layer, painted over the control's fill. */
const Layer = tasty({
  styles: {
    display: 'grid',
    gap: '0.25x',
    padding: '1.25x 1.5x',
    minHeight: '4rem',
    alignContent: 'center',
  },
});

export default function StateLayers(props: StateLayersProps) {
  const scheme = props.scheme ?? 'auto';
  // A near-black fill (dark high contrast) leaves a shadow no room; the
  // figure reports what was reached instead of warning.
  const demo = quietly(() => resolveDemo(props));

  return (
    <Figure caption={props.caption}>
      <Rows>
        {props.rows.map((row) => {
          const fillInk = inkMap(demo.resolved, row.fill);
          const chips = [{ name: undefined, label: 'Rest' }, ...row.layers];
          return (
            <Group key={row.fill}>
              <RowHead>{row.label}</RowHead>
              <Line>
                {chips.map((chip) => {
                  const steps = {} as Record<Scheme, string>;
                  // Ink for what the layer paints over the fill.
                  const ink = { ...fillInk } as SchemeColors;
                  if (chip.name) {
                    const def = props.colors[chip.name] as
                      | ShadowColorDef
                      | GlowColorDef;
                    for (const s of SCHEMES) {
                      const bg = variantOf(demo.resolved, row.fill, s);
                      const over = variantOf(demo.resolved, chip.name, s);
                      steps[s] = stepLabel(
                        stepOf(over, bg),
                        askedStep(def, s, bg),
                      );
                      ink[s] = compositeInk(over, bg);
                    }
                  }
                  return (
                    <Control
                      key={chip.label}
                      styles={{ fill: paint(demo.colors[row.fill], scheme) }}
                    >
                      <Layer
                        styles={{
                          fill: chip.name
                            ? paint(demo.colors[chip.name], scheme)
                            : 'transparent',
                          color: paint(ink, scheme),
                        }}
                      >
                        <Head>{chip.label}</Head>
                        <Note>
                          {chip.name ? (
                            <SchemeValue values={steps} scheme={scheme} />
                          ) : (
                            row.fill
                          )}
                        </Note>
                      </Layer>
                    </Control>
                  );
                })}
              </Line>
            </Group>
          );
        })}
      </Rows>
    </Figure>
  );
}
