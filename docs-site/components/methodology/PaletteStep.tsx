/**
 * One step of "Designing a palette": the tokens that step adds, each drawn in
 * the context it is used in (text on its base, a border around a box, a state
 * layer over its fill, a card casting its shadow), followed by the product UI
 * built from the whole palette so far.
 *
 * Value lines are measured from the resolved theme: tone, opacity, the APCA
 * Lc a foreground reaches against its base, and the tone step a shadow or
 * glow lands once composited.
 */

import type { ReactNode } from 'react';
import { tasty } from '@tenphi/cookbook/styling';
import { Chip, ChipBlock, Eyebrow, Figure, Layer } from '../primitives';
import SchemeValue from '../SchemeValue';
import {
  SCHEMES,
  SCHEME_LABELS,
  apcaLc,
  fmt,
  paint,
  resolveDemo,
  toneOf,
  variantOf,
} from '../glaze-docs';
import type {
  ResolvedDemo,
  Scheme,
  SchemeChoice,
  SchemeColors,
} from '../glaze-docs';
import {
  okhslToLinearSrgb,
  relativeLuminanceFromLinearRgb,
  toneFromY,
  variantToOkhsl,
} from '../../../src/index.ts';
import {
  compositeOverGamma,
  toDisplayGamma,
} from '../../../src/okhsl-color-math.ts';
import type {
  ColorDef,
  ColorMap,
  ResolvedColorVariant,
} from '../../../src/index.ts';
import { PreviewUi } from './PalettePreview';
import {
  DISABLED_TEXT_WITH_FLOOR,
  PURPLE_HUE,
  SEED_SATURATION,
  STEPS,
  colorsUpTo,
} from './palette';
import type { StepId } from './palette';

/** How a token is drawn in its swatch. */
type Kind =
  | 'fill'
  | 'text'
  | 'label'
  | 'icon'
  | 'border'
  | 'ring'
  | 'layer'
  | 'cast';

/** Foregrounds and other non-fill tokens, by name. Everything else is a fill. */
const KIND: Record<string, Kind> = {
  'surface-text': 'text',
  'surface-text-soft': 'text',
  'surface-text-soft-2': 'text',
  border: 'border',
  placeholder: 'text',
  focus: 'ring',
  disabled: 'text',
  'disabled-surface-text': 'text',
  'accent-surface': 'label',
  'accent-surface-2': 'label',
  'accent-surface-hover': 'label',
  'accent-text': 'text',
  'accent-text-soft': 'text',
  'accent-icon': 'icon',
  'accent-disabled-surface-text': 'text',
  'code-comment': 'text',
  'code-keyword': 'text',
  'code-string': 'text',
};

const SAMPLE: Record<string, string> = {
  'code-comment': '// draft',
  'code-keyword': 'const',
  'code-string': "'Q3'",
};

const EXTRAS: Record<string, ColorMap> = {
  'disabled-floor': DISABLED_TEXT_WITH_FLOOR,
};

const Glyph = tasty({
  as: 'span',
  styles: { position: 'relative', preset: 'h5', margin: '0' },
});

const CodeGlyph = tasty({
  as: 'span',
  styles: { position: 'relative', preset: 'code', fontWeight: 600 },
});

const Dot = tasty({
  styles: { width: '3x', height: '3x', radius: 'round' },
});

const Frame = tasty({
  styles: { width: '70%', height: '4x', radius: '1r' },
});

/**
 * A swatch. Across the content column it stacks the color over its label.
 * On a phone, and in a side-by-side scheme column (`row`), it sets the
 * color beside the label instead, so a long name and its value line each keep
 * one line and neighboring swatches stay aligned.
 */
const SwatchChip = tasty(Chip, {
  modProps: { row: Boolean },
  styles: {
    gridRows: { '': 'minmax(4.5rem, auto)', '@sm & !row': '4.5rem auto' },
    gridColumns: {
      '': '5rem minmax(0, 1fr)',
      '@sm & !row': 'minmax(0, 1fr)',
    },
    Label: { alignContent: { '': 'center', '@sm & !row': 'start' } },
  },
});

/**
 * The swatches of one step: up to three across, one per line on a phone. A
 * step with fewer tokens spreads them over the row, so a long name still fits.
 */
const Swatches = tasty({
  styles: {
    display: 'grid',
    gap: '1.5x',
    gridColumns: {
      '': 'minmax(0, 1fr)',
      '@sm': 'repeat(auto-fit, minmax(11rem, 1fr))',
    },
  },
});

