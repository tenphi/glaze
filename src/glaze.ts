/**
 * Glaze — OKHSL-based color theme generator.
 *
 * Generates robust light, dark, and high-contrast colors from a hue/saturation
 * seed, preserving contrast for UI pairs via explicit dependencies.
 */

import {
  okhslToLinearSrgb,
  formatOkhsl,
  formatRgb,
  formatHsl,
  formatOklch,
  srgbToOkhsl,
  parseHex,
} from './okhsl-color-math';
import { findLightnessForContrast } from './contrast-solver';
import type {
  HCPair,
  AdaptationMode,
  RelativeValue,
  ColorDef,
  ColorMap,
  ResolvedColor,
  ResolvedColorVariant,
  GlazeColorFormat,
  GlazeConfig,
  GlazeConfigResolved,
  GlazeOutputModes,
  GlazeTheme,
  GlazeThemeExport,
  GlazeExtendOptions,
  GlazeTokenOptions,
  GlazeJsonOptions,
  GlazeCssOptions,
  GlazeCssResult,
  GlazeColorInput,
  GlazeColorToken,
} from './types';

// ============================================================================
// Global configuration
// ============================================================================

let globalConfig: GlazeConfigResolved = {
  darkLightness: [10, 90],
  darkDesaturation: 0.1,
  states: {
    dark: '@dark',
    highContrast: '@high-contrast',
  },
  modes: {
    dark: true,
    highContrast: false,
  },
};

// ============================================================================
// HCPair helpers
// ============================================================================

function pairNormal<T>(p: HCPair<T>): T {
  return Array.isArray(p) ? p[0] : p;
}

function pairHC<T>(p: HCPair<T>): T {
  return Array.isArray(p) ? p[1] : p;
}

// ============================================================================
// Validation
// ============================================================================

function validateColorDefs(defs: ColorMap): void {
  const names = new Set(Object.keys(defs));

  for (const [name, def] of Object.entries(defs)) {
    if (def.contrast !== undefined && !def.base) {
      throw new Error(`glaze: color "${name}" has "contrast" without "base".`);
    }

    // Relative lightness requires base
    if (
      def.lightness !== undefined &&
      !isAbsoluteLightness(def.lightness) &&
      !def.base
    ) {
      throw new Error(
        `glaze: color "${name}" has relative "lightness" without "base".`,
      );
    }

    if (isAbsoluteLightness(def.lightness) && def.base !== undefined) {
      console.warn(
        `glaze: color "${name}" has absolute "lightness" and "base". Absolute lightness takes precedence.`,
      );
    }

    if (def.base && !names.has(def.base)) {
      throw new Error(
        `glaze: color "${name}" references non-existent base "${def.base}".`,
      );
    }

    if (!isAbsoluteLightness(def.lightness) && def.base === undefined) {
      throw new Error(
        `glaze: color "${name}" must have either absolute "lightness" (root) or "base" (dependent).`,
      );
    }
  }

  // Check for circular references
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(name: string): void {
    if (inStack.has(name)) {
      throw new Error(
        `glaze: circular base reference detected involving "${name}".`,
      );
    }
    if (visited.has(name)) return;

    inStack.add(name);
    const def = defs[name];
    if (def.base && !isAbsoluteLightness(def.lightness)) {
      dfs(def.base);
    }
    inStack.delete(name);
    visited.add(name);
  }

  for (const name of names) {
    dfs(name);
  }
}

// ============================================================================
// Topological sort
// ============================================================================

function topoSort(defs: ColorMap): string[] {
  const result: string[] = [];
  const visited = new Set<string>();

  function visit(name: string): void {
    if (visited.has(name)) return;
    visited.add(name);

    const def = defs[name];
    if (def.base && !isAbsoluteLightness(def.lightness)) {
      visit(def.base);
    }

    result.push(name);
  }

  for (const name of Object.keys(defs)) {
    visit(name);
  }

  return result;
}

// ============================================================================
// Dark scheme mapping
// ============================================================================

function mapLightnessDark(l: number, mode: AdaptationMode): number {
  if (mode === 'static') return l;

  const [lo, hi] = globalConfig.darkLightness;

  if (mode === 'fixed') {
    return (l * (hi - lo)) / 100 + lo;
  }

  // auto — inverted
  return ((100 - l) * (hi - lo)) / 100 + lo;
}

