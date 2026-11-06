/**
 * An elevation ladder: cards painted with a series of `glow` (or `shadow`)
 * overlays on one surface, each labelled with its step and solved opacity.
 * Each scheme is rendered on its own static background; the default is the
 * dark scheme, where glows do the lifting.
 */

import type { ReactNode } from 'react';
import { tasty } from '@tenphi/cookbook/styling';
import { Eyebrow, Figure } from '../primitives';
import {
  SCHEME_LABELS,
  fmt,
  inkFor,
  resolveDemo,
  toneOf,
  variantOf,
} from '../glaze-docs';
import type { DemoTheme, Scheme } from '../glaze-docs';
import { Head, Note, Stage } from './parts';
import { signed, stepOf } from './lighting-docs';

export interface ElevationLadderProps extends DemoTheme {
  /** The surface every level sits on. */
  surface: string;
  /** Overlay colors, lowest level first. */
  levels: string[];
  /** Pinned schemes to show side by side. Default: `['dark']`. */
  schemes?: Scheme[];
  caption?: ReactNode;
}

const Columns = tasty({ styles: { display: 'grid', gap: '2x' } });

const Column = tasty({ styles: { display: 'grid', gap: '1x' } });

const Ladder = tasty({
  styles: {
    display: 'grid',
    gap: '1.5x',
    gridColumns: 'repeat(auto-fill, minmax(7.5rem, 1fr))',
  },
});

const Level = tasty({
  styles: {
    display: 'grid',
    gap: '0.25x',
    alignContent: 'end',
    minHeight: '6rem',
    padding: '1.25x',
    radius: '1r',
  },
});

export default function ElevationLadder(props: ElevationLadderProps) {
  const schemes = props.schemes ?? ['dark'];
  const demo = resolveDemo(props);
  const v = (name: string, s: Scheme) => variantOf(demo.resolved, name, s);

  return (
    <Figure caption={props.caption}>
      <Columns>
        {schemes.map((scheme) => (
          <Column key={scheme}>
            {schemes.length > 1 ? (
              <Eyebrow>{SCHEME_LABELS[scheme]}</Eyebrow>
            ) : null}
            <Stage
              styles={{
                fill: demo.colors[props.surface][scheme],
                color: inkFor(v(props.surface, scheme)),
              }}
            >
              <Ladder>
                <Level styles={{ fill: 'transparent' }}>
                  <Head>{props.surface}</Head>
                  <Note>tone {fmt(toneOf(v(props.surface, scheme)), 1)}</Note>
                </Level>
                {props.levels.map((name) => (
                  <Level
                    key={name}
                    styles={{ fill: demo.colors[name][scheme] }}
                  >
                    <Head>{name}</Head>
                    <Note>
                      step{' '}
                      {signed(
                        stepOf(v(name, scheme), v(props.surface, scheme)),
                      )}
                    </Note>
                    <Note>α {fmt(v(name, scheme).alpha, 3)}</Note>
                  </Level>
                ))}
              </Ladder>
            </Stage>
          </Column>
        ))}
      </Columns>
    </Figure>
  );
}
