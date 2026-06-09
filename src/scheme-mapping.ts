/**
 * Light / dark scheme lightness mappings.
 *
 * Owns the active lightness window selection (from a resolved effective
 * config passed in), the Möbius curve used by the `'auto'` dark
 * adaptation, and the saturation-desaturation reducer for dark mode.
 *
 * All functions take a `GlazeConfigResolved` so the full config
 * (including per-instance overrides) is available without re-reading
 * the global singleton inside the resolver.
 */

import { clamp, pairHC, pairNormal } from './hc-pair';
import type { AdaptationMode, GlazeConfigResolved } from './types';

/**
 * Resolve the active lightness window for a scheme.
 * - HC variants always return `[0, 100]` (no clamping in high-contrast).
 * - `false` (= "no clamping") is treated as `[0, 100]`.
 * - Otherwise uses the window from the resolved effective config.
 */
export function lightnessWindow(
  isHighContrast: boolean,
  kind: 'light' | 'dark',
  config: GlazeConfigResolved,
): [number, number] {
  if (isHighContrast) return [0, 100];
  const win = kind === 'dark' ? config.darkLightness : config.lightLightness;
  if (win === false) return [0, 100];
  return win;
}

export function mapLightnessLight(
  l: number,
  mode: AdaptationMode,
  isHighContrast: boolean,
  config: GlazeConfigResolved,
): number {
  if (mode === 'static') return l;
  const [lo, hi] = lightnessWindow(isHighContrast, 'light', config);
  return (l * (hi - lo)) / 100 + lo;
}

function mobiusCurve(t: number, beta: number): number {
  if (beta >= 1) return t;
  return t / (t + beta * (1 - t));
}

export function mapLightnessDark(
  l: number,
  mode: AdaptationMode,
  isHighContrast: boolean,
  config: GlazeConfigResolved,
): number {
  if (mode === 'static') return l;

  const beta = isHighContrast
    ? pairHC(config.darkCurve)
    : pairNormal(config.darkCurve);
  const [darkLo, darkHi] = lightnessWindow(isHighContrast, 'dark', config);

  if (mode === 'fixed') {
    return (l * (darkHi - darkLo)) / 100 + darkLo;
  }

  const [lightLo, lightHi] = lightnessWindow(isHighContrast, 'light', config);
  const lightL = (l * (lightHi - lightLo)) / 100 + lightLo;
  const t = (lightHi - lightL) / (lightHi - lightLo);
  return darkLo + (darkHi - darkLo) * mobiusCurve(t, beta);
}

export function lightMappedToDark(
  lightL: number,
  isHighContrast: boolean,
  config: GlazeConfigResolved,
): number {
  const beta = isHighContrast
    ? pairHC(config.darkCurve)
    : pairNormal(config.darkCurve);
  const [lightLo, lightHi] = lightnessWindow(isHighContrast, 'light', config);
  const [darkLo, darkHi] = lightnessWindow(isHighContrast, 'dark', config);
  const clamped = clamp(lightL, lightLo, lightHi);
  const t = (lightHi - clamped) / (lightHi - lightLo);
  return darkLo + (darkHi - darkLo) * mobiusCurve(t, beta);
}

export function mapSaturationDark(
  s: number,
  mode: AdaptationMode,
  config: GlazeConfigResolved,
): number {
  if (mode === 'static') return s;
  return s * (1 - config.darkDesaturation);
}

export function schemeLightnessRange(
  isDark: boolean,
  mode: AdaptationMode,
  isHighContrast: boolean,
  config: GlazeConfigResolved,
): [number, number] {
  if (mode === 'static') return [0, 1];
  const [lo, hi] = lightnessWindow(
    isHighContrast,
    isDark ? 'dark' : 'light',
    config,
  );
  return [lo / 100, hi / 100];
}