/** The swatches inside one of several side-by-side scheme columns. */
const CellSwatches = tasty({
  styles: { display: 'grid', gap: '1x' },
});

const Columns = tasty({
  styles: {
    display: 'grid',
    gap: '2x',
    gridColumns: 'repeat(auto-fit, minmax(17rem, 1fr))',
  },
});

const Cell = tasty({
  styles: { display: 'grid', gap: '1.5x', alignContent: 'start' },
});

function kindOf(name: string, def: ColorDef): Kind {
  if ('type' in def && (def.type === 'shadow' || def.type === 'glow')) {
    return def.fg ? 'cast' : 'layer';
  }
  if ('type' in def && def.type === 'mix') {
    return def.blend === 'transparent' ? 'layer' : 'fill';
  }
  if ('opacity' in def && def.opacity !== undefined && def.opacity < 1) {
    return 'layer';
  }
  return KIND[name] ?? 'fill';
}

/** The color a token is drawn on (its base, or the surface it overlays). */
function groundOf(def: ColorDef): string | undefined {
  if ('type' in def && (def.type === 'shadow' || def.type === 'glow')) {
    return def.bg;
  }
  if ('type' in def && def.type === 'mix') return def.base;
  return 'base' in def ? def.base : undefined;
}

function linearOf(v: ResolvedColorVariant) {
  const { h, s, l } = variantToOkhsl(v);
  return okhslToLinearSrgb(h, s, l, v.pastel ?? false);
}

/**
 * Tone of a color's measured luminance. Shadow and glow steps are measured on
 * this scale, which equals the OKHST tone for neutrals and drifts slightly
 * from it for chromatic fills.
 */
function luminanceTone(v: ResolvedColorVariant): number {
  return toneFromY(relativeLuminanceFromLinearRgb(linearOf(v)));
}

/** Luminance tone of `over` composited onto `under`, as the browser paints it. */
function compositeTone(
  over: ResolvedColorVariant,
  under: ResolvedColorVariant,
): number {
  return toneFromY(
    relativeLuminanceFromLinearRgb(
      compositeOverGamma(
        toDisplayGamma(linearOf(under)),
        toDisplayGamma(linearOf(over)),
        over.alpha,
      ),
    ),
  );
}

function signed(n: number): string {
  const v = fmt(n, 1);
  return n > 0 ? `+${v}` : v.replace('-', '−');
}

/** Keeps a label and its number on one line. */
const NBSP = '\u00a0';

/**
 * Joins measurements into one value line. Each label stays with its number,
 * and a line that runs out of room breaks only after a separator.
 */
function line(...parts: string[]): string {
  return parts.join(`${NBSP}· `);
}

/** The measured value line of one token in one scheme. */
function valueLine(
  demo: ResolvedDemo,
  name: string,
  def: ColorDef,
  kind: Kind,
  scheme: Scheme,
): string {
  const v = variantOf(demo.resolved, name, scheme);
  const groundName = groundOf(def);
  const ground = groundName
    ? variantOf(demo.resolved, groundName, scheme)
    : undefined;
  const tone = `tone${NBSP}${fmt(toneOf(v), 1)}`;
  const lc = (text: ResolvedColorVariant, bg: ResolvedColorVariant) =>
    `Lc${NBSP}${fmt(apcaLc(text, bg), 1)}`;
  switch (kind) {
    case 'text':
    case 'icon':
    case 'border':
    case 'ring':
      return ground ? line(tone, lc(v, ground)) : tone;
    case 'label':
      // The base is the label here: measure it as text on this fill.
      return ground ? line(tone, lc(ground, v)) : tone;
    case 'cast':
    case 'layer': {
      const alpha = `α${NBSP}${fmt(v.alpha, 3)}`;
      const isLighting =
        'type' in def && (def.type === 'shadow' || def.type === 'glow');
      if (isLighting && ground) {
        const step = compositeTone(v, ground) - luminanceTone(ground);
        return line(alpha, `${signed(step)}${NBSP}tones`);
      }
      return 'type' in def ? alpha : line(tone, alpha);
    }
    default:
      return tone;
  }
}

