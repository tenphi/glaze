/**
 * Parsing and validation for `GlazeColorValue` — the literal color forms.
 *
 * Hex, the CSS color functions Glaze emits, and the four value-object shapes all
 * land here and come out as OKHSL. Split out of `color-token.ts` so both
 * consumers can reach it without an import cycle: standalone `glaze.color()`
 * tokens build on it, and the resolver needs it for a theme color's `from`. It
 * depends on nothing but the color math, which is what keeps that true.
 */

import {
  hslToSrgb,
  oklabToOkhsl,
  parseHexAlpha,
  srgbToOkhsl,
} from './okhsl-color-math';
import { okhstToOkhsl } from './okhst';
import type {
  GlazeColorValue,
  OkhslColor,
  OkhstColor,
  OklchColor,
  RgbColor,
} from './types';

/**
 * Matches the CSS color functions Glaze itself emits (`rgb()`, `hsl()`,
 * `okhsl()`, `oklch()`) plus their legacy alpha aliases (`rgba()`, `hsla()`).
 *
 * Only bare numeric components are supported. Named colors (`red`),
 * relative-color syntax (`from <color> ...`), and angle units other
 * than bare degrees (`deg` is the only suffix tolerated by `parseFloat`)
 * are out of scope.
 */
const COLOR_FN_RE = /^(rgba?|hsla?|okhsl|okhst|oklch)\(\s*([^)]*)\s*\)$/i;

function parseNumberOrPercent(raw: string, percentScale: number): number {
  if (raw.endsWith('%')) {
    return (parseFloat(raw) / 100) * percentScale;
  }
  return parseFloat(raw);
}

/**
 * Split the body of a CSS color function into its components and detect
 * whether an alpha channel was present.
 *
 * Handles both modern slash syntax (`R G B / A` or `R, G, B / A`) and
 * legacy comma syntax (`R, G, B, A`). The alpha value itself is discarded
 * by the caller — standalone Glaze colors have no opacity field.
 */
function splitColorBody(body: string): {
  components: string[];
  hadAlpha: boolean;
} {
  const slashIdx = body.indexOf('/');
  if (slashIdx !== -1) {
    const components = body
      .slice(0, slashIdx)
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean);
    const hadAlpha = body.slice(slashIdx + 1).trim().length > 0;
    return { components, hadAlpha };
  }

  const components = body.split(/[\s,]+/).filter(Boolean);
  if (components.length === 4) {
    components.pop();
    return { components, hadAlpha: true };
  }
  return { components, hadAlpha: false };
}

function warnDroppedAlpha(input: string): void {
  console.warn(
    `glaze: alpha component dropped from "${input}" (standalone color has no opacity field).`,
  );
}

export function parseColorString(input: string): OkhslColor {
  if (input.startsWith('#')) {
    const parsed = parseHexAlpha(input);
    if (!parsed) throw new Error(`glaze: invalid hex color "${input}".`);
    if (parsed.alpha !== undefined) warnDroppedAlpha(input);
    const [h, s, l] = srgbToOkhsl(parsed.rgb);
    return { h, s, l };
  }

  const m = input.match(COLOR_FN_RE);
  if (!m) {
    throw new Error(`glaze: unsupported color string "${input}".`);
  }

  const fn = m[1].toLowerCase();
  const { components, hadAlpha } = splitColorBody(m[2].trim());

  if (hadAlpha) warnDroppedAlpha(input);
  if (components.length !== 3) {
    throw new Error(`glaze: expected 3 components in "${input}".`);
  }

  switch (fn) {
    case 'rgb':
    case 'rgba': {
      const r = parseNumberOrPercent(components[0], 255) / 255;
      const g = parseNumberOrPercent(components[1], 255) / 255;
      const b = parseNumberOrPercent(components[2], 255) / 255;
      const [h, s, l] = srgbToOkhsl([r, g, b]);
      return { h, s, l };
    }
    case 'hsl':
    case 'hsla': {
      const h = parseFloat(components[0]);
      const s = parseNumberOrPercent(components[1], 1);
      const l = parseNumberOrPercent(components[2], 1);
      const [oh, os, ol] = srgbToOkhsl(hslToSrgb(h, s, l));
      return { h: oh, s: os, l: ol };
    }
    case 'okhsl': {
      const h = parseFloat(components[0]);
      const s = parseNumberOrPercent(components[1], 1);
      const l = parseNumberOrPercent(components[2], 1);
      return { h, s, l };
    }
    case 'okhst': {
      const h = parseFloat(components[0]);
      const s = parseNumberOrPercent(components[1], 1);
      const t = parseNumberOrPercent(components[2], 1);
      return okhstToOkhsl({ h, s, t });
    }
    case 'oklch': {
      const L = parseNumberOrPercent(components[0], 1);
      // Per CSS Color 4: chroma percent maps `100% → 0.4`.
      const C = parseNumberOrPercent(components[1], 0.4);
      const hDeg = parseFloat(components[2]);
      const hRad = (hDeg * Math.PI) / 180;
      const a = C * Math.cos(hRad);
      const b = C * Math.sin(hRad);
      const [h, s, l] = oklabToOkhsl([L, a, b]);
      return { h, s, l };
    }
  }
  throw new Error(`glaze: unsupported color function "${fn}".`);
}

