/**
 * Lays Cookbook `Card`s out in a responsive grid. Astro hands the cards to
 * this component as one slot element, so the slot is flattened with
 * `display: contents` to make each card a grid item.
 */

import type { ReactNode } from 'react';
import { tasty } from '@tenphi/cookbook/styling';

const Grid = tasty({
  styles: {
    display: 'grid',
    gap: '2x',
    gridColumns: {
      '': '1fr',
      '@sm': 'repeat(2, minmax(0, 1fr))',
    },
    margin: '3x 0',
    Slot: {
      $: '> :is(astro-slot, astro-static-slot)',
      display: 'contents',
    },
    // Prose spacing gives every card after the first a top margin; inside
    // the grid only the gap should space them.
    Card: {
      $: '> :is(astro-slot, astro-static-slot) > *',
      margin: '0',
    },
  },
});

export default function CardGrid(props: { children?: ReactNode }) {
  return <Grid>{props.children}</Grid>;
}