function mapSaturationDark(s: number, mode: AdaptationMode): number {
  if (mode === 'static') return s;
  return s * (1 - globalConfig.darkDesaturation);
}

// ============================================================================
// Helpers
// ============================================================================

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Parse a value that can be absolute (number) or relative (signed string).
 * Returns the numeric value and whether it's relative.
 */
function parseRelativeOrAbsolute(value: number | RelativeValue): {
  value: number;
  relative: boolean;
} {
  if (typeof value === 'number') {
    return { value, relative: false };
  }
  return { value: parseFloat(value), relative: true };
}

/**
 * Compute the effective hue for a color, given the theme seed hue
 * and an optional per-color hue override.
 */
function resolveEffectiveHue(
  seedHue: number,
  defHue: number | RelativeValue | undefined,
): number {
  if (defHue === undefined) return seedHue;
  const parsed = parseRelativeOrAbsolute(defHue);
  if (parsed.relative) {
    return (((seedHue + parsed.value) % 360) + 360) % 360;
  }
  return ((parsed.value % 360) + 360) % 360;
}

/**
 * Check whether a lightness value represents an absolute root definition
 * (i.e. a number, not a relative string).
 */
function isAbsoluteLightness(
  lightness: HCPair<number | RelativeValue> | undefined,
): boolean {
  if (lightness === undefined) return false;
  const normal = Array.isArray(lightness) ? lightness[0] : lightness;
  return typeof normal === 'number';
}

// ============================================================================
// Color resolution engine
// ============================================================================

interface ResolveContext {
  hue: number;
  saturation: number;
  defs: ColorMap;
  resolved: Map<string, ResolvedColor>;
}

function resolveRootColor(
  _name: string,
  def: ColorDef,
  _ctx: ResolveContext,
  isHighContrast: boolean,
): { lightL: number; satFactor: number } {
  const rawL = def.lightness!;
  const rawValue = isHighContrast ? pairHC(rawL) : pairNormal(rawL);
  const parsed = parseRelativeOrAbsolute(rawValue);
  const lightL = clamp(parsed.value, 0, 100);
  const satFactor = clamp(def.saturation ?? 1, 0, 1);
  return { lightL, satFactor };
}

function resolveDependentColor(
  name: string,
  def: ColorDef,
  ctx: ResolveContext,
  isHighContrast: boolean,
  isDark: boolean,
  effectiveHue: number,
): { l: number; satFactor: number } {
  const baseName = def.base!;
  const baseResolved = ctx.resolved.get(baseName);
  if (!baseResolved) {
    throw new Error(
      `glaze: base "${baseName}" not yet resolved for "${name}".`,
    );
  }

  const mode = def.mode ?? 'auto';
  const satFactor = clamp(def.saturation ?? 1, 0, 1);

  let baseL: number;
  if (isDark && isHighContrast) {
    baseL = baseResolved.darkContrast.l * 100;
  } else if (isDark) {
    baseL = baseResolved.dark.l * 100;
  } else if (isHighContrast) {
    baseL = baseResolved.lightContrast.l * 100;
  } else {
    baseL = baseResolved.light.l * 100;
  }

  // Resolve preferred lightness from the lightness prop
  let preferredL: number;
  const rawLightness = def.lightness;

  if (rawLightness === undefined) {
    // No lightness specified — inherit base lightness (delta 0)
    preferredL = baseL;
  } else {
    const rawValue = isHighContrast
      ? pairHC(rawLightness)
      : pairNormal(rawLightness);
    const parsed = parseRelativeOrAbsolute(rawValue);

    if (parsed.relative) {
      // Relative: signed delta from base
      let delta = parsed.value;
      if (isDark && mode === 'auto') {
        delta = -delta;
      }
      preferredL = clamp(baseL + delta, 0, 100);
    } else {
      // Absolute: dark-map independently when isDark
      if (isDark) {
        preferredL = mapLightnessDark(parsed.value, mode);
      } else {
        preferredL = clamp(parsed.value, 0, 100);
      }
    }
  }

  // Apply WCAG contrast solver if contrast floor is specified
  const rawContrast = def.contrast;
  if (rawContrast !== undefined) {
    const minCr = isHighContrast
      ? pairHC(rawContrast)
      : pairNormal(rawContrast);

    const effectiveSat = isDark
      ? mapSaturationDark((satFactor * ctx.saturation) / 100, mode)
      : (satFactor * ctx.saturation) / 100;

    let baseH: number;
    let baseS: number;
    let baseLNorm: number;
    if (isDark && isHighContrast) {
      baseH = baseResolved.darkContrast.h;
      baseS = baseResolved.darkContrast.s;
      baseLNorm = baseResolved.darkContrast.l;
    } else if (isDark) {
      baseH = baseResolved.dark.h;
      baseS = baseResolved.dark.s;
      baseLNorm = baseResolved.dark.l;
    } else if (isHighContrast) {
      baseH = baseResolved.lightContrast.h;
      baseS = baseResolved.lightContrast.s;
      baseLNorm = baseResolved.lightContrast.l;
    } else {
      baseH = baseResolved.light.h;
      baseS = baseResolved.light.s;
      baseLNorm = baseResolved.light.l;
    }

    const baseLinearRgb = okhslToLinearSrgb(baseH, baseS, baseLNorm);

    const result = findLightnessForContrast({
      hue: effectiveHue,
      saturation: effectiveSat,
      preferredLightness: preferredL / 100,
      baseLinearRgb,
      contrast: minCr,
    });

    return { l: result.lightness * 100, satFactor };
  }

  return { l: clamp(preferredL, 0, 100), satFactor };
}