// ============================================================================
// Input validation
// ============================================================================

/**
 * Validate a user-supplied `OkhslColor`. Catches the common 0-100 vs 0-1
 * confusion (the structured form uses 0-100, OKHSL objects use 0-1).
 */
export function validateOkhslColor(value: OkhslColor): void {
  const { h, s, l } = value;
  if (!Number.isFinite(h) || !Number.isFinite(s) || !Number.isFinite(l)) {
    throw new Error('glaze.color: OkhslColor h/s/l must be finite numbers.');
  }
  if (s > 1.5 || l > 1.5) {
    throw new Error(
      'glaze.color: OkhslColor s/l must be in 0–1 range. Did you mean the structured form { hue, saturation, tone } (which uses 0–100)?',
    );
  }
}

/** Validate a user-supplied `{ r, g, b }` object in 0–255. */
export function validateRgbColor(value: RgbColor): void {
  for (const key of ['r', 'g', 'b'] as const) {
    const n = value[key];
    if (!Number.isFinite(n) || n < 0 || n > 255) {
      throw new Error(
        `glaze.color: RgbColor ${key} must be a finite number in 0–255 (got ${n}).`,
      );
    }
  }
}

/** Validate a user-supplied `{ l, c, h }` OKLCh object. */
export function validateOklchColor(value: OklchColor): void {
  const { l, c, h } = value;
  if (!Number.isFinite(l) || !Number.isFinite(c) || !Number.isFinite(h)) {
    throw new Error('glaze.color: OklchColor l/c/h must be finite numbers.');
  }
  if (l > 1.5 || c > 1.5) {
    throw new Error(
      'glaze.color: OklchColor l/c must be in 0–1 range (matching oklch() strings).',
    );
  }
}

export function oklchComponentsToOkhsl(
  l: number,
  c: number,
  hDeg: number,
): OkhslColor {
  const hRad = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);
  const [h, s, outL] = oklabToOkhsl([l, a, b]);
  return { h, s, l: outL };
}

export function isRgbColorObject(value: object): value is RgbColor {
  return 'r' in value && 'g' in value && 'b' in value;
}

export function isOklchColorObject(value: object): value is OklchColor {
  return 'c' in value && 'l' in value && 'h' in value;
}

export function isOkhstColorObject(value: object): value is OkhstColor {
  return 't' in value && 'h' in value && 's' in value;
}

/** Validate a user-supplied `{ h, s, t }` OKHST object (s/t in 0–1). */
export function validateOkhstColor(value: OkhstColor): void {
  const { h, s, t } = value;
  if (!Number.isFinite(h) || !Number.isFinite(s) || !Number.isFinite(t)) {
    throw new Error('glaze.color: OkhstColor h/s/t must be finite numbers.');
  }
  if (s > 1.5 || t > 1.5) {
    throw new Error(
      'glaze.color: OkhstColor s/t must be in 0–1 range. Did you mean the structured form { hue, saturation, tone } (which uses 0–100)?',
    );
  }
}

/**
 * Extract an OKHSL color from any `GlazeColorValue` form. Also used by
 * `glaze.shadow()` so all shadow inputs (hex, color functions, OKHSL,
 * literal objects) go through one parser.
 */
export function extractOkhslFromValue(value: GlazeColorValue): OkhslColor {
  if (typeof value === 'string') return parseColorString(value);
  if (Array.isArray(value)) {
    throw new Error(
      'glaze.color: RGB tuple [r, g, b] is no longer supported — use { r, g, b } instead.',
    );
  }
  if (isRgbColorObject(value)) {
    validateRgbColor(value);
    const [h, s, l] = srgbToOkhsl([
      value.r / 255,
      value.g / 255,
      value.b / 255,
    ]);
    return { h, s, l };
  }
  if (isOklchColorObject(value)) {
    validateOklchColor(value);
    return oklchComponentsToOkhsl(value.l, value.c, value.h);
  }
  if (isOkhstColorObject(value)) {
    validateOkhstColor(value);
    return okhstToOkhsl(value);
  }
  validateOkhslColor(value);
  return value;
}
