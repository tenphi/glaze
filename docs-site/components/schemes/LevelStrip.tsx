/**
 * One theme rendered at several manual contrast levels — the same definition
 * resolved once per level with a per-instance `contrastLevel` — plus, for
 * reference, the high-contrast tier the theme resolves in `'auto'` mode.
 *
 * Each tile is a small surface with a text sample, a border, and an accent
 * pill, and is captioned with the measured WCAG ratios of the text and the
 * border against the surface. Rows are pinned to the normal schemes (light,
 * dark): the level moves only those variants.
 */

import type { ReactNode } from 'react';
import { tasty } from '@tenphi/cookbook/styling';
import { Eyebrow, Figure, Mono } from '../primitives';
import {
  SCHEME_LABELS,
  fmt,
  resolveDemo,
  variantOf,
  wcagContrast,
} from '../glaze-docs';
import type { DemoTheme, ResolvedDemo, Scheme } from '../glaze-docs';

const Rows = tasty({ styles: { display: 'grid', gap: '2x' } });

const Row = tasty({ styles: { display: 'grid', gap: '1x' } });

const Columns = tasty({
  styles: {
    display: 'grid',
    gap: '1.5x 1x',
    gridColumns: {
      '': 'repeat(3, minmax(0, 1fr))',
      '@sm': 'repeat(6, minmax(0, 1fr))',
    },
  },
});

const Column = tasty({
  styles: { display: 'grid', gap: '0.75x', alignContent: 'start' },
});

const Tile = tasty({
  styles: {
    display: 'grid',
    gap: '1x',
    justifyItems: 'start',
    padding: '1.25x',
    radius: '1r',
  },
});

const Sample = tasty({
  as: 'span',
  styles: { preset: 'h5', margin: '0', fontWeight: 700 },
});

const Pill = tasty({
  as: 'span',
  styles: {
    display: 'inline-flex',
    padding: '0.25x 1x',
    radius: 'round',
    preset: 'small',
    fontWeight: 600,
  },
});

const Caption = tasty({
  styles: {
    display: 'grid',
    gap: '0.25x',
    color: '#text-soft',
    fontSize: '0.72rem',
  },
});

const Head = tasty({
  as: 'span',
  styles: { preset: 'small', fontWeight: 600, color: '#text' },
});

export interface LevelRoles {
  surface: string;
  text: string;
  border: string;
  accent: string;
  accentLabel: string;
}

const DEFAULT_ROLES: LevelRoles = {
  surface: 'surface',
  text: 'text',
  border: 'border',
  accent: 'accent',
  accentLabel: 'accent-label',
};

export interface LevelStripProps extends DemoTheme {
  /** Levels to render. Default 0, 25, 50, 75, 100. */
  levels?: number[];
  /** Normal schemes to render, one row each. Default light and dark. */
  schemes?: Array<'light' | 'dark'>;
  roles?: Partial<LevelRoles>;
  /** Append the theme's high-contrast tier as a last column. Default true. */
  hc?: boolean;
  caption?: ReactNode;
}

interface LevelColumn {
  key: string;
  title: string;
  demo: ResolvedDemo;
  /** Which resolved slot to read for a normal scheme. */
  slot: (s: 'light' | 'dark') => Scheme;
}

export default function LevelStrip(props: LevelStripProps) {
  const levels = props.levels ?? [0, 25, 50, 75, 100];
  const schemes = props.schemes ?? ['light', 'dark'];
  const roles = { ...DEFAULT_ROLES, ...props.roles };

  const columns: LevelColumn[] = levels.map((level) => ({
    key: `level-${level}`,
    title: `Level ${level}`,
    demo: resolveDemo({
      ...props,
      config: { ...props.config, contrastLevel: level },
    }),
    slot: (s) => s,
  }));
  if (props.hc !== false) {
    columns.push({
      key: 'hc',
      title: 'HC tier',
      demo: resolveDemo(props),
      slot: (s) => (s === 'light' ? 'lightContrast' : 'darkContrast'),
    });
  }

  return (
    <Figure caption={props.caption}>
      <Rows>
        {schemes.map((s) => (
          <Row key={s}>
            <Eyebrow>{SCHEME_LABELS[s]}</Eyebrow>
            <Columns>
              {columns.map((col) => {
                const slot = col.slot(s);
                const c = (name: string) => col.demo.colors[name][slot];
                const v = (name: string) =>
                  variantOf(col.demo.resolved, name, slot);
                const textRatio = wcagContrast(v(roles.text), v(roles.surface));
                const borderRatio = wcagContrast(
                  v(roles.border),
                  v(roles.surface),
                );
                return (
                  <Column key={col.key}>
                    <Tile
                      styles={{
                        fill: c(roles.surface),
                        border: '1bw solid',
                        borderColor: c(roles.border),
                      }}
                    >
                      <Sample styles={{ color: c(roles.text) }}>Aa</Sample>
                      <Pill
                        styles={{
                          fill: c(roles.accent),
                          color: c(roles.accentLabel),
                        }}
                      >
                        Go
                      </Pill>
                    </Tile>
                    <Caption>
                      <Head>{col.title}</Head>
                      <Mono>text {fmt(textRatio, 2)}:1</Mono>
                      <Mono>border {fmt(borderRatio, 2)}:1</Mono>
                    </Caption>
                  </Column>
                );
              })}
            </Columns>
          </Row>
        ))}
      </Rows>
    </Figure>
  );
}