function resolveColorForScheme(
  name: string,
  def: ColorDef,
  ctx: ResolveContext,
  isDark: boolean,
  isHighContrast: boolean,
): ResolvedColorVariant {
  const mode = def.mode ?? 'auto';
  const isRoot = isAbsoluteLightness(def.lightness) && !def.base;
  const effectiveHue = resolveEffectiveHue(ctx.hue, def.hue);

  let lightL: number;
  let satFactor: number;

  if (isRoot) {
    const root = resolveRootColor(name, def, ctx, isHighContrast);
    lightL = root.lightL;
    satFactor = root.satFactor;
  } else {
    const dep = resolveDependentColor(
      name,
      def,
      ctx,
      isHighContrast,
      isDark,
      effectiveHue,
    );
    lightL = dep.l;
    satFactor = dep.satFactor;
  }

  let finalL: number;
  let finalSat: number;

  if (isDark && isRoot) {
    finalL = mapLightnessDark(lightL, mode);
    finalSat = mapSaturationDark((satFactor * ctx.saturation) / 100, mode);
  } else if (isDark && !isRoot) {
    finalL = lightL;
    finalSat = mapSaturationDark((satFactor * ctx.saturation) / 100, mode);
  } else {
    finalL = lightL;
    finalSat = (satFactor * ctx.saturation) / 100;
  }

  return {
    h: effectiveHue,
    s: clamp(finalSat, 0, 1),
    l: clamp(finalL / 100, 0, 1),
  };
}

