/**
 * Card drop shadows: cards on a page, each with a `box-shadow` colored by a
 * `shadow` token, in the reader's scheme. Under each card, the step the
 * token lands where the shadow is fully opaque — or, where the page has no
 * room left (dark high contrast sits near black), what it reached.
 */

import type { ReactNode } from 'react';
import { tasty } from '@tenphi/cookbook/styling';
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
import type {
  DemoTheme,
  Scheme,
  SchemeChoice,
  SchemeColors,
} from '../glaze-docs';
import type { ShadowColorDef } from '../../../src/index.ts';
import { Head, Note } from './parts';
import { askedStep, quietly, stepLabel, stepOf } from './lighting-docs';

export interface CardShadowsProps extends DemoTheme {
  /** The page the cards sit on (the shadows' `bg`). */
  page: string;
  /** The card fill (the shadows' `fg`). */
  card: string;
  /** One card per shadow token, with the CSS `box-shadow` geometry to draw. */
  cards: { shadow: string; geometry: string }[];
  scheme?: SchemeChoice;
  caption?: ReactNode;
}

const Page = tasty({
  styles: {
    display: 'grid',
    gap: '3x',
    gridColumns: 'repeat(auto-fit, minmax(9rem, 1fr))',
    padding: '3x 2.5x 3.5x',
    radius: '$card-radius',
    border: '1bw solid #border',
  },
});

const Card = tasty({
  styles: {
    display: 'grid',
    gap: '0.5x',
    alignContent: 'start',
    minHeight: '7rem',
    padding: '1.5x',
    radius: '1.5r',
  },
});

export default function CardShadows(props: CardShadowsProps) {
  const scheme = props.scheme ?? 'auto';
  // Dark high contrast puts the page at black, where a shadow has nothing to
  // darken; the figure reports what was reached instead of warning.
  const demo = quietly(() => resolveDemo(props));
  const v = (name: string, s: Scheme) => variantOf(demo.resolved, name, s);
  const ink = paint(inkMap(demo.resolved, props.card), scheme);

  return (
    <Figure caption={props.caption}>
      <Page styles={{ fill: paint(demo.colors[props.page], scheme) }}>
        {props.cards.map((card) => {
          const def = props.colors[card.shadow] as ShadowColorDef;
          const shadow = {} as SchemeColors;
          const steps = {} as Record<Scheme, string>;
          const alphas = {} as Record<Scheme, string>;
          for (const s of SCHEMES) {
            shadow[s] = `${card.geometry} ${demo.colors[card.shadow][s]}`;
            const asked = askedStep(
              def,
              s,
              v(props.page, s),
              v(props.card, s),
            );
            steps[s] = stepLabel(stepOf(v(card.shadow, s), v(props.page, s)), asked);
            alphas[s] = fmt(v(card.shadow, s).alpha, 3);
          }
          return (
            <Card
              key={card.shadow}
              styles={{
                fill: paint(demo.colors[props.card], scheme),
                color: ink,
                shadow: paint(shadow, scheme),
              }}
            >
              <Head>{card.shadow}</Head>
              <Note>
                step <SchemeValue values={steps} scheme={scheme} />
              </Note>
              <Note>
                α <SchemeValue values={alphas} scheme={scheme} />
              </Note>
            </Card>
          );
        })}
      </Page>
    </Figure>
  );
}
