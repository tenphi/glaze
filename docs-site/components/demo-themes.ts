/**
 * Shared demo themes, so pages show one consistent product UI.
 *
 * `UI_DEMO` follows the methodology's naming: `surface` is the page, `card`
 * steps one surface level away from it, and the accent fill is a fixed-mode
 * chain anchored to its label so it keeps its polarity in dark mode.
 */

import type { DemoTheme } from './glaze-docs';
import type { ColorMap } from '../../src/index.ts';

/** Role → color-name mapping that `UiPreview` reads. */
export interface UiRoles {
  /** Page background. */
  page: string;
  /** Card fill. */
  card: string;
  /** Card border. */
  border: string;
  /** Heading / primary text on the card. */
  text: string;
  /** Secondary text on the card. */
  textSoft: string;
  /** Inline link / accent text on the card. */
  link: string;
  /** Primary button fill. */
  accent: string;
  /** Primary button label. */
  accentLabel: string;
  /** Card drop shadow (a `shadow` color). Optional. */
  shadow?: string;
}

export const UI_ROLES: UiRoles = {
  page: 'surface',
  card: 'card',
  border: 'border',
  text: 'text',
  textSoft: 'text-soft',
  link: 'link',
  accent: 'accent',
  accentLabel: 'accent-label',
  shadow: 'card-shadow',
};

export const UI_COLORS: ColorMap = {
  surface: { tone: 100, saturation: 0.1 },
  card: { base: 'surface', tone: '-3', saturation: 0.15 },
  text: { base: 'card', tone: 4, saturation: 0.45 },
  'text-soft': {
    base: 'card',
    tone: '-1',
    saturation: 0.3,
    contrast: 'AA',
  },
  border: { base: 'card', tone: ['-12', '-24'], saturation: 0.2 },
  link: {
    base: 'card',
    tone: '-1',
    contrast: 'AA',
  },
  'accent-label': { tone: 100, mode: 'fixed' },
  accent: {
    base: 'accent-label',
    tone: '-1',
    contrast: 'AA',
    mode: 'fixed',
  },
  'card-shadow': { type: 'shadow', bg: 'surface', fg: 'card', intensity: 8 },
};

export const UI_DEMO: DemoTheme = {
  hue: 280,
  saturation: 80,
  colors: UI_COLORS,
};
