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

    if (def.l !== undefined && def.base !== undefined) {
      console.warn(
        `glaze: color "${name}" has both "l" and "base". "l" takes precedence.`,
      );
    }

    if (def.base && !names.has(def.base)) {
      throw new Error(
        `glaze: color "${name}" references non-existent base "${def.base}".`,
      );
    }

    if (def.l === undefined && def.base === undefined) {
      throw new Error(
        `glaze: color "${name}" must have either "l" (root) or "base" + "contrast" (dependent).`,
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
    if (def.base && def.l === undefined) {
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
    if (def.base && def.l === undefined) {
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
// Contrast sign resolution
// ============================================================================

/**
 * Resolve the effective lightness from a contrast delta.
 */
function resolveContrastLightness(
  baseLightness: number,
  contrast: number,
): number {
  if (contrast < 0) {
    return clamp(baseLightness + contrast, 0, 100);
  }

  const candidate = baseLightness + contrast;
  if (candidate > 100) {
    return clamp(baseLightness - contrast, 0, 100);
  }
  return clamp(candidate, 0, 100);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
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
): { lightL: number; sat: number } {
  const rawL = def.l!;
  const lightL = clamp(
    isHighContrast ? pairHC(rawL) : pairNormal(rawL),
    0,
    100,
  );
  const sat = clamp(def.sat ?? 1, 0, 1);
  return { lightL, sat };
}

function resolveDependentColor(
  name: string,
  def: ColorDef,
  ctx: ResolveContext,
  isHighContrast: boolean,
  isDark: boolean,
): { l: number; sat: number } {
  const baseName = def.base!;
  const baseResolved = ctx.resolved.get(baseName);
  if (!baseResolved) {
    throw new Error(
      `glaze: base "${baseName}" not yet resolved for "${name}".`,
    );
  }

  const mode = def.mode ?? 'auto';
  const sat = clamp(def.sat ?? 1, 0, 1);

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

  const rawContrast = def.contrast ?? 0;
  let contrast = isHighContrast ? pairHC(rawContrast) : pairNormal(rawContrast);

  if (isDark && mode === 'auto') {
    contrast = -contrast;
  }

  const preferredL = resolveContrastLightness(baseL, contrast);

  const rawEnsureContrast = def.ensureContrast;
  if (rawEnsureContrast !== undefined) {
    const minCr = isHighContrast
      ? pairHC(rawEnsureContrast)
      : pairNormal(rawEnsureContrast);

    const effectiveSat = isDark
      ? mapSaturationDark((sat * ctx.saturation) / 100, mode)
      : (sat * ctx.saturation) / 100;

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
      hue: ctx.hue,
      saturation: effectiveSat,
      preferredLightness: preferredL / 100,
      baseLinearRgb,
      ensureContrast: minCr,
    });

    return { l: result.lightness * 100, sat };
  }

  return { l: clamp(preferredL, 0, 100), sat };
}

function resolveColorForScheme(
  name: string,
  def: ColorDef,
  ctx: ResolveContext,
  isDark: boolean,
  isHighContrast: boolean,
): ResolvedColorVariant {
  const mode = def.mode ?? 'auto';
  const isRoot = def.l !== undefined;

  let lightL: number;
  let sat: number;

  if (isRoot) {
    const root = resolveRootColor(name, def, ctx, isHighContrast);
    lightL = root.lightL;
    sat = root.sat;
  } else {
    const dep = resolveDependentColor(name, def, ctx, isHighContrast, isDark);
    lightL = dep.l;
    sat = dep.sat;
  }

  let finalL: number;
  let finalSat: number;

  if (isDark && isRoot) {
    finalL = mapLightnessDark(lightL, mode);
    finalSat = mapSaturationDark((sat * ctx.saturation) / 100, mode);
  } else if (isDark && !isRoot) {
    finalL = lightL;
    finalSat = mapSaturationDark((sat * ctx.saturation) / 100, mode);
  } else {
    finalL = lightL;
    finalSat = (sat * ctx.saturation) / 100;
  }

  return {
    h: ctx.hue,
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

    tokens(
      options?: GlazeTokenOptions,
    ): Record<string, Record<string, string>> {
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
  } as GlazeTheme;

  return theme;
}

// ============================================================================
// Palette
// ============================================================================

type PaletteInput = Record<string, GlazeTheme>;

function createPalette(themes: PaletteInput) {
  return {
    tokens(
      options?: GlazeTokenOptions,
    ): Record<string, Record<string, string>> {
      const states = {
        dark: options?.states?.dark ?? globalConfig.states.dark,
        highContrast:
          options?.states?.highContrast ?? globalConfig.states.highContrast,
      };
      const modes = resolveModes(options?.modes);

      const allTokens: Record<string, Record<string, string>> = {};

      for (const [themeName, theme] of Object.entries(themes)) {
        const resolved = theme.resolve();

        let prefix = '';
        if (options?.prefix === true) {
          prefix = `${themeName}-`;
        } else if (
          typeof options?.prefix === 'object' &&
          options.prefix !== null
        ) {
          prefix = options.prefix[themeName] ?? `${themeName}-`;
        }

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
  };
}

// ============================================================================
// Standalone color token
// ============================================================================

function createColorToken(input: GlazeColorInput): GlazeColorToken {
  const colorDef: ColorDef = {
    l: input.l,
    sat: input.sat,
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
