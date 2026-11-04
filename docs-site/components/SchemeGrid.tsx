/**
 * One theme rendered in all four schemes side by side, each on its own static
 * background: the product UI (default) or the swatch grid.
 */

import type { ReactNode } from 'react';
import { tasty } from '@tenphi/cookbook/styling';
import { Eyebrow, Figure } from './primitives';
import Swatches from './Swatches';
import UiPreview from './UiPreview';
import { UI_DEMO } from './demo-themes';
import type { UiRoles } from './demo-themes';
import { SCHEMES, SCHEME_LABELS, resolveDemo } from './glaze-docs';
import type { DemoTheme, Scheme } from './glaze-docs';

const Columns = tasty({
  styles: {
    display: 'grid',
    gap: '2x',
    gridColumns: {
      '': '1fr',
      '@sm': 'repeat(2, minmax(0, 1fr))',
    },
  },
});

const Cell = tasty({ styles: { display: 'grid', gap: '1x', alignContent: 'start' } });

export interface SchemeGridProps extends Partial<DemoTheme> {
  kind?: 'ui' | 'swatches';
  /** Schemes to show. Default: all four. */
  schemes?: Scheme[];
  /** For `kind="swatches"`: colors to show. */
  show?: string[];
  /** For `kind="ui"`: role mapping. */
  roles?: Partial<UiRoles>;
  caption?: ReactNode;
}

export default function SchemeGrid(props: SchemeGridProps) {
  const kind = props.kind ?? 'ui';
  const schemes = props.schemes ?? SCHEMES;
  const theme: DemoTheme = {
    ...UI_DEMO,
    ...props,
    colors: props.colors ?? UI_DEMO.colors,
  };
  const demo = kind === 'ui' ? resolveDemo(theme) : undefined;

  return (
    <Figure caption={props.caption}>
      <Columns>
        {schemes.map((s) => (
          <Cell key={s}>
            <Eyebrow>{SCHEME_LABELS[s]}</Eyebrow>
            {kind === 'ui' ? (
              <UiPreview demo={demo} roles={props.roles} scheme={s} />
            ) : (
              <Swatches {...theme} show={props.show} scheme={s} />
            )}
          </Cell>
        ))}
      </Columns>
    </Figure>
  );
}
