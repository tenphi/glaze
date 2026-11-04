/**
 * The product UI that "Designing a palette" grows step by step. Every part is
 * painted with a methodology token (`surface`, `surface-text-soft`,
 * `accent-surface`, …) and appears only once the walkthrough has defined that
 * token, so each step shows exactly the palette so far.
 *
 * Follows the reader's appearance by default; `schemes` or `columns` render
 * pinned, labeled side-by-side variants (for scheme, dark-seed, and
 * contrast-level comparisons).
 */

import type { ReactNode } from 'react';
import { tasty } from '@tenphi/cookbook/styling';
import { Eyebrow, Figure } from '../primitives';
import { SCHEMES, SCHEME_LABELS, paint, resolveDemo } from '../glaze-docs';
import type {
  ResolvedDemo,
  Scheme,
  SchemeChoice,
  SchemeColors,
} from '../glaze-docs';
import type { GlazeConfigOverride } from '../../../src/index.ts';
import { PURPLE_HUE, SEED_SATURATION, colorsUpTo } from './palette';
import type { StepId } from './palette';

// ----------------------------------------------------------------------------
// Layout
// ----------------------------------------------------------------------------

const Page = tasty({
  styles: {
    display: 'grid',
    gap: '2x',
    padding: '2x',
    radius: '$card-radius',
    border: '1bw solid #border',
    gridColumns: 'repeat(auto-fit, minmax(15rem, 1fr))',
    alignItems: 'start',
  },
});

const Card = tasty({
  styles: {
    display: 'grid',
    gap: '1.25x',
    padding: '2x',
    radius: '1r',
    alignContent: 'start',
  },
});

const Stack = tasty({ styles: { display: 'grid', gap: '0.5x' } });

const Row = tasty({
  styles: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '1x',
    alignItems: 'center',
  },
});

// ----------------------------------------------------------------------------
// Parts (each is a top-level Tasty component so it takes render-time colors)
// ----------------------------------------------------------------------------

const Meta = tasty({ as: 'span', styles: { preset: 'small' } });
const Title = tasty({ as: 'span', styles: { preset: 'h5', margin: '0' } });
const Body = tasty({ as: 'span', styles: { preset: 'body' } });
const Code = tasty({ as: 'span', styles: { preset: 'code' } });
const Link = tasty({
  as: 'span',
  styles: { preset: 'small', fontWeight: 600, textDecoration: 'underline' },
});

/** Wireframe bar, shown in place of text before text tokens exist. */
const Bar = tasty({ styles: { height: '1x', radius: 'round' } });

const Track = tasty({
  styles: {
    display: 'grid',
    height: '1x',
    radius: 'round',
    overflow: 'hidden',
  },
});
const TrackFill = tasty({ styles: { width: '64%', height: '100%' } });

const Dot = tasty({
  as: 'span',
  styles: {
    display: 'inline-block',
    width: '1.75x',
    height: '1.75x',
    radius: 'round',
  },
});

const Button = tasty({
  as: 'span',
  styles: {
    position: 'relative',
    display: 'inline-grid',
    padding: '0.5x 1.25x',
    radius: '1r',
    overflow: 'hidden',
    preset: 'small',
    fontWeight: 600,
  },
});

/** A translucent color composited over its parent (state layers, mixes). */
const Layer = tasty({
  as: 'span',
  styles: { position: 'absolute', inset: '0' },
});

/** Content above a `Layer`. */
const Above = tasty({ as: 'span', styles: { position: 'relative' } });

const Field = tasty({
  styles: {
    display: 'flex',
    padding: '0.75x 1.25x',
    radius: '1r',
  },
});

const Box = tasty({
  as: 'span',
  styles: {
    display: 'inline-block',
    width: '2x',
    height: '2x',
    radius: '0.5r',
  },
});

const ListRow = tasty({
  styles: {
    position: 'relative',
    display: 'grid',
    padding: '0.75x 1.25x',
    radius: '1r',
    overflow: 'hidden',
  },
});

// ----------------------------------------------------------------------------
// Rendering
// ----------------------------------------------------------------------------

function shadowOf(c: SchemeColors, geometry: string): SchemeColors {
  const out = {} as SchemeColors;
  for (const s of SCHEMES) out[s] = `${geometry} ${c[s]}`;
  return out;
}

