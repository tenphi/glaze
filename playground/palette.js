/**
 * Palette generation for the OKHST playground.
 *
 * Pure, framework-free helpers that turn a (hue, saturation) seed into an
 * evenly-spaced ramp of OKHST tone steps using the real `glaze.color()`
 * factory. Keeping all the color math isolated from the DOM code makes it
 * easy to tweak the step logic — or swap the rendering target — later.
 *
 * Imports straight from `../src` so the playground always reflects the live
 * source (Vite transpiles the TypeScript on the fly).
 */

import { glaze, variantToOkhsl, okhslToSrgb } from '../src/index.ts';

/** Default number of tone steps across the 0–100 axis. */
export const DEFAULT_STEPS = 21;

/**
 * Per-token config used for every swatch.
 *
 * `lightTone: false` disables the light tone *window* so the authored tone
 * maps directly across the full 0–100 range — i.e. the swatches show the raw
 * OKHST tone axis (tone 0 → black, tone 100 → white) rather than a windowed
 * surface ladder. Tweak this object to explore other resolve behaviors
 * (e.g. add `saturationCeiling: false` to see the unclamped substrate).
 */
const SWATCH_CONFIG = { lightTone: false };

function toByte(channel) {
  return Math.round(channel * 255);
}

function toHex(rgb) {
  return (
    '#' +
    rgb
      .map((c) => toByte(c).toString(16).padStart(2, '0'))
      .join('')
  );
}

/**
 * Pick a readable text color (near-black or white) for a swatch, based on the
 * perceived brightness of its gamma-sRGB channels.
 */
function readableTextColor(rgb) {
  const luma = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  return luma > 0.55 ? '#15151a' : '#ffffff';
}

/**
 * Build a single tone-step descriptor at the given hue / saturation / tone.
 *
 * Returns everything the renderer needs: a ready-to-use CSS color, the hex
 * string, a contrasting text color, and the resolved OKHSL components (handy
 * for labels or future tweaks).
 *
 * @param {number} hue 0–360
 * @param {number} saturation 0–100
 * @param {number} tone 0–100 (contrast-uniform OKHST tone)
 */
export function buildStep(hue, saturation, tone) {
  const token = glaze.color({ hue, saturation, tone }, SWATCH_CONFIG);
  const variant = token.resolve().light;
  const okhsl = variantToOkhsl(variant);
  const rgb = okhslToSrgb(okhsl.h, okhsl.s, okhsl.l);

  return {
    tone,
    css: `rgb(${toByte(rgb[0])} ${toByte(rgb[1])} ${toByte(rgb[2])})`,
    hex: toHex(rgb),
    textColor: readableTextColor(rgb),
    okhsl,
  };
}

/**
 * Build an evenly-spaced ramp of `steps` tone values from 0 to 100.
 *
 * @param {number} hue 0–360
 * @param {number} saturation 0–100
 * @param {number} [steps] number of swatches (default {@link DEFAULT_STEPS})
 * @returns step descriptors ordered dark → light
 */
export function buildPalette(hue, saturation, steps = DEFAULT_STEPS) {
  const out = [];
  for (let i = 0; i < steps; i++) {
    const tone = steps === 1 ? 100 : (i / (steps - 1)) * 100;
    out.push(buildStep(hue, saturation, tone));
  }
  return out;
}
