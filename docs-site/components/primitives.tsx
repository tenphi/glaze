/**
 * Layout primitives for the documentation's live examples.
 *
 * Every example root carries `data-not-content` so Cookbook's prose styles
 * (paragraph rhythm, list markers, table borders) stay out of it. Colors that
 * come from a demo theme are passed at render time through Tasty `styles`,
 * using `follow()` / `fixed()` from `glaze-docs.ts`.
 */

import type { ReactNode } from 'react';
import { tasty } from '@tenphi/cookbook/styling';

/** Outer frame of an example: a bordered card with an optional caption. */
export const FigureFrame = tasty({
  as: 'figure',
  styles: {
    display: 'grid',
    gap: '1.5x',
    margin: '3x 0',
    padding: '0',
    Caption: {
      $: '> figcaption',
      preset: 'small',
      color: '#text-soft',
    },
  },
});

export function Figure(props: { caption?: ReactNode; children: ReactNode }) {
  return (
    <FigureFrame data-not-content="">
      {props.children}
      {props.caption ? <figcaption>{props.caption}</figcaption> : null}
    </FigureFrame>
  );
}

/** A padded, rounded box. Pass `styles={{ fill, color }}` for its colors. */
export const Panel = tasty({
  styles: {
    display: 'grid',
    gap: '1.5x',
    padding: '2x',
    radius: '$card-radius',
    border: '1bw solid #border',
    overflow: 'hidden',
  },
});

/** Responsive auto-fill grid. Override `gridColumns` for wider cells. */
export const Grid = tasty({
  styles: {
    display: 'grid',
    gap: '1.5x',
    gridColumns: 'repeat(auto-fill, minmax(9rem, 1fr))',
  },
});

/** Horizontal strip of equal cells that never wraps (ramps, ladders). */
export const Strip = tasty({
  styles: {
    display: 'grid',
    gridAutoFlow: 'column',
    gridAutoColumns: 'minmax(0, 1fr)',
    gap: '0.5x',
  },
});

/**
 * A swatch: a color block (`ChipBlock`) with a caption area underneath.
 * Sub-elements cannot take render-time `styles`, so the colored parts are
 * their own components.
 */
export const Chip = tasty({
  styles: {
    display: 'grid',
    gridRows: '4.5rem auto',
    radius: '1r',
    border: '1bw solid #border',
    overflow: 'hidden',
    fill: '#surface',
    Label: {
      display: 'grid',
      gap: '0.25x',
      padding: '1x',
      fill: '#surface-2',
      color: '#text',
      preset: 'small',
      wordBreak: 'break-word',
    },
    Name: { preset: 'code', fontWeight: 600 },
    Value: { preset: 'code', color: '#text-soft' },
  },
  elements: { Label: 'div', Name: 'span', Value: 'span' },
});

/** The colored area of a `Chip`. */
export const ChipBlock = tasty({
  styles: {
    position: 'relative',
    display: 'grid',
    placeItems: 'end start',
    padding: '1x',
    preset: 'small',
  },
});

/** A layer over a `ChipBlock` — a translucent color composited on top. */
export const Layer = tasty({
  styles: { position: 'absolute', inset: '0' },
});

/** Small all-caps label for a scheme or variant name. */
export const Eyebrow = tasty({
  as: 'span',
  styles: {
    preset: 'small',
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
});

/** Monospace measurement text (`4.51:1`, `Lc 62`). */
export const Mono = tasty({
  as: 'span',
  styles: { preset: 'code' },
});
