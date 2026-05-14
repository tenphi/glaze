/**
 * Theme factory.
 *
 * Wraps a hue/saturation seed and a mutable `ColorMap`, and exposes
 * `tokens()` / `tasty()` / `json()` / `css()` / `resolve()` / `export()`
 * / `extend()`. Caches the last resolve result so successive exports
 * with the same defs and config don't re-run the four-pass resolver.
 */

import { getConfig, getConfigVersion } from './config';
import {
  buildCssMap,
  buildFlatTokenMap,
  buildJsonMap,
  buildTokenMap,
  resolveModes,
} from './formatters';
import { resolveAllColors } from './resolver';
import type {
  ColorDef,
  ColorMap,
  GlazeCssOptions,
  GlazeCssResult,
  GlazeExtendOptions,
  GlazeJsonOptions,
  GlazeTheme,
  GlazeThemeExport,
  GlazeTokenOptions,
  ResolvedColor,
} from './types';

export function createTheme(
  hue: number,
  saturation: number,
  initialColors?: ColorMap,
): GlazeTheme {
  let colorDefs: ColorMap = initialColors ? { ...initialColors } : {};

  let cache: {
    map: Map<string, ResolvedColor>;
    version: number;
  } | null = null;

  function resolveCached(): Map<string, ResolvedColor> {
    const version = getConfigVersion();
    if (cache && cache.version === version) return cache.map;
    const map = resolveAllColors(hue, saturation, colorDefs);
    cache = { map, version };
    return map;
  }

  function invalidate(): void {
    cache = null;
  }

  const theme: GlazeTheme = {
    get hue() {
      return hue;
    },
    get saturation() {
      return saturation;
    },

    colors(defs: ColorMap): void {
      colorDefs = { ...colorDefs, ...defs };
      invalidate();
    },

    color(name: string, def?: ColorDef): ColorDef | undefined | void {
      if (def === undefined) {
        return colorDefs[name];
      }
      colorDefs[name] = def;
      invalidate();
    },

    remove(names: string | string[]): void {
      const list = Array.isArray(names) ? names : [names];
      for (const name of list) {
        delete colorDefs[name];
      }
      invalidate();
    },

    has(name: string): boolean {
      return name in colorDefs;
    },

    list(): string[] {
      return Object.keys(colorDefs);
    },

    reset(): void {
      colorDefs = {};
      invalidate();
    },

    export(): GlazeThemeExport {
      return {
        hue,
        saturation,
        colors: { ...colorDefs },
      };
    },

    extend(options: GlazeExtendOptions): GlazeTheme {
      const newHue = options.hue ?? hue;
      const newSat = options.saturation ?? saturation;

      const inheritedColors: ColorMap = {};
      for (const [name, def] of Object.entries(colorDefs)) {
        if (def.inherit !== false) {
          inheritedColors[name] = def;
        }
      }

      const mergedColors = options.colors
        ? { ...inheritedColors, ...options.colors }
        : { ...inheritedColors };

      return createTheme(newHue, newSat, mergedColors);
    },

    resolve(): Map<string, ResolvedColor> {
      // Defensive shallow clone: the cache holds the canonical Map for
      // internal exporters; callers that mutate the returned Map must
      // not corrupt subsequent cached reads.
      return new Map(resolveCached());
    },

    tokens(options?: GlazeJsonOptions): Record<string, Record<string, string>> {
      const modes = resolveModes(options?.modes);
      return buildFlatTokenMap(resolveCached(), '', modes, options?.format);
    },

    tasty(options?: GlazeTokenOptions): Record<string, Record<string, string>> {
      const cfg = getConfig();
      const states = {
        dark: options?.states?.dark ?? cfg.states.dark,
        highContrast: options?.states?.highContrast ?? cfg.states.highContrast,
      };
      const modes = resolveModes(options?.modes);
      return buildTokenMap(resolveCached(), '', states, modes, options?.format);
    },

    json(options?: GlazeJsonOptions): Record<string, Record<string, string>> {
      const modes = resolveModes(options?.modes);
      return buildJsonMap(resolveCached(), modes, options?.format);
    },

    css(options?: GlazeCssOptions): GlazeCssResult {
      return buildCssMap(
        resolveCached(),
        '',
        options?.suffix ?? '-color',
        options?.format ?? 'rgb',
      );
    },
  } as GlazeTheme;

  return theme;
}
