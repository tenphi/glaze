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
 * `configVersion` to avoid rebuilding it on every export call. The override is
 * copied once when the theme is created and `getConfig()` hands out a deep copy
 * of the merged config, so mutating either object can't reach a resolve.
 *
 * Exports carry the HDR tier of glows (`variant.hdr`) only with `modes.hdr`
 * — `css()` reads its own `hdr` option, defaulting to the global mode — and
 * `tasty()` keys it with `states.hdr`; the shapes live in `formatters.ts`.
 *
 * `tasty()` / `css()` with `splitHue` run its guards before emitting: format
 * `'oklch'`, every color pastel, and no color whose own hue var would take the
 * theme var's name (`--{name}-hue`). `css()` also claims each color's value
 * property, so a `suffix` that lands one on a hue var (`'-hue'`, or `''` with a
 * color named `*-hue`) throws too.
 */

import {
  assertSplitHueFormat,
  claimHueVars,
  claimValueProps,
  type ChannelCtx,
  type HueVarLabels,
  type SplitHueOwners,
} from './channels';
import {
  copyConfigOverride,
  copyResolvedConfig,
  freezeConfigForExport,
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
  DEFAULT_TAILWIND_HDR_SELECTOR,
  resolveModes,
} from './formatters';
import { showValue } from './hc-pair';
import { resolveAllColors } from './resolver';
import { GLAZE_EXPORT_VERSION } from './serialize';
import type {
  ColorDef,
  ColorMap,
  GlazeConfigOverride,
  GlazeConfigResolved,
  GlazeCssOptions,
  GlazeColorFormat,
  GlazeCssResult,
  GlazeDtcgOptions,
  GlazeDtcgResolverDocument,
  GlazeDtcgResolverOptions,
  GlazeDtcgResult,
  GlazeExtendOptions,
  GlazeJsonOptions,
  GlazeOutputModes,
  GlazeTailwindOptions,
  GlazeTastyOptions,
  GlazeTheme,
  GlazeThemeExport,
  GlazeThemeSeed,
  ResolvedColor,
} from './types';

/**
 * Reject a seed the resolver can't use: every color multiplies its hue and
 * saturation, so a non-finite one paints the whole theme `NaN`.
 */
function assertValidSeed(seed: GlazeThemeSeed): void {
  for (const field of [
    'hue',
    'saturation',
    'darkHue',
    'darkSaturation',
  ] as const) {
    const value: unknown = seed?.[field];
    const optional = field === 'darkHue' || field === 'darkSaturation';
    if (optional && value === undefined) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(
        `glaze: theme seed ${field} must be a finite number (got ${showValue(value)}).`,
      );
    }
  }
}

