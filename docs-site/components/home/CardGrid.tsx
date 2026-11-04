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
    // Rows are spaced by the cards' own top margin (see `First`).
    gap: '0 2x',
    gridColumns: {
      '': '1fr',
      '@sm': 'repeat(2, minmax(0, 1fr))',
    },
    margin: '0 0 3x',
    Slot: {
      $: '> :is(astro-slot, astro-static-slot)',
      display: 'contents',
    },
    // Prose spacing gives every card after the first a 3x top margin, and
    // its selector outranks ours. Give the first card the same margin so the
    // first row lines up.
    First: {
      $: '> :first-child',
      margin: '3x 0 0',
    },
    SlotFirst: {
      $: '> :is(astro-slot, astro-static-slot) > :first-child',
      margin: '3x 0 0',
    },
  },
});

export default function CardGrid(props: { children?: ReactNode }) {
  return <Grid>{props.children}</Grid>;
}
