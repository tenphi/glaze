/**
 * Two standalone `glaze.color()` tokens — a base and a color paired to it —
 * drawn as text on the base, with the measured WCAG ratio and APCA Lc for the
 * scheme the reader is viewing. Both tokens are created while the site builds.
 */

import { Figure } from '../primitives';
import { glaze, paint } from '../glaze-docs';
import type { SchemeChoice, SchemeColors } from '../glaze-docs';
import { MetricsBlock, Sample, measurePair, quietly } from './ContrastRows';
import { normalizeRole, roleToPolarity } from '../../../src/index.ts';
import type { GlazeColorValue, GlazeFromInput } from '../../../src/index.ts';
import type { TokenPairProps } from './token-pair';

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