export function createTheme(
  seed: GlazeThemeSeed,
  initialColors?: ColorMap,
  callerOverride?: GlazeConfigOverride,
): GlazeTheme {
  // Copied once here, so resolve, `getConfig()`, `export()` and `extend()`
  // read one object the caller can no longer mutate.
  const configOverride = copyConfigOverride(callerOverride);
  assertValidSeed(seed);
  const { hue, saturation, darkHue, darkSaturation } = seed;
  let colorDefs: ColorMap = initialColors ? { ...initialColors } : {};

  let cache: {
    map: Map<string, ResolvedColor> | null;
    version: number;
    effectiveConfig: GlazeConfigResolved;
  } | null = null;

  function getEffectiveConfig(): GlazeConfigResolved {
    const version = getConfigVersion();
    if (cache && cache.version === version) return cache.effectiveConfig;
    const effectiveConfig = mergeConfig(getConfig(), configOverride);
    cache = { map: null, version, effectiveConfig };
    return effectiveConfig;
  }

  function resolveCached(): Map<string, ResolvedColor> {
    const version = getConfigVersion();
    if (cache && cache.version === version && cache.map) return cache.map;
    const effectiveConfig = getEffectiveConfig();
    const map = resolveAllColors(seed, colorDefs, effectiveConfig);
    cache = { map, version, effectiveConfig };
    return map;
  }

  function invalidate(): void {
    cache = null;
  }

  /**
   * `splitHue` context for `tasty()` / `css()`, or `undefined` without it.
   * Throws on a non-oklch format, a non-pastel color, or a color whose own
   * hue var would take the theme var's name. `css()` passes its `suffix` so
   * each color's value property is claimed too: `--{color}{suffix}` must not
   * land on a hue var.
   */
  function channelCtxFor(
    options: GlazeTastyOptions | GlazeCssOptions | undefined,
    format: GlazeColorFormat,
    modes: Required<GlazeOutputModes>,
    valueSuffix?: string,
  ): ChannelCtx | undefined {
    if (!options?.splitHue) return undefined;
    assertSplitHueFormat(options.splitHue, format);
    const resolved = resolveCached();
    assertAllPastel(resolved, modes);
    const baseName = options.name ?? 'theme';
    const ctx: ChannelCtx = {
      seedHue: hue,
      darkSeedHue: darkHue,
      baseName,
      prefix: '',
      defs: colorDefs,
      mode: 'theme',
    };
    const owners: SplitHueOwners = new Map();
    const labels: HueVarLabels = {
      theme: `the theme hue (name: '${baseName}')`,
      color: (name) => `color "${name}"'s own hue`,
      value: (name) => `color "${name}"'s value`,
      fix: 'Rename the color or pass a different `name`.',
      valueFix: 'Rename the color, or pass a different `suffix` or `name`.',
    };
    claimHueVars(resolved, ctx, owners, labels);
    if (valueSuffix !== undefined) {
      claimValueProps(resolved, '', valueSuffix, owners, labels);
    }
    return ctx;
  }

  const theme: GlazeTheme = {
    get hue() {
      return hue;
    },
    get saturation() {
      return saturation;
    },
    get darkHue() {
      return darkHue;
    },
    get darkSaturation() {
      return darkSaturation;
    },
    getConfig(): GlazeConfigResolved {
      // A deep copy: the cached config feeds every resolve, so a caller's
      // mutation must not reach it (or skip `mergeConfig()`'s validation).
      return copyResolvedConfig(getEffectiveConfig());
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

    export(override?: GlazeConfigOverride): GlazeThemeExport {
      return {
        kind: 'theme',
        version: GLAZE_EXPORT_VERSION,
        hue,
        saturation,
        ...(darkHue !== undefined ? { darkHue } : {}),
        ...(darkSaturation !== undefined ? { darkSaturation } : {}),
        colors: structuredClone(colorDefs),
        config: freezeConfigForExport(configOverride, override),
      };
    },

    extend(options: GlazeExtendOptions): GlazeTheme {
      const childSeed: GlazeThemeSeed = {
        hue: options.hue ?? hue,
        saturation: options.saturation ?? saturation,
        darkHue: options.darkHue ?? darkHue,
        darkSaturation: options.darkSaturation ?? darkSaturation,
      };

      const inheritedColors: ColorMap = {};
      for (const [name, def] of Object.entries(colorDefs)) {
        if (def.inherit !== false) {
          inheritedColors[name] = def;
        }
      }

      const mergedColors = options.colors
        ? { ...inheritedColors, ...options.colors }
        : { ...inheritedColors };

      // Child inherits the parent override then merges in the per-extend
      // override, read like a stored one so its getters count too.
      const mergedConfigOverride: GlazeConfigOverride | undefined =
        configOverride || options.config
          ? {
              ...(configOverride ?? {}),
              ...(copyConfigOverride(options.config) ?? {}),
            }
          : undefined;

      return createTheme(childSeed, mergedColors, mergedConfigOverride);
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

    tasty(options?: GlazeTastyOptions): Record<string, Record<string, string>> {
      const cfg = getEffectiveConfig();
      const states = {
        dark: options?.states?.dark ?? cfg.states.dark,
        highContrast: options?.states?.highContrast ?? cfg.states.highContrast,
        hdr: options?.states?.hdr ?? cfg.states.hdr,
      };
      const modes = resolveModes(options?.modes);
      const format = options?.format ?? 'oklch';
      const channelCtx = channelCtxFor(options, format, modes);
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
      const suffix = options?.suffix ?? '-color';
      const modes = resolveModes();
      const channelCtx = channelCtxFor(options, format, modes, suffix);
      return buildCssMap(
        resolveCached(),
        '',
        suffix,
        format,
        getEffectiveConfig().pastel,
        channelCtx,
        options?.hdr ?? modes.hdr,
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
        options?.hdrSelector ?? DEFAULT_TAILWIND_HDR_SELECTOR,
      );
    },
  } as GlazeTheme;

  return theme;
}
