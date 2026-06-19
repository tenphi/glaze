/**
 * Output formatting for resolved color maps.
 *
 * Owns the CSS-string formatter dispatch table (`okhsl` / `rgb` / `hsl` /
 * `oklch`) and the four token-map shapes Glaze emits:
 * - `buildTokenMap` — Tasty style-to-state bindings (`#name` keys, state aliases).
 * - `buildFlatTokenMap` — `{ light, dark, ... }` per-variant maps.
 * - `buildJsonMap` — `{ name: { light, dark, ... } }` per-color JSON.
 * - `buildCssMap` — CSS custom property declaration strings per variant.
 */

import {
  formatHsl,
  formatOkhsl,
  formatOklch,
  formatRgb,
} from './okhsl-color-math';
import { variantToOkhsl } from './okhst';
import { getConfig } from './config';
import type {
  GlazeColorFormat,
  GlazeCssResult,
  GlazeOutputModes,
  ResolvedColor,
  ResolvedColorVariant,
} from './types';

const formatters: Record<
  GlazeColorFormat,
  (h: number, s: number, l: number, pastel: boolean) => string
> = {
  okhsl: formatOkhsl,
  rgb: formatRgb,
  hsl: formatHsl,
  oklch: formatOklch,
};

function fmt(value: number, decimals: number): string {
  return parseFloat(value.toFixed(decimals)).toString();
}

export function formatVariant(
  v: ResolvedColorVariant,
  format: GlazeColorFormat = 'okhsl',
  pastel = false,
): string {
  // Variants store canonical tone; convert to OKHSL lightness at the edge.
  // Per-variant `pastel` (set by the resolver from def or config fallback)
  // wins over the format-time fallback, so output matches resolution.
  const effectivePastel = v.pastel ?? pastel;
  const { l } = variantToOkhsl(v);
  const base = formatters[format](v.h, v.s * 100, l * 100, effectivePastel);
  if (v.alpha >= 1) return base;
  const closing = base.lastIndexOf(')');
  return `${base.slice(0, closing)} / ${fmt(v.alpha, 4)})`;
}

export function resolveModes(
  override?: GlazeOutputModes,
): Required<GlazeOutputModes> {
  const cfg = getConfig();
  return {
    dark: override?.dark ?? cfg.modes.dark,
    highContrast: override?.highContrast ?? cfg.modes.highContrast,
  };
}

export function buildTokenMap(
  resolved: Map<string, ResolvedColor>,
  prefix: string,
  states: { dark: string; highContrast: string },
  modes: Required<GlazeOutputModes>,
  format: GlazeColorFormat = 'okhsl',
  pastel = false,
): Record<string, Record<string, string>> {
  const tokens: Record<string, Record<string, string>> = {};

  for (const [name, color] of resolved) {
    const key = `#${prefix}${name}`;
    const entry: Record<string, string> = {
      '': formatVariant(color.light, format, pastel),
    };

    if (modes.dark) {
      entry[states.dark] = formatVariant(color.dark, format, pastel);
    }
    if (modes.highContrast) {
      entry[states.highContrast] = formatVariant(
        color.lightContrast,
        format,
        pastel,
      );
    }
    if (modes.dark && modes.highContrast) {
      entry[`${states.dark} & ${states.highContrast}`] = formatVariant(
        color.darkContrast,
        format,
        pastel,
      );
    }

    tokens[key] = entry;
  }

  return tokens;
}

export function buildFlatTokenMap(
  resolved: Map<string, ResolvedColor>,
  prefix: string,
  modes: Required<GlazeOutputModes>,
  format: GlazeColorFormat = 'okhsl',
  pastel = false,
): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {
    light: {},
  };

  if (modes.dark) {
    result.dark = {};
  }
  if (modes.highContrast) {
    result.lightContrast = {};
  }
  if (modes.dark && modes.highContrast) {
    result.darkContrast = {};
  }

  for (const [name, color] of resolved) {
    const key = `${prefix}${name}`;

    result.light[key] = formatVariant(color.light, format, pastel);

    if (modes.dark) {
      result.dark[key] = formatVariant(color.dark, format, pastel);
    }
    if (modes.highContrast) {
      result.lightContrast[key] = formatVariant(
        color.lightContrast,
        format,
        pastel,
      );
    }
    if (modes.dark && modes.highContrast) {
      result.darkContrast[key] = formatVariant(
        color.darkContrast,
        format,
        pastel,
      );
    }
  }

  return result;
}

export function buildJsonMap(
  resolved: Map<string, ResolvedColor>,
  modes: Required<GlazeOutputModes>,
  format: GlazeColorFormat = 'okhsl',
  pastel = false,
): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};

  for (const [name, color] of resolved) {
    const entry: Record<string, string> = {
      light: formatVariant(color.light, format, pastel),
    };

    if (modes.dark) {
      entry.dark = formatVariant(color.dark, format, pastel);
    }
    if (modes.highContrast) {
      entry.lightContrast = formatVariant(color.lightContrast, format, pastel);
    }
    if (modes.dark && modes.highContrast) {
      entry.darkContrast = formatVariant(color.darkContrast, format, pastel);
    }

    result[name] = entry;
  }

  return result;
}

export function buildCssMap(
  resolved: Map<string, ResolvedColor>,
  prefix: string,
  suffix: string,
  format: GlazeColorFormat,
  pastel = false,
): GlazeCssResult {
  const lines: Record<keyof GlazeCssResult, string[]> = {
    light: [],
    dark: [],
    lightContrast: [],
    darkContrast: [],
  };

  for (const [name, color] of resolved) {
    const prop = `--${prefix}${name}${suffix}`;
    lines.light.push(`${prop}: ${formatVariant(color.light, format, pastel)};`);
    lines.dark.push(`${prop}: ${formatVariant(color.dark, format, pastel)};`);
    lines.lightContrast.push(
      `${prop}: ${formatVariant(color.lightContrast, format, pastel)};`,
    );
    lines.darkContrast.push(
      `${prop}: ${formatVariant(color.darkContrast, format, pastel)};`,
    );
  }

  return {
    light: lines.light.join('\n'),
    dark: lines.dark.join('\n'),
    lightContrast: lines.lightContrast.join('\n'),
    darkContrast: lines.darkContrast.join('\n'),
  };
}