/** Labeled previews side by side. */
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

export interface PreviewUiProps {
  demo: ResolvedDemo;
  scheme: SchemeChoice;
}

/** The UI itself, for a resolved palette. Parts without a token are left out. */
export function PreviewUi({ demo, scheme }: PreviewUiProps) {
  const has = (name: string) => name in demo.colors;
  const c = (name: string) => paint(demo.colors[name], scheme);
  const text = has('surface-text');

  const border = has('border')
    ? { border: '1bw solid', borderColor: c('border') }
    : {};
  const cardShadow = (name: string) =>
    has(name)
      ? {
          shadow: paint(
            shadowOf(demo.colors[name], '0 0.75rem 1.75rem -0.25rem'),
            scheme,
          ),
        }
      : {};

  const button = (
    label: string,
    fill: string,
    ink: string,
    layer?: string,
  ): ReactNode =>
    has(fill) && has(ink) && (layer === undefined || has(layer)) ? (
      <Button key={label} styles={{ fill: c(fill), color: c(ink) }}>
        {layer ? <Layer styles={{ fill: c(layer) }} /> : null}
        <Above>{label}</Above>
      </Button>
    ) : null;

  const report = (
    <Card styles={{ fill: c('surface'), ...border, ...cardShadow('shadow-md') }}>
      {text ? (
        <Stack>
          {has('surface-text-soft-2') ? (
            <Meta styles={{ color: c('surface-text-soft-2') }}>
              Quarterly report
            </Meta>
          ) : null}
          <Title styles={{ color: c('surface-text') }}>
            Revenue is up 12%
          </Title>
          {has('surface-text-soft') ? (
            <Body styles={{ color: c('surface-text-soft') }}>
              Every color here was resolved by Glaze for the scheme you are
              viewing.
            </Body>
          ) : null}
        </Stack>
      ) : (
        <Stack>
          <Bar styles={{ width: '40%', fill: c('surface-3') }} />
          <Bar styles={{ width: '75%', fill: c('surface-3') }} />
          <Bar styles={{ width: '90%', fill: c('surface-3') }} />
        </Stack>
      )}
      <Track styles={{ fill: c('surface-3') }}>
        {has('accent-surface') ? (
          <TrackFill styles={{ fill: c('accent-surface') }} />
        ) : null}
      </Track>
      {has('accent-text') ? (
        <Row>
          {has('accent-icon') ? (
            <Dot styles={{ fill: c('accent-icon') }} />
          ) : null}
          <Link styles={{ color: c('accent-text') }}>View details</Link>
          {has('accent-text-soft') ? (
            <Meta styles={{ color: c('accent-text-soft') }}>
              Updated 2 hours ago
            </Meta>
          ) : null}
        </Row>
      ) : null}
      {has('accent-surface') ? (
        <Row>
          {button('Publish', 'accent-surface', 'accent-surface-text')}
          {button('Schedule', 'accent-surface-2', 'accent-surface-text')}
        </Row>
      ) : null}
      {has('accent-surface-hover') ? (
        <Row>
          {button('Hover', 'accent-surface-hover', 'accent-surface-text')}
          {button(
            'Pressed',
            'accent-surface',
            'accent-surface-text',
            'accent-surface-pressed',
          )}
          {button(
            'Highlight',
            'accent-surface',
            'accent-surface-text',
            'accent-surface-highlight',
          )}
          {button(
            'Disabled',
            'accent-disabled-surface',
            'accent-disabled-surface-text',
          )}
        </Row>
      ) : null}
    </Card>
  );

  const search = has('placeholder') ? (
    <Card styles={{ fill: c('surface'), ...border, ...cardShadow('shadow-sm') }}>
      <Field
        styles={{
          fill: c('surface'),
          ...border,
          ...(has('focus')
            ? { shadow: paint(shadowOf(demo.colors.focus, '0 0 0 2px'), scheme) }
            : {}),
        }}
      >
        <Body styles={{ color: c('placeholder') }}>Search reports…</Body>
      </Field>
      {has('code-keyword') ? (
        <Code styles={{ color: c('surface-text') }}>
          <Code styles={{ color: c('code-keyword') }}>const</Code> period ={' '}
          <Code styles={{ color: c('code-string') }}>'Q3'</Code>;{' '}
          <Code styles={{ color: c('code-comment') }}>// draft</Code>
        </Code>
      ) : null}
      {has('surface-hover') || has('tint') ? (
        <Stack>
          <ListRow styles={{ fill: c('surface') }}>
            <Body styles={{ color: c('surface-text') }}>Revenue</Body>
          </ListRow>
          {has('surface-hover') ? (
            <ListRow styles={{ fill: c('surface') }}>
              <Layer styles={{ fill: c('surface-hover') }} />
              <Above>
                <Body styles={{ color: c('surface-text') }}>
                  Expenses · hover
                </Body>
              </Above>
            </ListRow>
          ) : null}
          {has('hover') ? (
            <ListRow styles={{ fill: c('surface') }}>
              <Layer styles={{ fill: c('hover') }} />
              <Above>
                <Body styles={{ color: c('surface-text') }}>
                  Forecast · tinted hover
                </Body>
              </Above>
            </ListRow>
          ) : null}
          {has('tint') ? (
            <ListRow styles={{ fill: c('tint') }}>
              <Body styles={{ color: c('surface-text') }}>
                Payroll · selected
              </Body>
            </ListRow>
          ) : null}
        </Stack>
      ) : null}
      {has('loading-face-1') ? (
        <Stack>
          <Bar styles={{ width: '55%', fill: c('loading-face-1') }} />
          <Bar styles={{ width: '80%', fill: c('loading-face-2') }} />
          <Bar styles={{ width: '70%', fill: c('loading-face-3') }} />
        </Stack>
      ) : null}
      {has('disabled') ? (
        <Row>
          <Box styles={{ border: '1bw solid', borderColor: c('disabled') }} />
          <Meta styles={{ color: c('disabled') }}>
            Auto-archive (unavailable)
          </Meta>
        </Row>
      ) : null}
      {has('disabled-surface') ? (
        <Row>
          {button('Archive', 'disabled-surface', 'disabled-surface-text')}
        </Row>
      ) : null}
    </Card>
  ) : null;

  return (
    <Page
      styles={{ fill: c(has('surface-2') ? 'surface-2' : 'surface') }}
      data-not-content=""
    >
      {report}
      {search}
    </Page>
  );
}

