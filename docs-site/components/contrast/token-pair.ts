/**
 * The props and printed source of a `TokenPair`: two standalone
 * `glaze.color()` tokens, a base and a color paired to it. Plain TypeScript,
 * so the docs build (`scripts/build-docs.mjs`) can print the same source.
 */

import type { ReactNode } from 'react';
import { literal } from '../glaze-docs';
import type { SchemeChoice } from '../glaze-docs';
import type { GlazeFromInput } from '../../../src/index.ts';

/** The paired token's input, without `base` (the component supplies it). */
export type PairedInput = Omit<GlazeFromInput, 'base'> & { from: string };

export interface TokenPairProps {
  /** The base color value, wrapped with `glaze.color(value)`. */
  base: string;
  /** The paired color: `glaze.color({ ...color, base })`. */
  color: PairedInput;
  scheme?: SchemeChoice;
  sample?: string;
  caption?: ReactNode;
}

/** The source the figure renders, for the code block next to it. */
export function tokenPairSource(props: TokenPairProps): string {
  const entries = Object.entries(props.color).filter(
    ([, v]) => v !== undefined,
  );
  const fields = [
    ...entries.slice(0, 1).map(([k, v]) => `${k}: ${literal(v)}`),
    'base: bg',
    ...entries.slice(1).map(([k, v]) => `${k}: ${literal(v)}`),
  ];
  const flat = `const text = glaze.color({ ${fields.join(', ')} });`;
  return [
    "import { glaze } from '@tenphi/glaze';",
    '',
    `const bg = glaze.color(${literal(props.base)});`,
    flat.length <= 56
      ? flat
      : [
          'const text = glaze.color({',
          ...fields.map((f) => `  ${f},`),
          '});',
        ].join('\n'),
  ].join('\n');
}