function resolveAllColors(
  hue: number,
  saturation: number,
  defs: ColorMap,
): Map<string, ResolvedColor> {
  validateColorDefs(defs);
  const order = topoSort(defs);

  const ctx: ResolveContext = {
    hue,
    saturation,
    defs,
    resolved: new Map(),
  };

  // Pass 1: Light normal
  const lightMap = new Map<string, ResolvedColorVariant>();
  for (const name of order) {
    const variant = resolveColorForScheme(name, defs[name], ctx, false, false);
    lightMap.set(name, variant);
    ctx.resolved.set(name, {
      name,
      light: variant,
      dark: variant,
      lightContrast: variant,
      darkContrast: variant,
      mode: defs[name].mode ?? 'auto',
    });
  }

  // Pass 2: Light high-contrast
  const lightHCMap = new Map<string, ResolvedColorVariant>();
  for (const name of order) {
    ctx.resolved.set(name, {
      ...ctx.resolved.get(name)!,
      lightContrast: lightMap.get(name)!,
    });
  }
  for (const name of order) {
    const variant = resolveColorForScheme(name, defs[name], ctx, false, true);
    lightHCMap.set(name, variant);
    ctx.resolved.set(name, {
      ...ctx.resolved.get(name)!,
      lightContrast: variant,
    });
  }

  // Pass 3: Dark normal
  const darkMap = new Map<string, ResolvedColorVariant>();
  for (const name of order) {
    ctx.resolved.set(name, {
      name,
      light: lightMap.get(name)!,
      dark: lightMap.get(name)!,
      lightContrast: lightHCMap.get(name)!,
      darkContrast: lightHCMap.get(name)!,
      mode: defs[name].mode ?? 'auto',
    });
  }
  for (const name of order) {
    const variant = resolveColorForScheme(name, defs[name], ctx, true, false);
    darkMap.set(name, variant);
    ctx.resolved.set(name, {
      ...ctx.resolved.get(name)!,
      dark: variant,
    });
  }

  // Pass 4: Dark high-contrast
  const darkHCMap = new Map<string, ResolvedColorVariant>();
  for (const name of order) {
    ctx.resolved.set(name, {
      ...ctx.resolved.get(name)!,
      darkContrast: darkMap.get(name)!,
    });
  }
  for (const name of order) {
    const variant = resolveColorForScheme(name, defs[name], ctx, true, true);
    darkHCMap.set(name, variant);
    ctx.resolved.set(name, {
      ...ctx.resolved.get(name)!,
      darkContrast: variant,
    });
  }

  // Build final result
  const result = new Map<string, ResolvedColor>();
  for (const name of order) {
    result.set(name, {
      name,
      light: lightMap.get(name)!,
      dark: darkMap.get(name)!,
      lightContrast: lightHCMap.get(name)!,
      darkContrast: darkHCMap.get(name)!,
      mode: defs[name].mode ?? 'auto',
    });
  }

  return result;
}

// ============================================================================
// Token formatting
// ============================================================================

const formatters: Record<
  GlazeColorFormat,
  (h: number, s: number, l: number) => string
> = {
  okhsl: formatOkhsl,
  rgb: formatRgb,
  hsl: formatHsl,
  oklch: formatOklch,
};

function formatVariant(
  v: ResolvedColorVariant,
  format: GlazeColorFormat = 'okhsl',
): string {
  return formatters[format](v.h, v.s * 100, v.l * 100);
}

function resolveModes(override?: GlazeOutputModes): Required<GlazeOutputModes> {
  return {
    dark: override?.dark ?? globalConfig.modes.dark,
    highContrast: override?.highContrast ?? globalConfig.modes.highContrast,
  };
}

function buildTokenMap(
  resolved: Map<string, ResolvedColor>,
  prefix: string,
  states: { dark: string; highContrast: string },
  modes: Required<GlazeOutputModes>,
  format: GlazeColorFormat = 'okhsl',
): Record<string, Record<string, string>> {
  const tokens: Record<string, Record<string, string>> = {};

  for (const [name, color] of resolved) {
    const key = `#${prefix}${name}`;
    const entry: Record<string, string> = {
      '': formatVariant(color.light, format),
    };

    if (modes.dark) {
      entry[states.dark] = formatVariant(color.dark, format);
    }
    if (modes.highContrast) {
      entry[states.highContrast] = formatVariant(color.lightContrast, format);
    }
    if (modes.dark && modes.highContrast) {
      entry[`${states.dark} & ${states.highContrast}`] = formatVariant(
        color.darkContrast,
        format,
      );
    }

    tokens[key] = entry;
  }

  return tokens;
}

function buildFlatTokenMap(
  resolved: Map<string, ResolvedColor>,
  prefix: string,
  modes: Required<GlazeOutputModes>,
  format: GlazeColorFormat = 'okhsl',
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

    result.light[key] = formatVariant(color.light, format);

    if (modes.dark) {
      result.dark[key] = formatVariant(color.dark, format);
    }
    if (modes.highContrast) {
      result.lightContrast[key] = formatVariant(color.lightContrast, format);
    }
    if (modes.dark && modes.highContrast) {
      result.darkContrast[key] = formatVariant(color.darkContrast, format);
    }
  }

  return result;
}