export interface PreviewColumn {
  label: string;
  scheme: Scheme;
  darkHue?: number;
  darkSaturation?: number;
  contrastLevel?: number;
}

export interface PalettePreviewProps {
  /** Show the palette as it stands after this step. Default: the whole palette. */
  step?: StepId;
  /** Pinned schemes side by side (labeled with the scheme name). */
  schemes?: Scheme[];
  /** Pinned, labeled variants side by side (dark seed, contrast level). */
  columns?: PreviewColumn[];
  caption?: ReactNode;
}

function resolveAt(
  step: StepId,
  variant: Partial<PreviewColumn> = {},
): ResolvedDemo {
  const config: GlazeConfigOverride | undefined =
    variant.contrastLevel === undefined
      ? undefined
      : { contrastLevel: variant.contrastLevel };
  return resolveDemo({
    hue: PURPLE_HUE,
    saturation: SEED_SATURATION,
    darkHue: variant.darkHue,
    darkSaturation: variant.darkSaturation,
    config,
    colors: colorsUpTo(step),
  });
}

export default function PalettePreview(props: PalettePreviewProps) {
  const step = props.step ?? 'mixes';
  const columns: PreviewColumn[] | undefined =
    props.columns ??
    props.schemes?.map((s) => ({ label: SCHEME_LABELS[s], scheme: s }));

  if (!columns) {
    return (
      <Figure caption={props.caption}>
        <PreviewUi demo={resolveAt(step)} scheme="auto" />
      </Figure>
    );
  }

  const shared = resolveAt(step);
  return (
    <Figure caption={props.caption}>
      <Columns>
        {columns.map((col) => {
          const custom =
            col.darkHue !== undefined ||
            col.darkSaturation !== undefined ||
            col.contrastLevel !== undefined;
          return (
            <Cell key={col.label}>
              <Eyebrow>{col.label}</Eyebrow>
              <PreviewUi
                demo={custom ? resolveAt(step, col) : shared}
                scheme={col.scheme}
              />
            </Cell>
          );
        })}
      </Columns>
    </Figure>
  );
}
