/**
 * Text that differs per scheme (a measured contrast, a CSS value): renders one
 * span per scheme and lets Tasty show only the one matching the reader's
 * appearance, or a single value for a pinned scheme.
 */

import { tasty } from '@tenphi/cookbook/styling';
import { SCHEMES, onlyIn } from './glaze-docs';
import type { Scheme, SchemeChoice } from './glaze-docs';

const Part = tasty({ as: 'span', styles: {} });

export default function SchemeValue(props: {
  values: Record<Scheme, string>;
  scheme?: SchemeChoice;
}) {
  const scheme = props.scheme ?? 'auto';
  if (scheme !== 'auto') return <>{props.values[scheme]}</>;
  return (
    <>
      {SCHEMES.map((s) => (
        <Part key={s} styles={{ hide: onlyIn(s) }}>
          {props.values[s]}
        </Part>
      ))}
    </>
  );
}
