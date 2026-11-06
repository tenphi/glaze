/**
 * The palette that "Designing a palette" (`docs/methodology.mdx`) builds, one
 * step at a time. The color maps here are the code blocks on that page, so
 * the live previews show exactly what each step defines; keep the two in
 * sync when either changes.
 */

import type { ColorMap } from '../../../src/index.ts';
import type { DemoTheme } from '../glaze-docs';

export const PURPLE_HUE = 280.3;
export const SUCCESS_HUE = 156.9;
export const DANGER_HUE = 23.1;
export const WARNING_HUE = 84.3;
export const NOTE_HUE = 302.3;

export const SEED_SATURATION = 80;

/** Steps of the walkthrough, in the order the page adds them. */
export type StepId =
  | 'surfaces'
  | 'text'
  | 'utility'
  | 'chips'
  | 'fixed'
  | 'adaptive'
  | 'accent-disabled'
  | 'code'
  | 'loading'
  | 'shadows'
  | 'state-layers'
  | 'scrim'
  | 'mixes';

export const STEPS: Record<StepId, ColorMap> = {
  surfaces: {
    surface: { tone: 100, saturation: 0.11 },
    'surface-2': {
      base: 'surface',
      tone: '-2',
      saturation: 0.15,
      inherit: false,
    },
    'surface-3': {
      base: 'surface',
      tone: '-4',
      saturation: 0.19,
      inherit: false,
    },
  },
  text: {
    'surface-text': {
      base: 'surface',
      tone: 2,
      saturation: 0.475,
    },
    'surface-text-soft': {
      base: 'surface',
      tone: '-1',
      saturation: 0.375,
      contrast: { apca: ['content', 'body'] },
      inherit: false,
    },
    'surface-text-soft-2': {
      base: 'surface',
      tone: '-1',
      saturation: 0.24,
      contrast: { apca: ['large', 'content'] },
      inherit: false,
    },
    border: {
      base: 'surface',
      tone: ['-10', '-20'],
      saturation: 0.175,
      inherit: false,
    },
  },
  utility: {
    placeholder: {
      base: 'surface',
      tone: 67,
      saturation: 0.175,
      inherit: false,
    },
    focus: {
      base: 'surface',
      tone: 71,
      saturation: 0.8625,
      inherit: false,
    },
    disabled: {
      tone: 80.8,
      saturation: 0.4,
      inherit: false,
    },
  },
  chips: {
    'disabled-surface': {
      base: 'surface',
      tone: '-3',
      saturation: 0.2,
      inherit: false,
    },
    'disabled-surface-text': {
      base: 'disabled-surface',
      tone: '-18',
      saturation: 0.3,
      autoFlip: false,
      inherit: false,
    },
  },
  fixed: {
    'surface-inverse': {
      tone: 12,
      saturation: 0.475,
      mode: 'fixed',
      inherit: false,
    },
    'accent-surface-text': {
      tone: 100,
      mode: 'fixed',
    },
    'accent-surface': {
      base: 'accent-surface-text',
      tone: '-1',
      contrast: { apca: ['content', 'body'] },
      mode: 'fixed',
    },
    'accent-surface-2': {
      base: 'accent-surface-text',
      tone: '-1',
      contrast: { apca: [65, 80] },
      mode: 'fixed',
    },
    'accent-surface-hover': {
      base: 'accent-surface-text',
      tone: '-1',
      contrast: { apca: ['body', 'preferred'] },
      mode: 'fixed',
    },
  },
  adaptive: {
    'accent-text': {
      base: 'surface',
      tone: '-1',
      saturation: 1,
      contrast: { apca: ['content', 'body'] },
    },
    'accent-text-soft': {
      base: 'surface',
      tone: '-1',
      saturation: 1,
      contrast: { apca: ['large', 'content'] },
    },
    'accent-icon': {
      base: 'surface',
      tone: '-1',
      saturation: 0.9375,
      contrast: { apca: ['non-text', 'large'] },
    },
  },
  'accent-disabled': {
    'accent-disabled-surface': {
      base: 'surface',
      tone: '+3',
      saturation: 0.5,
    },
    'accent-disabled-surface-text': {
      base: 'accent-disabled-surface',
      tone: '-18',
      saturation: 0.4,
      autoFlip: false,
    },
  },
  code: {
    'code-comment': {
      base: 'surface',
      hue: 280,
      saturation: 0.1,
      tone: '-1',
      contrast: { apca: ['large', 'content'] },
      inherit: false,
    },
    'code-keyword': {
      base: 'surface',
      hue: 348,
      saturation: 1,
      tone: '-1',
      contrast: { apca: ['content', 'body'] },
      inherit: false,
    },
    'code-string': {
      base: 'surface',
      hue: SUCCESS_HUE,
      saturation: 1,
      tone: '-1',
      contrast: { apca: ['large', 'content'] },
      inherit: false,
    },
  },
  loading: {
    'loading-face-1': {
      base: 'surface',
      tone: 98,
      saturation: 0.3,
      inherit: false,
    },
    'loading-face-2': {
      base: 'surface',
      tone: 91,
      saturation: 0.62,
      inherit: false,
    },
    'loading-face-3': {
      base: 'surface',
      tone: 79,
      saturation: 0.66,
      inherit: false,
    },
  },
  shadows: {
    'shadow-sm': {
      type: 'shadow',
      bg: 'surface-2',
      fg: 'surface',
      intensity: 4,
      inherit: false,
    },
    'shadow-md': {
      type: 'shadow',
      bg: 'surface-2',
      fg: 'surface',
      intensity: [8, 14],
      inherit: false,
    },
    'shadow-lg': {
      type: 'shadow',
      bg: 'surface-2',
      fg: 'surface',
      intensity: [12, 20],
      inherit: false,
    },
  },
  'state-layers': {
    'surface-hover': { type: 'shadow', bg: 'surface', intensity: 3 },
    'accent-surface-pressed': {
      type: 'shadow',
      bg: 'accent-surface',
      intensity: [6, 10],
    },
    'accent-surface-highlight': {
      type: 'glow',
      bg: 'accent-surface',
      intensity: 5,
    },
  },
  scrim: {
    scrim: {
      tone: 0,
      saturation: 0,
      mode: 'static',
      opacity: 0.5,
      inherit: false,
    },
  },
  mixes: {
    hover: {
      type: 'mix',
      base: 'surface',
      target: 'accent-surface',
      value: 8,
      blend: 'transparent',
    },
    tint: {
      type: 'mix',
      base: 'surface',
      target: 'accent-surface',
      value: 20,
    },
  },
};

