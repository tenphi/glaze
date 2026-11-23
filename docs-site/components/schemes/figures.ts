/**
 * What `WindowMap` builds from its props. The figure uses it, and so does its
 * Markdown form (`../markdown.ts`), so the site and the shipped docs print the
 * same values.
 */

import type {
  AdaptationMode,
  ColorMap,
  GlazeConfigOverride,
} from '../../../src/index.ts';
import type { DemoTheme, Scheme } from '../glaze-docs';

export interface WindowMapRow {
  scheme: Scheme;
  /** Adaptation mode for this row. Default `'auto'`. */
  mode?: AdaptationMode;
  /** Row label. Default: the scheme name. */
  label?: string;
  /** Second label line. Default: `mode: '<mode>'`. */
  note?: string;
}

export interface WindowMapSpec {
  hue?: number;
  saturation?: number;
  config?: GlazeConfigOverride;
  /** Rows, top to bottom. Default: authored, light, dark. */
  rows?: WindowMapRow[];
  /** Number of authored tones from 0 to 100. Default 11. */
  steps?: number;
}

const DEFAULT_ROWS: WindowMapRow[] = [
  { scheme: 'light', mode: 'static', label: 'Authored tone', note: '' },
  { scheme: 'light' },
  { scheme: 'dark' },
];

/** `WindowMap`: a `<mode>-<i>` color per mode its rows use and authored tone. */
export function windowMap(spec: WindowMapSpec) {
  const rows = spec.rows ?? DEFAULT_ROWS;
  const steps = spec.steps ?? 11;
  const tones = Array.from(
    { length: steps },
    (_, i) => (i * 100) / (steps - 1),
  );
  const modes = [...new Set(rows.map((r) => r.mode ?? 'auto'))];

  const colors: ColorMap = {};
  for (const mode of modes) {
    tones.forEach((tone, i) => {
      colors[`${mode}-${i}`] = { tone, mode };
    });
  }
  const theme: DemoTheme = {
    hue: spec.hue ?? 0,
    saturation: spec.saturation ?? 0,
    config: spec.config,
    colors,
  };
  return { rows, tones, theme };
}

/** A tone label: a whole tone bare (`0`, `100`), anything else to 3 digits. */
export function toneLabel(t: number): string {
  const whole = Math.round(t);
  if (Math.abs(t - whole) < 0.005) return String(whole);
  return t.toPrecision(3);
}