function buildJsonMap(
  resolved: Map<string, ResolvedColor>,
  modes: Required<GlazeOutputModes>,
  format: GlazeColorFormat = 'okhsl',
): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};

  for (const [name, color] of resolved) {
    const entry: Record<string, string> = {
      light: formatVariant(color.light, format),
    };

    if (modes.dark) {
      entry.dark = formatVariant(color.dark, format);
    }
    if (modes.highContrast) {
      entry.lightContrast = formatVariant(color.lightContrast, format);
    }
    if (modes.dark && modes.highContrast) {
      entry.darkContrast = formatVariant(color.darkContrast, format);
    }

    result[name] = entry;
  }

  return result;
}

function buildCssMap(
  resolved: Map<string, ResolvedColor>,
  prefix: string,
  suffix: string,
  format: GlazeColorFormat,
): GlazeCssResult {
  const lines: Record<keyof GlazeCssResult, string[]> = {
    light: [],
    dark: [],
    lightContrast: [],
    darkContrast: [],
  };

  for (const [name, color] of resolved) {
    const prop = `--${prefix}${name}${suffix}`;
    lines.light.push(`${prop}: ${formatVariant(color.light, format)};`);
    lines.dark.push(`${prop}: ${formatVariant(color.dark, format)};`);
    lines.lightContrast.push(
      `${prop}: ${formatVariant(color.lightContrast, format)};`,
    );
    lines.darkContrast.push(
      `${prop}: ${formatVariant(color.darkContrast, format)};`,
    );
  }

  return {
    light: lines.light.join('\n'),
    dark: lines.dark.join('\n'),
    lightContrast: lines.lightContrast.join('\n'),
    darkContrast: lines.darkContrast.join('\n'),
  };
}

// ============================================================================
// Theme implementation
// ============================================================================

function createTheme(
  hue: number,
  saturation: number,
  initialColors?: ColorMap,
): GlazeTheme {
  let colorDefs: ColorMap = initialColors ? { ...initialColors } : {};

  const theme: GlazeTheme = {
    get hue() {
      return hue;
    },
    get saturation() {
      return saturation;
    },

    colors(defs: ColorMap): void {
      colorDefs = { ...colorDefs, ...defs };
    },

    color(name: string, def?: ColorDef): ColorDef | undefined | void {
      if (def === undefined) {
        return colorDefs[name];
      }
      colorDefs[name] = def;
    },

    remove(names: string | string[]): void {
      const list = Array.isArray(names) ? names : [names];
      for (const name of list) {
        delete colorDefs[name];
      }
    },

    has(name: string): boolean {
      return name in colorDefs;
    },

    list(): string[] {
      return Object.keys(colorDefs);
    },

    reset(): void {
      colorDefs = {};
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
      const mergedColors = options.colors
        ? { ...colorDefs, ...options.colors }
        : { ...colorDefs };

      return createTheme(newHue, newSat, mergedColors);
    },

    resolve(): Map<string, ResolvedColor> {
      return resolveAllColors(hue, saturation, colorDefs);
    },

    tokens(options?: GlazeJsonOptions): Record<string, Record<string, string>> {
      const resolved = resolveAllColors(hue, saturation, colorDefs);
      const modes = resolveModes(options?.modes);
      return buildFlatTokenMap(resolved, '', modes, options?.format);
    },

    tasty(options?: GlazeTokenOptions): Record<string, Record<string, string>> {
      const resolved = resolveAllColors(hue, saturation, colorDefs);
      const states = {
        dark: options?.states?.dark ?? globalConfig.states.dark,
        highContrast:
          options?.states?.highContrast ?? globalConfig.states.highContrast,
      };
      const modes = resolveModes(options?.modes);
      return buildTokenMap(resolved, '', states, modes, options?.format);
    },

    json(options?: GlazeJsonOptions): Record<string, Record<string, string>> {
      const resolved = resolveAllColors(hue, saturation, colorDefs);
      const modes = resolveModes(options?.modes);
      return buildJsonMap(resolved, modes, options?.format);
    },

    css(options?: GlazeCssOptions): GlazeCssResult {
      const resolved = resolveAllColors(hue, saturation, colorDefs);
      return buildCssMap(
        resolved,
        '',
        options?.suffix ?? '-color',
        options?.format ?? 'rgb',
      );
    },
  } as GlazeTheme;

  return theme;
}

