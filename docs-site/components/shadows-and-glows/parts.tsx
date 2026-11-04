/**
 * Building blocks for the shadow, glow, and mix figures: a surface tile, a
 * patch painted with a translucent color on top of it, and the measurement
 * labels. Every color arrives at render time through Tasty `styles`; text
 * inherits the tile's ink.
 */

import { tasty } from '@tenphi/cookbook/styling';

/** An opaque surface. Pass `styles={{ fill, color }}`. */
export const Tile = tasty({
  styles: {
    display: 'grid',
    gap: '1x',
    alignContent: 'start',
    padding: '1.25x',
    radius: '1r',
    border: '1bw solid #border',
  },
});

/** A larger surface that holds objects or a row of chips. */
export const Stage = tasty({
  styles: {
    display: 'grid',
    gap: '2x',
    padding: '2.5x 2x',
    radius: '$card-radius',
    border: '1bw solid #border',
  },
});

/** A box painted with a translucent color over whatever is under it. */
export const Patch = tasty({
  styles: {
    display: 'grid',
    gap: '0.25x',
    alignContent: 'end',
    minHeight: '4rem',
    padding: '1x',
    radius: '0.5r',
  },
});

/** A small opaque color sample (a pigment at full opacity). */
export const Dot = tasty({
  as: 'span',
  styles: {
    display: 'inline-block',
    width: '1rem',
    height: '1rem',
    radius: 'round',
    border: '1bw solid #border',
    verticalAlign: 'middle',
  },
});

/** The headline number of a patch: a measured step. */
export const Big = tasty({
  as: 'span',
  styles: { preset: 'code', fontSize: '1rem', fontWeight: 700 },
});

/** Secondary measurement text. */
export const Note = tasty({
  as: 'span',
  styles: { preset: 'code', fontSize: '0.75rem', lineHeight: '1.35' },
});

/** Label above a tile's contents. */
export const Head = tasty({
  as: 'span',
  styles: { preset: 'small', fontWeight: 600 },
});

/** A responsive grid with wider cells than the shared `Grid`. */
export const Cells = tasty({
  styles: {
    display: 'grid',
    gap: '1.5x',
    gridColumns: 'repeat(auto-fill, minmax(8.5rem, 1fr))',
  },
});

/** Narrow cells that fit a row of six on a desktop column. */
export const NarrowCells = tasty({
  styles: {
    display: 'grid',
    gap: '1x',
    gridColumns: 'repeat(auto-fit, minmax(6.25rem, 1fr))',
  },
});

/** Section label inside a figure, in the site's soft text color. */
export const Legend = tasty({
  as: 'span',
  styles: { preset: 'small', fontWeight: 600, color: '#text-soft' },
});
