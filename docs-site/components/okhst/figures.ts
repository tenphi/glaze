/**
 * What the tone figures build and measure (`ToneRamp`, `ToneDrift`,
 * `SchemeRamp`, `FloorCompare`). Each figure uses these, and so does its
 * Markdown form (`../markdown.ts`), so the site and the shipped docs print the
 * same values.
 */

import {
  fromTone,
  gamutClampedLuminance,
  okhslToLinearSrgb,
  toTone,
  toneFromY,
} from '../../../src/index.ts';
import type {
  AdaptationMode,
  ColorMap,
  ContrastSpec,
  GlazeConfigOverride,
  RelativeValue,
} from '../../../src/index.ts';
import { SCHEMES, fmt } from '../glaze-docs';
import type { DemoTheme, Scheme } from '../glaze-docs';

/** `0, 10, … 100` for 11 steps. */
function evenSteps(steps: number): number[] {
  return Array.from({ length: steps }, (_, i) => (i * 100) / (steps - 1));
}

export interface ToneRampSpec {
  hue?: number;
  /** OKHSL saturation, 0–100. */
  saturation?: number;
  /** Number of steps from 0 to 100 inclusive. Default 11. */
  steps?: number;
  axis?: 'tone' | 'lightness';
  /** Show the contrast ratio between neighbors. Default true. */
  contrast?: boolean;
}

/**
 * `ToneRamp`'s steps: each step's value on its axis, its OKHSL lightness, its
 * luminance `y` and its tone.
 */
export function toneRampCells(spec: ToneRampSpec) {
  const hue = spec.hue ?? 280;
  const sat = (spec.saturation ?? 0) / 100;
  const axis = spec.axis ?? 'tone';
  return evenSteps(spec.steps ?? 11).map((value) => {
    const l = axis === 'tone' ? fromTone(value) : value / 100;
    const y = gamutClampedLuminance(okhslToLinearSrgb(hue, sat, l));
    return { value, l, y, tone: toTone(l) };
  });
}

/** Luminance-equivalent tone of an OKHSL color. */
export function measuredTone(h: number, s: number, l: number): number {
  return toneFromY(gamutClampedLuminance(okhslToLinearSrgb(h, s, l)));
}

/** The widest drift below and above the authored tone, at 1-tone resolution. */
export function driftRange(h: number, s: number): [number, number] {
  let lo = 0;
  let hi = 0;
  for (let t = 0; t <= 100; t++) {
    const d = measuredTone(h, s, fromTone(t)) - t;
    lo = Math.min(lo, d);
    hi = Math.max(hi, d);
  }
  return [lo, hi];
}

/** `driftRange` in words. */
export function driftSummary(lo: number, hi: number): string {
  const parts: string[] = [];
  if (lo <= -0.05) parts.push(`up to ${fmt(-lo, 1)} tones darker`);
  if (hi >= 0.05) parts.push(`up to ${fmt(hi, 1)} tones lighter`);
  return parts.length ? `reads ${parts.join(', ')}` : 'matches its tone';
}

/** The authored tones of `ToneDrift`'s columns. */
export function driftTones(steps = 11): number[] {
  return evenSteps(steps);
}

export interface SchemeRampSpec {
  hue?: number;
  /** Theme seed saturation, 0–100. Default 0 (neutral). */
  saturation?: number;
  /** Adaptation mode of every step. Default `'auto'`. */
  mode?: AdaptationMode;
  /** Per-theme config override (tone windows, contrast level). */
  config?: GlazeConfigOverride;
  /** Schemes to show, top to bottom. Default: all four. */
  schemes?: Scheme[];
  /** Number of steps from 0 to 100 inclusive. Default 11. */
  steps?: number;
}

/** `SchemeRamp`: one `tone-<t>` color per authored tone. */
export function schemeRamp(spec: SchemeRampSpec) {
  const schemes = spec.schemes ?? SCHEMES;
  const tones = evenSteps(spec.steps ?? 11);
  const names = tones.map((t) => `tone-${fmt(t, 1)}`);
  const colors: ColorMap = {};
  tones.forEach((t, i) => {
    colors[names[i]] = spec.mode ? { tone: t, mode: spec.mode } : { tone: t };
  });
  const theme: DemoTheme = {
    hue: spec.hue ?? 280,
    saturation: spec.saturation ?? 0,
    config: spec.config,
    colors,
  };
  return { schemes, tones, names, theme };
}

/** A window edge: two decimals without trailing zeros (4.95, 95.9, 100). */
export function edgeLabel(tone: number): string {
  return String(Number(fmt(tone, 2)));
}

export interface FloorCompareSpec {
  /** Hues of the chromatic text colors. A neutral row is always first. */
  hues: number[];
  /** Theme seed saturation for the chromatic rows, 0–100. Default 90. */
  saturation?: number;
  /** Tone of the neutral surface. Default 97. */
  surfaceTone?: number;
  /** Tone delta of every text color from the surface. Default `'-49.4'`. */
  delta?: RelativeValue;
  /** Contrast floor of the second column. Default `'AA'`. */
  contrast?: ContrastSpec;
  scheme?: Scheme;
}

/**
 * `FloorCompare`: a neutral `surface`, and per row (`neutral`, `hue-<h>`) a
 * `<row>-step` text color at the plain delta and a `<row>-floor` with the
 * floor added.
 */
export function floorCompare(spec: FloorCompareSpec) {
  const scheme = spec.scheme ?? 'light';
  const delta = spec.delta ?? '-49.4';
  const contrast = spec.contrast ?? 'AA';

  const rows = [
    { key: 'neutral', label: 'neutral', extra: { saturation: 0 } },
    ...spec.hues.map((h) => ({
      key: `hue-${h}`,
      label: `hue ${h}`,
      extra: { hue: h },
    })),
  ];
  const colors: ColorMap = {
    surface: { tone: spec.surfaceTone ?? 97, saturation: 0 },
  };
  for (const row of rows) {
    colors[`${row.key}-step`] = { base: 'surface', tone: delta, ...row.extra };
    colors[`${row.key}-floor`] = {
      base: 'surface',
      tone: delta,
      contrast,
      ...row.extra,
    };
  }
  const theme: DemoTheme = {
    hue: spec.hues[0] ?? 0,
    saturation: spec.saturation ?? 90,
    colors,
  };
  return { scheme, delta, contrast, rows, theme };
}
