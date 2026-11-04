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
import {
  Chip,
  ChipBlock,
  Eyebrow,
  Figure,
  Grid,
  Layer,
} from '../primitives';
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
type Kind = 'fill' | 'text' | 'label' | 'icon' | 'border' | 'ring' | 'layer' | 'cast';

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
  const tone = `tone ${fmt(toneOf(v), 1)}`;
  switch (kind) {
    case 'text':
    case 'icon':
    case 'border':
    case 'ring':
      return ground ? `${tone} · Lc ${fmt(apcaLc(v, ground), 1)}` : tone;
    case 'label':
      // The base is the label here: measure it as text on this fill.
      return ground ? `${tone} · Lc ${fmt(apcaLc(ground, v), 1)}` : tone;
    case 'cast':
    case 'layer': {
      const alpha = `α ${fmt(v.alpha, 3)}`;
      const isLighting =
        'type' in def && (def.type === 'shadow' || def.type === 'glow');
      if (isLighting && ground) {
        const step = compositeTone(v, ground) - luminanceTone(ground);
        return `${alpha} · ${signed(step)} tones`;
      }
      return 'type' in def ? alpha : `${tone} · ${alpha}`;
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
    <Chip>
      {block}
      <Chip.Label>
        <Chip.Name>{name}</Chip.Name>
        <Chip.Value>
          <SchemeValue values={values} scheme={scheme} />
        </Chip.Value>
      </Chip.Label>
    </Chip>
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

  const body = (scheme: SchemeChoice) => (
    <>
      <Grid>
        {names.map((name) => (
          <Swatch
            key={name}
            demo={demo}
            name={name}
            def={colors[name]}
            scheme={scheme}
          />
        ))}
      </Grid>
      {preview ? <PreviewUi demo={demo} scheme={scheme} /> : null}
    </>
  );

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