// ============================================================================
// Palette
// ============================================================================

type PaletteInput = Record<string, GlazeTheme>;

function resolvePrefix(
  options: { prefix?: boolean | Record<string, string> } | undefined,
  themeName: string,
): string {
  if (options?.prefix === true) {
    return `${themeName}-`;
  }
  if (typeof options?.prefix === 'object' && options.prefix !== null) {
    return options.prefix[themeName] ?? `${themeName}-`;
  }
  return '';
}

function createPalette(themes: PaletteInput) {
  return {
    tokens(
      options?: GlazeJsonOptions & {
        prefix?: boolean | Record<string, string>;
      },
    ): Record<string, Record<string, string>> {
      const modes = resolveModes(options?.modes);
      const allTokens: Record<string, Record<string, string>> = {};

      for (const [themeName, theme] of Object.entries(themes)) {
        const resolved = theme.resolve();
        const prefix = resolvePrefix(options, themeName);
        const tokens = buildFlatTokenMap(
          resolved,
          prefix,
          modes,
          options?.format,
        );

        for (const variant of Object.keys(tokens)) {
          if (!allTokens[variant]) {
            allTokens[variant] = {};
          }
          Object.assign(allTokens[variant], tokens[variant]);
        }
      }

      return allTokens;
    },

    tasty(options?: GlazeTokenOptions): Record<string, Record<string, string>> {
      const states = {
        dark: options?.states?.dark ?? globalConfig.states.dark,
        highContrast:
          options?.states?.highContrast ?? globalConfig.states.highContrast,
      };
      const modes = resolveModes(options?.modes);

      const allTokens: Record<string, Record<string, string>> = {};

      for (const [themeName, theme] of Object.entries(themes)) {
        const resolved = theme.resolve();
        const prefix = resolvePrefix(options, themeName);
        const tokens = buildTokenMap(
          resolved,
          prefix,
          states,
          modes,
          options?.format,
        );
        Object.assign(allTokens, tokens);
      }

      return allTokens;
    },

    json(
      options?: GlazeJsonOptions & {
        prefix?: boolean | Record<string, string>;
      },
    ): Record<string, Record<string, Record<string, string>>> {
      const modes = resolveModes(options?.modes);

      const result: Record<string, Record<string, Record<string, string>>> = {};

      for (const [themeName, theme] of Object.entries(themes)) {
        const resolved = theme.resolve();
        result[themeName] = buildJsonMap(resolved, modes, options?.format);
      }

      return result;
    },

    css(
      options?: GlazeCssOptions & {
        prefix?: boolean | Record<string, string>;
      },
    ): GlazeCssResult {
      const suffix = options?.suffix ?? '-color';
      const format = options?.format ?? 'rgb';

      const allLines: Record<keyof GlazeCssResult, string[]> = {
        light: [],
        dark: [],
        lightContrast: [],
        darkContrast: [],
      };

      for (const [themeName, theme] of Object.entries(themes)) {
        const resolved = theme.resolve();
        const prefix = resolvePrefix(options, themeName);

        const css = buildCssMap(resolved, prefix, suffix, format);

        for (const key of [
          'light',
          'dark',
          'lightContrast',
          'darkContrast',
        ] as const) {
          if (css[key]) {
            allLines[key].push(css[key]);
          }
        }
      }

      return {
        light: allLines.light.join('\n'),
        dark: allLines.dark.join('\n'),
        lightContrast: allLines.lightContrast.join('\n'),
        darkContrast: allLines.darkContrast.join('\n'),
      };
    },
  };
}

// ============================================================================
// Standalone color token
// ============================================================================

