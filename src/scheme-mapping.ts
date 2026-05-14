/**
 * Light / dark scheme lightness mappings.
 *
 * Owns the active lightness window selection (with per-call scaling
 * overrides and high-contrast handling), the Möbius curve used by the
 * `'auto'` dark adaptation, and the saturation-desaturation reducer
 * for dark mode.
 */

import { clamp, pairHC, pairNormal } from './hc-pair';
import { getConfig } from './config';
import type { AdaptationMode, GlazeColorScaling } from './types';

/**
 * Resolve the active lightness window for a scheme.
 * - HC variants always return `[0, 100]` (existing behavior, predates per-call overrides).
 * - Otherwise, per-call `scaling` (e.g. from `glaze.color()`'s third arg) wins;
 *   `false` is interpreted as `[0, 100]` (no remap). Falls back to `globalConfig.*Lightness`.
 */
export function lightnessWindow(
  isHighContrast: boolean,
  kind: 'light' | 'dark',
  scaling?: GlazeColorScaling,
): [number, number] {
  if (isHighContrast) return [0, 100];
  if (scaling) {
    const override =
      kind === 'dark' ? scaling.darkLightness : scaling.lightLightness;
    if (override === false) return [0, 100];
    if (override !== undefined) return override;
  }
  const cfg = getConfig();
  return kind === 'dark' ? cfg.darkLightness : cfg.lightLightness;
}

export function mapLightnessLight(
  l: number,
  mode: AdaptationMode,
  isHighContrast: boolean,
  scaling?: GlazeColorScaling,
): number {
  if (mode === 'static') return l;
  const [lo, hi] = lightnessWindow(isHighContrast, 'light', scaling);
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
  scaling?: GlazeColorScaling,
): number {
  if (mode === 'static') return l;

  const cfg = getConfig();
  const beta = isHighContrast
    ? pairHC(cfg.darkCurve)
    : pairNormal(cfg.darkCurve);
  const [darkLo, darkHi] = lightnessWindow(isHighContrast, 'dark', scaling);

  if (mode === 'fixed') {
    return (l * (darkHi - darkLo)) / 100 + darkLo;
  }

  const [lightLo, lightHi] = lightnessWindow(isHighContrast, 'light', scaling);
  const lightL = (l * (lightHi - lightLo)) / 100 + lightLo;
  const t = (lightHi - lightL) / (lightHi - lightLo);
  return darkLo + (darkHi - darkLo) * mobiusCurve(t, beta);
}

export function lightMappedToDark(
  lightL: number,
  isHighContrast: boolean,
  scaling?: GlazeColorScaling,
): number {
  const cfg = getConfig();
  const beta = isHighContrast
    ? pairHC(cfg.darkCurve)
    : pairNormal(cfg.darkCurve);
  const [lightLo, lightHi] = lightnessWindow(isHighContrast, 'light', scaling);
  const [darkLo, darkHi] = lightnessWindow(isHighContrast, 'dark', scaling);
  const clamped = clamp(lightL, lightLo, lightHi);
  const t = (lightHi - clamped) / (lightHi - lightLo);
  return darkLo + (darkHi - darkLo) * mobiusCurve(t, beta);
}

export function mapSaturationDark(s: number, mode: AdaptationMode): number {
  if (mode === 'static') return s;
  return s * (1 - getConfig().darkDesaturation);
}

export function schemeLightnessRange(
  isDark: boolean,
  mode: AdaptationMode,
  isHighContrast: boolean,
  scaling?: GlazeColorScaling,
): [number, number] {
  if (mode === 'static') return [0, 1];
  const [lo, hi] = lightnessWindow(
    isHighContrast,
    isDark ? 'dark' : 'light',
    scaling,
  );
  return [lo / 100, hi / 100];
}
