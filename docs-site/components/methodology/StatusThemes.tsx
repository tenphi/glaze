/**
 * The status themes "Designing a palette" extends from its default theme,
 * each rendered as a small notice painted only with that theme's own tokens.
 * The label line counts the tokens each theme carries, so the effect of
 * `inherit: false` is visible: siblings carry only the inherited subset.
 */

import type { ReactNode } from 'react';
import { tasty } from '@tenphi/cookbook/styling';
import { Eyebrow, Figure } from '../primitives';
import { SCHEME_LABELS, glaze, paint } from '../glaze-docs';
import type { Scheme, SchemeChoice, SchemeColors } from '../glaze-docs';
import type { GlazeTheme } from '../../../src/index.ts';
import {
  PURPLE_HUE,
  SEED_SATURATION,
  STATUS_THEMES,
  TINTED_SURFACE_OVERRIDE,
  colorsUpTo,
} from './palette';

const List = tasty({ styles: { display: 'grid', gap: '1.5x' } });

const Item = tasty({ styles: { display: 'grid', gap: '0.75x' } });

const Notice = tasty({
  styles: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '1x 1.5x',
    alignItems: 'center',
    padding: '1.5x 2x',
    radius: '1r',
    border: '1bw solid #border',
  },
});

const Dot = tasty({
  as: 'span',
  styles: { width: '1.75x', height: '1.75x', radius: 'round' },
});
const Strong = tasty({
  as: 'span',
  styles: { preset: 'body', fontWeight: 600 },
});
const Link = tasty({
  as: 'span',
  styles: { preset: 'small', fontWeight: 600, textDecoration: 'underline' },
});
const Button = tasty({
  as: 'span',
  styles: {
    display: 'inline-grid',
    padding: '0.5x 1.25x',
    radius: '1r',
    preset: 'small',
    fontWeight: 600,
  },
});
const Spacer = tasty({ as: 'span', styles: { flexGrow: 1 } });

const Columns = tasty({
  styles: {
    display: 'grid',
    gap: '2x',
    gridColumns: 'repeat(auto-fit, minmax(17rem, 1fr))',
  },
});
const Cell = tasty({
  styles: { display: 'grid', gap: '1x', alignContent: 'start' },
});

interface Entry {
  name: string;
  prefix: string;
  count: number;
  colors: Record<string, SchemeColors>;
}

function buildEntries(): Entry[] {
  const defaultTheme = glaze(PURPLE_HUE, SEED_SATURATION);
  defaultTheme.colors(colorsUpTo('mixes'));
  const themes: [string, GlazeTheme][] = [['default', defaultTheme]];
  for (const status of STATUS_THEMES) {
    themes.push([
      status.name,
      defaultTheme.extend({
        ...(status.hue !== undefined ? { hue: status.hue } : {}),
        colors: TINTED_SURFACE_OVERRIDE,
      }),
    ]);
  }
  return themes.map(([name, theme]) => ({
    name,
    prefix: name === 'default' ? '' : `${name}-`,
    count: theme.list().length,
    colors: theme.json({
      format: 'rgb',
      modes: { dark: true, highContrast: true },
    }) as Record<string, SchemeColors>,
  }));
}

function Notices(props: { entries: Entry[]; scheme: SchemeChoice }) {
  return (
    <List>
      {props.entries.map((e) => {
        const c = (n: string) => paint(e.colors[n], props.scheme);
        return (
          <Item key={e.name}>
            <Eyebrow>
              {e.name} · {e.count} tokens
              {e.prefix ? ` · ${e.prefix}*` : ' · unprefixed'}
            </Eyebrow>
            <Notice styles={{ fill: c('surface') }}>
              <Dot styles={{ fill: c('accent-icon') }} />
              <Strong styles={{ color: c('surface-text') }}>
                Deploy finished
              </Strong>
              <Link styles={{ color: c('accent-text') }}>View logs</Link>
              <Spacer />
              <Button
                styles={{
                  fill: c('accent-disabled-surface'),
                  color: c('accent-disabled-surface-text'),
                }}
              >
                Undo
              </Button>
              <Button
                styles={{
                  fill: c('accent-surface'),
                  color: c('accent-surface-text'),
                }}
              >
                Retry
              </Button>
            </Notice>
          </Item>
        );
      })}
    </List>
  );
}

export default function StatusThemes(props: {
  schemes?: Scheme[];
  caption?: ReactNode;
}) {
  const entries = buildEntries();
  return (
    <Figure caption={props.caption}>
      {props.schemes ? (
        <Columns>
          {props.schemes.map((s) => (
            <Cell key={s}>
              <Eyebrow>{SCHEME_LABELS[s]}</Eyebrow>
              <Notices entries={entries} scheme={s} />
            </Cell>
          ))}
        </Columns>
      ) : (
        <Notices entries={entries} scheme="auto" />
      )}
    </Figure>
  );
}
