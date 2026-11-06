/**
 * Two standalone `glaze.color()` tokens — a base and a color paired to it —
 * drawn as text on the base, with the measured WCAG ratio and APCA Lc for the
 * scheme the reader is viewing. Both tokens are created while the site builds.
 */

import type { ReactNode } from 'react';
import { Figure } from '../primitives';
import { glaze, literal, paint } from '../glaze-docs';
import type { SchemeChoice, SchemeColors } from '../glaze-docs';
import { MetricsBlock, Sample, measurePair, quietly } from './ContrastRows';
import { normalizeRole, roleToPolarity } from '../../../src/index.ts';
import type { GlazeColorValue, GlazeFromInput } from '../../../src/index.ts';

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

const MODES = { modes: { dark: true, highContrast: true } } as const;

export default function TokenPair(props: TokenPairProps) {
  const scheme = props.scheme ?? 'auto';
  const bg = glaze.color(props.base as GlazeColorValue);
  const text = glaze.color({ ...props.color, base: bg } as GlazeFromInput);
  const css = quietly(() => ({
    bg: bg.json({ format: 'rgb', ...MODES }) as SchemeColors,
    text: text.json({ format: 'rgb', ...MODES }) as SchemeColors,
  }));
  const resolved = { bg: bg.resolve(), text: text.resolve() };
  // A token's role is its explicit `role`, else 'text'; `name` never feeds it.
  const role = normalizeRole(props.color.role) ?? 'text';
  const polarity = roleToPolarity(role);

  return (
    <Figure caption={props.caption}>
      <Sample
        styles={{
          fill: paint(polarity === 'bg' ? css.text : css.bg, scheme),
          color: paint(polarity === 'bg' ? css.bg : css.text, scheme),
        }}
      >
        <Sample.Big>{props.sample ?? 'Aa Readable'}</Sample.Big>
        <span>The quick brown fox</span>
      </Sample>
      <MetricsBlock
        scheme={scheme}
        measure={(s) =>
          measurePair(
            resolved.text[s],
            resolved.bg[s],
            polarity,
            props.color.contrast,
            s,
          )
        }
      />
    </Figure>
  );
}
