/**
 * Object influence: cards of different tones on a light and a dark surface,
 * each casting a `shadow` (a hard offset, so the visible area is the exact
 * composite) or emitting a `glow` (a solid ring) with `fg` pointed at the
 * card. Each card is labelled with its object factor `k` and the step the
 * composite lands.
 */

import type { ReactNode } from 'react';
import { tasty } from '@tenphi/cookbook/styling';
import { Figure } from '../primitives';
import { fmt, inkFor, resolveDemo, toneOf, variantOf } from '../glaze-docs';
import type { ColorMap } from '../../../src/index.ts';
import { Head, Note, Stage } from './parts';
import {
  DEFAULT_LIGHTING_TUNING,
  objectFactor,
  signed,
  stepOf,
} from './lighting-docs';

type Kind = 'shadow' | 'glow';

export interface ObjectScene {
  /** Surface tone (neutral, `mode: 'static'`). */
  tone: number;
  label: string;
  kinds: Kind[];
  objects: { label: string; tone: number; chromatic?: boolean }[];
}

export interface ObjectInfluenceProps {
  hue?: number;
  saturation?: number;
  intensity?: number;
  scenes: ObjectScene[];
  caption?: ReactNode;
}

const Row = tasty({
  styles: {
    display: 'grid',
    gap: '3x 2.5x',
    gridColumns: 'repeat(auto-fill, minmax(8rem, 1fr))',
    padding: '0 1.75x 1.75x 0',
  },
});

const Cell = tasty({ styles: { display: 'grid', gap: '1.75x' } });

/** The object. Its effect is drawn as a solid `box-shadow`. */
const Card = tasty({
  styles: {
    display: 'grid',
    placeItems: 'center',
    minHeight: '3.5rem',
    radius: '1r',
    preset: 'small',
    fontWeight: 600,
  },
});

const Labels = tasty({ styles: { display: 'grid', gap: '0.25x' } });

export default function ObjectInfluence(props: ObjectInfluenceProps) {
  const intensity = props.intensity ?? 8;
  const colors: ColorMap = {};
  props.scenes.forEach((scene, i) => {
    colors[`surface-${i}`] = {
      tone: scene.tone,
      saturation: 0,
      mode: 'static',
    };
    scene.objects.forEach((obj, j) => {
      const name = `object-${i}-${j}`;
      colors[name] = {
        tone: obj.tone,
        saturation: obj.chromatic ? 1 : 0,
        mode: 'static',
      };
      for (const kind of scene.kinds) {
        colors[`${kind}-${i}-${j}`] = {
          type: kind,
          bg: `surface-${i}`,
          fg: name,
          intensity,
        };
      }
    });
  });

  const demo = resolveDemo({
    hue: props.hue ?? 280,
    saturation: props.saturation ?? 80,
    colors,
  });
  const v = (name: string) => variantOf(demo.resolved, name, 'light');
  const css = (name: string) => demo.colors[name].light;

  return (
    <Figure caption={props.caption}>
      {props.scenes.map((scene, i) => {
        const bg = v(`surface-${i}`);
        return (
          <Stage
            key={i}
            styles={{ fill: css(`surface-${i}`), color: inkFor(bg) }}
          >
            <Head>{scene.label}</Head>
            {scene.kinds.map((kind) => (
              <Row key={kind} aria-label={kind}>
                {scene.objects.map((obj, j) => {
                  const fg = v(`object-${i}-${j}`);
                  const over = v(`${kind}-${i}-${j}`);
                  const k = objectFactor(
                    kind,
                    toneOf(bg),
                    toneOf(fg),
                    DEFAULT_LIGHTING_TUNING.objectInfluence,
                  );
                  const effect =
                    kind === 'shadow'
                      ? `0.75rem 0.75rem 0 0 ${css(`${kind}-${i}-${j}`)}`
                      : `0 0 0 0.75rem ${css(`${kind}-${i}-${j}`)}`;
                  return (
                    <Cell key={j}>
                      <Card
                        styles={{
                          fill: css(`object-${i}-${j}`),
                          color: inkFor(fg),
                          shadow: effect,
                          margin: kind === 'glow' ? '0.75rem' : '0',
                        }}
                      >
                        {obj.label}
                      </Card>
                      <Labels>
                        <Note>
                          {kind} · object {fmt(toneOf(fg), 0)}
                        </Note>
                        <Note>k {fmt(k, 3)}</Note>
                        <Note>step {signed(stepOf(over, bg))}</Note>
                      </Labels>
                    </Cell>
                  );
                })}
              </Row>
            ))}
          </Stage>
        );
      })}
    </Figure>
  );
}
