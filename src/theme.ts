/**
 * Theme factory.
 *
 * Wraps a hue/saturation seed, a mutable `ColorMap`, and an optional
 * per-theme `GlazeConfigOverride`. Exposes `tokens()` / `tasty()` /
 * `json()` / `css()` / `dtcg()` / `dtcgResolver()` / `tailwind()` / `resolve()` /
 * `export()` / `extend()`.
 *
 * The per-theme config override is **merged over the live global config at
 * resolve time** so the theme still reacts to later `configure()` calls
 * for fields it didn't override. The merged config is memoized by
 * `configVersion` to avoid rebuilding it on every export call.
 */

import type { ChannelCtx } from './channels';
import {
  buildEffectiveConfigOverride,
  getConfig,
  getConfigVersion,
  mergeConfig,
} from './config';
import { assertAllPastel, assertNativeFormat } from './format-guard';
import {
  buildCssMap,
  buildDtcgMap,
  buildDtcgResolver,
  buildFlatTokenMap,
  buildJsonMap,
  buildTailwindMap,
  buildTokenMap,
  resolveModes,
} from './formatters';
import { resolveAllColors } from './resolver';
import { GLAZE_EXPORT_VERSION } from './serialize';
import type {
  ColorDef,
  ColorMap,
  GlazeConfigOverride,
  GlazeConfigResolved,
  GlazeCssOptions,
  GlazeCssResult,
  GlazeDtcgOptions,
  GlazeDtcgResolverDocument,
  GlazeDtcgResolverOptions,
  GlazeDtcgResult,
  GlazeExtendOptions,
  GlazeJsonOptions,
  GlazeTailwindOptions,
  GlazeTheme,
  GlazeThemeExport,
  GlazeTokenOptions,
  ResolvedColor,
} from './types';

export function createTheme(
  hue: number,
  saturation: number,
  initialColors?: ColorMap,
  configOverride?: GlazeConfigOverride,
): GlazeTheme {
  let colorDefs: ColorMap = initialColors ? { ...initialColors } : {};

  let cache: {
    map: Map<string, ResolvedColor>;
    version: number;
    effectiveConfig: GlazeConfigResolved;
  } | null = null;

  function getEffectiveConfig(): GlazeConfigResolved {
    const version = getConfigVersion();
    if (cache && cache.version === version) return cache.effectiveConfig;
    return mergeConfig(getConfig(), configOverride);
  }

  function resolveCached(): Map<string, ResolvedColor> {
    const version = getConfigVersion();
    if (cache && cache.version === version) return cache.map;
    const effectiveConfig = mergeConfig(getConfig(), configOverride);
    const map = resolveAllColors(hue, saturation, colorDefs, effectiveConfig);
    cache = { map, version, effectiveConfig };
    return map;
  }

  function invalidate(): void {
    cache = null;
  }

  function channelCtxFor(
    options:
      | {
          splitHue?: boolean;
          name?: string;
          format?: GlazeCssOptions['format'];
          modes?: GlazeJsonOptions['modes'];
        }
      | undefined,
    formatDefault: 'rgb' | 'oklch' | 'okhsl',
    prefix: string,
  ): ChannelCtx | undefined {
    const format = options?.format ?? formatDefault;
    if (!options?.splitHue || format !== 'oklch') return undefined;
    const resolved = resolveCached();
    const modes = resolveModes(options?.modes);
    assertAllPastel(resolved, modes);
    return {
      seedHue: hue,
      baseName: options.name ?? 'theme',
      prefix,
      defs: colorDefs,
      mode: 'theme',
    };
  }

  const theme: GlazeTheme = {
    get hue() {
      return hue;
    },
    get saturation() {
      return saturation;
    },
    getConfig(): GlazeConfigResolved {
      return getEffectiveConfig();
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
        kind: 'theme',
        version: GLAZE_EXPORT_VERSION,
        hue,
        saturation,
        colors: structuredClone(colorDefs),
        config: structuredClone(buildEffectiveConfigOverride(configOverride)),
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

      // Child inherits the parent override then merges in the per-extend override.
      const mergedConfigOverride: GlazeConfigOverride | undefined =
        configOverride || options.config
          ? { ...(configOverride ?? {}), ...(options.config ?? {}) }
          : undefined;

      return createTheme(newHue, newSat, mergedColors, mergedConfigOverride);
    },

    resolve(): Map<string, ResolvedColor> {
      // Defensive shallow clone: the cache holds the canonical Map for
      // internal exporters; callers that mutate the returned Map must
      // not corrupt subsequent cached reads.
      return new Map(resolveCached());
    },

    tokens(options?: GlazeJsonOptions): Record<string, Record<string, string>> {
      const format = options?.format ?? 'oklch';
      assertNativeFormat(format, 'tokens');
      const modes = resolveModes(options?.modes);
      return buildFlatTokenMap(
        resolveCached(),
        '',
        modes,
        format,
        getEffectiveConfig().pastel,
      );
    },

    tasty(options?: GlazeTokenOptions): Record<string, Record<string, string>> {
      const cfg = getEffectiveConfig();
      const states = {
        dark: options?.states?.dark ?? cfg.states.dark,
        highContrast: options?.states?.highContrast ?? cfg.states.highContrast,
      };
      const modes = resolveModes(options?.modes);
      const format = options?.format ?? 'oklch';
      const channelCtx = channelCtxFor(options, 'oklch', '');
      return buildTokenMap(
        resolveCached(),
        '',
        states,
        modes,
        format,
        cfg.pastel,
        channelCtx,
      );
    },

    json(options?: GlazeJsonOptions): Record<string, Record<string, string>> {
      const format = options?.format ?? 'oklch';
      assertNativeFormat(format, 'json');
      const modes = resolveModes(options?.modes);
      return buildJsonMap(
        resolveCached(),
        modes,
        format,
        getEffectiveConfig().pastel,
      );
    },

    css(options?: GlazeCssOptions): GlazeCssResult {
      const format = options?.format ?? 'oklch';
      assertNativeFormat(format, 'css');
      const channelCtx = channelCtxFor(options, 'oklch', '');
      return buildCssMap(
        resolveCached(),
        '',
        options?.suffix ?? '-color',
        format,
        getEffectiveConfig().pastel,
        channelCtx,
      );
    },

    dtcg(options?: GlazeDtcgOptions): GlazeDtcgResult {
      const modes = resolveModes(options?.modes);
      return buildDtcgMap(
        resolveCached(),
        '',
        modes,
        options?.colorSpace ?? 'srgb',
        getEffectiveConfig().pastel,
      );
    },

    dtcgResolver(
      options?: GlazeDtcgResolverOptions,
    ): GlazeDtcgResolverDocument {
      const result = buildDtcgMap(
        resolveCached(),
        '',
        resolveModes(options?.modes),
        options?.colorSpace ?? 'srgb',
        getEffectiveConfig().pastel,
      );
      return buildDtcgResolver(result, options);
    },

    tailwind(options?: GlazeTailwindOptions): string {
      const format = options?.format ?? 'oklch';
      assertNativeFormat(format, 'tailwind');
      const modes = resolveModes(options?.modes);
      return buildTailwindMap(
        resolveCached(),
        '',
        options?.namespace ?? 'color-',
        modes,
        format,
        options?.darkSelector ?? '.dark',
        options?.highContrastSelector ?? '.high-contrast',
        getEffectiveConfig().pastel,
      );
    },
  } as GlazeTheme;

  return theme;
}