function Swatch(props: {
  demo: ResolvedDemo;
  name: string;
  def: ColorDef;
  scheme: SchemeChoice;
  /** Color beside the label at every width (a side-by-side column). */
  row: boolean;
}) {
  const { demo, name, def, scheme } = props;
  const kind = kindOf(name, def);
  const c = (n: string) => paint(demo.colors[n], scheme);
  const ground = groundOf(def) ?? 'surface';

  let block: ReactNode;
  switch (kind) {
    case 'text': {
      const G = SAMPLE[name] ? CodeGlyph : Glyph;
      block = (
        <ChipBlock styles={{ fill: c(ground) }}>
          <G styles={{ color: c(name) }}>{SAMPLE[name] ?? 'Aa'}</G>
        </ChipBlock>
      );
      break;
    }
    case 'label':
      block = (
        <ChipBlock styles={{ fill: c(name) }}>
          <Glyph styles={{ color: c(ground) }}>Aa</Glyph>
        </ChipBlock>
      );
      break;
    case 'icon':
      block = (
        <ChipBlock styles={{ fill: c(ground), placeItems: 'center' }}>
          <Dot styles={{ fill: c(name) }} />
        </ChipBlock>
      );
      break;
    case 'border':
      block = (
        <ChipBlock styles={{ fill: c(ground), placeItems: 'center' }}>
          <Frame styles={{ border: '1bw solid', borderColor: c(name) }} />
        </ChipBlock>
      );
      break;
    case 'ring': {
      const ring = {} as SchemeColors;
      for (const s of SCHEMES) ring[s] = `0 0 0 2px ${demo.colors[name][s]}`;
      block = (
        <ChipBlock styles={{ fill: c(ground), placeItems: 'center' }}>
          <Frame styles={{ fill: c(ground), shadow: paint(ring, scheme) }} />
        </ChipBlock>
      );
      break;
    }
    case 'cast': {
      const fg = 'fg' in def && def.fg ? def.fg : ground;
      const drop = {} as SchemeColors;
      for (const s of SCHEMES) {
        drop[s] = `0 0.5rem 1rem -0.125rem ${demo.colors[name][s]}`;
      }
      block = (
        <ChipBlock styles={{ fill: c(ground), placeItems: 'center' }}>
          <Frame styles={{ fill: c(fg), shadow: paint(drop, scheme) }} />
        </ChipBlock>
      );
      break;
    }
    case 'layer':
      block = (
        <ChipBlock styles={{ fill: c(ground) }}>
          <Layer styles={{ fill: c(name) }} />
        </ChipBlock>
      );
      break;
    default:
      block = <ChipBlock styles={{ fill: c(name) }} />;
  }

  const values = {} as Record<Scheme, string>;
  for (const s of SCHEMES) values[s] = valueLine(demo, name, def, kind, s);

  return (
    <SwatchChip row={props.row}>
      {block}
      <SwatchChip.Label>
        <SwatchChip.Name>{name}</SwatchChip.Name>
        <SwatchChip.Value>
          <SchemeValue values={values} scheme={scheme} />
        </SwatchChip.Value>
      </SwatchChip.Label>
    </SwatchChip>
  );
}

export interface PaletteStepProps {
  /** The walkthrough step to show. */
  step: StepId;
  /** Tokens to show, in order. Default: the ones this step adds. */
  show?: string[];
  /** Swap in an alternative definition from `palette.ts`. */
  extra?: keyof typeof EXTRAS;
  /** Compare pinned schemes side by side instead of following the reader. */
  schemes?: Scheme[];
  /** Also render the product UI built so far. Default `true`. */
  preview?: boolean;
  caption?: ReactNode;
}

export default function PaletteStep(props: PaletteStepProps) {
  const colors: ColorMap = {
    ...colorsUpTo(props.step),
    ...(props.extra ? EXTRAS[props.extra] : {}),
  };
  const demo = resolveDemo({
    hue: PURPLE_HUE,
    saturation: SEED_SATURATION,
    colors,
  });
  const names = props.show ?? Object.keys(STEPS[props.step]);
  const preview = props.preview ?? true;

  const body = (scheme: SchemeChoice) => {
    const row = scheme !== 'auto';
    const SwatchGrid = row ? CellSwatches : Swatches;
    return (
      <>
        <SwatchGrid>
          {names.map((name) => (
            <Swatch
              key={name}
              demo={demo}
              name={name}
              def={colors[name]}
              scheme={scheme}
              row={row}
            />
          ))}
        </SwatchGrid>
        {preview ? <PreviewUi demo={demo} scheme={scheme} /> : null}
      </>
    );
  };

  return (
    <Figure caption={props.caption}>
      {props.schemes ? (
        <Columns>
          {props.schemes.map((s) => (
            <Cell key={s}>
              <Eyebrow>{SCHEME_LABELS[s]}</Eyebrow>
              {body(s)}
            </Cell>
          ))}
        </Columns>
      ) : (
        body('auto')
      )}
    </Figure>
  );
}