export const STEP_ORDER = Object.keys(STEPS) as StepId[];

/** The contrast-floored alternative for the disabled chip label. */
export const DISABLED_TEXT_WITH_FLOOR: ColorMap = {
  'disabled-surface-text': {
    base: 'disabled-surface',
    tone: '+1',
    saturation: 0.3,
    contrast: { apca: 'non-text' },
    inherit: false,
  },
};

/** The root override that tints each status theme's surface. */
export const TINTED_SURFACE_OVERRIDE: ColorMap = {
  surface: { tone: 96, saturation: 0.8 },
};

/** Status themes the page extends from the default theme. */
export const STATUS_THEMES: { name: string; hue?: number }[] = [
  { name: 'primary' },
  { name: 'success', hue: SUCCESS_HUE },
  { name: 'danger', hue: DANGER_HUE },
  { name: 'warning', hue: WARNING_HUE },
  { name: 'note', hue: NOTE_HUE },
];

/** Every color defined up to and including `step`. */
export function colorsUpTo(step: StepId): ColorMap {
  const out: ColorMap = {};
  for (const id of STEP_ORDER) {
    Object.assign(out, STEPS[id]);
    if (id === step) break;
  }
  return out;
}

/** The default theme as it stands after `step`. */
export function defaultThemeAt(step: StepId): DemoTheme {
  return {
    hue: PURPLE_HUE,
    saturation: SEED_SATURATION,
    colors: colorsUpTo(step),
  };
}