function createColorToken(input: GlazeColorInput): GlazeColorToken {
  const colorDef: ColorDef = {
    lightness: input.lightness,
    saturation: input.saturationFactor,
    mode: input.mode,
  };

  const defs: ColorMap = { __color__: colorDef };

  return {
    resolve(): ResolvedColor {
      const resolved = resolveAllColors(input.hue, input.saturation, defs);
      return resolved.get('__color__')!;
    },

    token(options?: GlazeTokenOptions): Record<string, string> {
      const resolved = resolveAllColors(input.hue, input.saturation, defs);
      const states = {
        dark: options?.states?.dark ?? globalConfig.states.dark,
        highContrast:
          options?.states?.highContrast ?? globalConfig.states.highContrast,
      };
      const modes = resolveModes(options?.modes);
      const tokenMap = buildTokenMap(
        resolved,
        '',
        states,
        modes,
        options?.format,
      );
      return tokenMap['#__color__'];
    },

    tasty(options?: GlazeTokenOptions): Record<string, string> {
      const resolved = resolveAllColors(input.hue, input.saturation, defs);
      const states = {
        dark: options?.states?.dark ?? globalConfig.states.dark,
        highContrast:
          options?.states?.highContrast ?? globalConfig.states.highContrast,
      };
      const modes = resolveModes(options?.modes);
      const tokenMap = buildTokenMap(
        resolved,
        '',
        states,
        modes,
        options?.format,
      );
      return tokenMap['#__color__'];
    },

    json(options?: GlazeJsonOptions): Record<string, string> {
      const resolved = resolveAllColors(input.hue, input.saturation, defs);
      const modes = resolveModes(options?.modes);
      const jsonMap = buildJsonMap(resolved, modes, options?.format);
      return jsonMap['__color__'];
    },
  };
}

// ============================================================================
// Public API: glaze()
// ============================================================================

/**
 * Create a single-hue glaze theme.
 *
 * @example
 * ```ts
 * const primary = glaze({ hue: 280, saturation: 80 });
 * // or shorthand:
 * const primary = glaze(280, 80);
 * ```
 */
export function glaze(
  hueOrOptions: number | { hue: number; saturation: number },
  saturation?: number,
): GlazeTheme {
  if (typeof hueOrOptions === 'number') {
    return createTheme(hueOrOptions, saturation ?? 100);
  }
  return createTheme(hueOrOptions.hue, hueOrOptions.saturation);
}

/**
 * Configure global glaze settings.
 */
glaze.configure = function configure(config: GlazeConfig): void {
  globalConfig = {
    darkLightness: config.darkLightness ?? globalConfig.darkLightness,
    darkDesaturation: config.darkDesaturation ?? globalConfig.darkDesaturation,
    states: {
      dark: config.states?.dark ?? globalConfig.states.dark,
      highContrast:
        config.states?.highContrast ?? globalConfig.states.highContrast,
    },
    modes: {
      dark: config.modes?.dark ?? globalConfig.modes.dark,
      highContrast:
        config.modes?.highContrast ?? globalConfig.modes.highContrast,
    },
  };
};

/**
 * Compose multiple themes into a palette.
 */
glaze.palette = function palette(themes: PaletteInput) {
  return createPalette(themes);
};

/**
 * Create a theme from a serialized export.
 */
glaze.from = function from(data: GlazeThemeExport): GlazeTheme {
  return createTheme(data.hue, data.saturation, data.colors);
};

/**
 * Create a standalone single-color token.
 */
glaze.color = function color(input: GlazeColorInput): GlazeColorToken {
  return createColorToken(input);
};

/**
 * Create a theme from a hex color string.
 * Extracts hue and saturation from the color.
 */
glaze.fromHex = function fromHex(hex: string): GlazeTheme {
  const rgb = parseHex(hex);
  if (!rgb) {
    throw new Error(`glaze: invalid hex color "${hex}".`);
  }
  const [h, s] = srgbToOkhsl(rgb);
  return createTheme(h, s * 100);
};

/**
 * Create a theme from RGB values (0–255).
 * Extracts hue and saturation from the color.
 */
glaze.fromRgb = function fromRgb(r: number, g: number, b: number): GlazeTheme {
  const [h, s] = srgbToOkhsl([r / 255, g / 255, b / 255]);
  return createTheme(h, s * 100);
};

/**
 * Get the current global configuration (for testing/debugging).
 */
glaze.getConfig = function getConfig(): GlazeConfigResolved {
  return { ...globalConfig };
};

/**
 * Reset global configuration to defaults.
 */
glaze.resetConfig = function resetConfig(): void {
  globalConfig = {
    darkLightness: [10, 90],
    darkDesaturation: 0.1,
    states: {
      dark: '@dark',
      highContrast: '@high-contrast',
    },
    modes: {
      dark: true,
      highContrast: false,
    },
  };
};
