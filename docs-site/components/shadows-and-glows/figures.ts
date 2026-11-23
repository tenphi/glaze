/**
 * The themes the shadow and glow figures build from their props. Each figure
 * resolves its theme here, and its Markdown form (`../markdown.ts`) measures
 * the same one, so the site and the shipped docs print the same values.
 */

import type { ColorMap, LightingTuning } from '../../../src/index.ts';
import type { DemoTheme } from '../glaze-docs';

type Kind = 'shadow' | 'glow';

export interface StepCompareSpec {
  kind?: Kind;
  /** Seed hue and saturation (0–100) of the chromatic surface. */
  hue?: number;
  saturation?: number;
  /** Neutral surface tones. */
  tones: number[];
  /** Tone of a chromatic surface appended to the row. */
  accentTone?: number;
  intensity?: number;
  /** Opacity of the fixed black / white layer, 0–1. */
  fixedAlpha?: number;
}

/**
 * `StepCompare`: each surface (`surface-<tone>`, `accent`) with an overlay of
 * the figure's kind (`<kind>-<surface>`), and the `fixed` layer.
 */
export function stepCompare(spec: StepCompareSpec) {
  const kind = spec.kind ?? 'shadow';
  const intensity = spec.intensity ?? 6;
  const fixedAlpha = spec.fixedAlpha ?? 0.08;
  const pigment = kind === 'shadow' ? 'black' : 'white';

  const surfaces = spec.tones.map((tone) => ({
    name: `surface-${tone}`,
    label: `tone ${tone}`,
    def: { tone, saturation: 0, mode: 'static' as const },
  }));
  if (spec.accentTone !== undefined) {
    surfaces.push({
      name: 'accent',
      label: `accent ${spec.accentTone}`,
      def: { tone: spec.accentTone, saturation: 1, mode: 'static' as const },
    });
  }

  const colors: ColorMap = {
    fixed: {
      tone: kind === 'shadow' ? 0 : 100,
      saturation: 0,
      mode: 'static',
      opacity: fixedAlpha,
    },
  };
  for (const s of surfaces) {
    colors[s.name] = s.def;
    colors[`${kind}-${s.name}`] = { type: kind, bg: s.name, intensity };
  }

  const theme: DemoTheme = {
    hue: spec.hue ?? 280,
    saturation: spec.saturation ?? 80,
    colors,
  };
  return { kind, intensity, fixedAlpha, pigment, surfaces, theme };
}

export interface UnreachableSpec {
  cases: { kind: Kind; tone: number; intensity: number }[];
}

/** `Unreachable`: one `surface-<i>` and its `overlay-<i>` per case. */
export function unreachableTheme(spec: UnreachableSpec): DemoTheme {
  const colors: ColorMap = {};
  spec.cases.forEach((c, i) => {
    colors[`surface-${i}`] = { tone: c.tone, saturation: 0, mode: 'static' };
    colors[`overlay-${i}`] = {
      type: c.kind,
      bg: `surface-${i}`,
      intensity: c.intensity,
    };
  });
  return { hue: 0, saturation: 0, colors };
}

export interface TintedPigmentSpec {
  /** Seed hue and saturation (0–100) the surfaces are tinted with. */
  hue: number;
  saturation: number;
  /** Saturation factor of the surfaces (0–1). Default 0.3. */
  surfaceSaturation?: number;
  tones: number[];
  intensity?: number;
  /** Object for `hueBleed` columns: an absolute hue at full saturation. */
  object?: { hue: number; tone: number };
  columns: { label: string; tuning: LightingTuning; withObject?: boolean }[];
}

/**
 * `TintedPigment`: a `surface-<tone>` per tone, and on it a
 * `shadow-<tone>-<column>` per column; `object` for `hueBleed` columns.
 */
export function tintedPigmentTheme(spec: TintedPigmentSpec): DemoTheme {
  const intensity = spec.intensity ?? 8;
  const colors: ColorMap = {};
  if (spec.object) {
    colors.object = {
      tone: spec.object.tone,
      hue: spec.object.hue,
      saturation: 1,
      mode: 'static',
    };
  }
  spec.tones.forEach((tone) => {
    colors[`surface-${tone}`] = {
      tone,
      saturation: spec.surfaceSaturation ?? 0.3,
      mode: 'static',
    };
    spec.columns.forEach((col, j) => {
      colors[`shadow-${tone}-${j}`] = {
        type: 'shadow',
        bg: `surface-${tone}`,
        ...(col.withObject && spec.object ? { fg: 'object' } : {}),
        intensity,
        tuning: col.tuning,
      };
    });
  });
  return { hue: spec.hue, saturation: spec.saturation, colors };
}
