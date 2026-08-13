/**
 * Standalone single-color tokens (`glaze.color()` / `glaze.colorFrom()`).
 *
 * Owns the value-shorthand parser (hex, `rgb()` / `hsl()` / `okhsl()` /
 * `okhst()` / `oklch()`, `{ r, g, b }`, `{ h, s, l }`, `{ h, s, t }`,
 * `{ l, c, h }`), the structured-input validator, the two factory paths
 * (value vs structured), and the JSON-safe export / rehydration round-trip.
 *
 * Tokens store a sparse local config override only. Resolve merges the
 * live global config with that local override (invalidated on
 * `configure()`). Authoring `.export(override?)` freezes
 * `getConfig() ∪ local ∪ override` at call time.
 */

import {
  freezeConfigForExport,
  getConfig,
  getConfigVersion,
  mergeConfig,
} from './config';
import {
  assertExportKind,
  assertExportVersion,
  GLAZE_EXPORT_VERSION,
  isColorTokenExport,
} from './serialize';
import type { ChannelCtx } from './channels';
import { extractOkhslFromValue } from './color-value';
import { assertAllPastel, assertNativeFormat } from './format-guard';
import { toTone } from './okhst';
import { isAbsoluteTone, pairNormal } from './hc-pair';
import { resolveAllColors } from './resolver';
import {
  buildCssMap,
  buildDtcgMap,
  buildDtcgResolver,
  buildJsonMap,
  buildTailwindMap,
  buildTokenMap,
  resolveModes,
} from './formatters';
import type {
  ColorMap,
  GlazeColorCssOptions,
  GlazeColorDtcgResolverOptions,
  GlazeColorDtcgResult,
  GlazeColorInput,
  GlazeColorInputExport,
  GlazeColorOverrides,
  GlazeColorOverridesExport,
  GlazeColorTailwindOptions,
  GlazeColorToken,
  GlazeColorTokenExport,
  GlazeColorValue,
  GlazeCssResult,
  GlazeConfigOverride,
  GlazeConfigResolved,
  GlazeDtcgOptions,
  GlazeDtcgResolverDocument,
  GlazeDtcgResult,
  GlazeJsonOptions,
  GlazeThemeSeed,
  GlazeTokenOptions,
  HCPair,
  OkhslColor,
  RegularColorDef,
  ResolvedColor,
  ToneValue,
} from './types';

// ============================================================================
// Standalone color constants
// ============================================================================

/** Internal name of the user-facing standalone color in the synthesized def map. */
const STANDALONE_VALUE = 'value';
/** Internal name of the hidden static-anchor seed used for relative tone / contrast. */
const STANDALONE_SEED = 'seed';
/** Internal name of an externally-resolved `GlazeColorToken` injected as a base reference. */
const STANDALONE_BASE = 'externalBase';

/** Reserved internal names that user-supplied `name` must not collide with. */
const RESERVED_STANDALONE_NAMES = new Set([
  STANDALONE_VALUE,
  STANDALONE_SEED,
  STANDALONE_BASE,
]);

// ============================================================================
// Sparse local config (no global freeze at create)
// ============================================================================

/**
 * Value-form local override: `lightTone` defaults to `false` (preserve
 * input tone). User override fields win.
 */
function sparseValueFormLocal(
  userOverride?: GlazeConfigOverride,
): GlazeConfigOverride {
  return {
    ...userOverride,
    lightTone:
      userOverride?.lightTone !== undefined ? userOverride.lightTone : false,
  };
}

// ============================================================================
// Input validation
// ============================================================================

/**
 * Validate a user-supplied `opacity` override on `glaze.color()`.
 * Must be a finite number in `0..=1`.
 */
function validateStandaloneOpacity(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(
      `glaze.color: opacity must be a finite number in 0–1 (got ${value}).`,
    );
  }
}

/**
 * Validate a structured `GlazeColorInput`. Range-checks the `hue` /
 * `saturation` / `tone` numerics (and any HC-pair second value)
 * before the resolver sees them so out-of-range or non-finite inputs
 * fail with a helpful, top-level error rather than producing a
 * NaN-laden token. `opacity` is checked here too so all input
 * validation lives in one place.
 */
function validateStructuredInput(input: GlazeColorInput): void {
  if (!Number.isFinite(input.hue)) {
    throw new Error(
      `glaze.color: structured hue must be a finite number (got ${input.hue}).`,
    );
  }
  if (
    !Number.isFinite(input.saturation) ||
    input.saturation < 0 ||
    input.saturation > 100
  ) {
    throw new Error(
      `glaze.color: structured saturation must be a finite number in 0–100 (got ${input.saturation}).`,
    );
  }
  const checkTone = (value: number | string, label: string): void => {
    // 'max' / 'min' extreme keywords are always valid.
    if (value === 'max' || value === 'min') return;
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 100
    ) {
      throw new Error(
        `glaze.color: structured ${label} must be a finite number in 0–100 or 'max'/'min' (got ${String(value)}).`,
      );
    }
  };
  if (Array.isArray(input.tone)) {
    checkTone(input.tone[0], 'tone[normal]');
    checkTone(input.tone[1], 'tone[hc]');
  } else {
    checkTone(input.tone, 'tone');
  }
  if (input.saturationFactor !== undefined) {
    if (
      !Number.isFinite(input.saturationFactor) ||
      input.saturationFactor < 0 ||
      input.saturationFactor > 1
    ) {
      throw new Error(
        `glaze.color: structured saturationFactor must be a finite number in 0–1 (got ${input.saturationFactor}).`,
      );
    }
  }
  if (typeof input.darkHue === 'number' && !Number.isFinite(input.darkHue)) {
    throw new Error(
      `glaze.color: structured darkHue must be a finite number (got ${input.darkHue}).`,
    );
  }
  if (input.darkSaturation !== undefined) {
    if (
      !Number.isFinite(input.darkSaturation) ||
      input.darkSaturation < 0 ||
      input.darkSaturation > 100
    ) {
      throw new Error(
        `glaze.color: structured darkSaturation must be a finite number in 0–100 (got ${input.darkSaturation}).`,
      );
    }
  }
  if (input.darkSaturationFactor !== undefined) {
    if (
      !Number.isFinite(input.darkSaturationFactor) ||
      input.darkSaturationFactor < 0 ||
      input.darkSaturationFactor > 1
    ) {
      throw new Error(
        `glaze.color: structured darkSaturationFactor must be a finite number in 0–1 (got ${input.darkSaturationFactor}).`,
      );
    }
  }
  if (input.opacity !== undefined) validateStandaloneOpacity(input.opacity);
}

/**
 * Validate a user-supplied `name` override. Rejects empty / whitespace-only
 * strings and names colliding with `glaze`'s reserved internal sentinels.
 */
function validateStandaloneName(name: string): void {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new Error(
      'glaze.color: name must be a non-empty string. ' +
        'Omit `name` if you do not want to set a debug label.',
    );
  }
  if (RESERVED_STANDALONE_NAMES.has(name)) {
    const reserved = [...RESERVED_STANDALONE_NAMES]
      .map((n) => `"${n}"`)
      .join(', ');
    throw new Error(
      `glaze.color: name "${name}" is reserved (used internally). ` +
        `Reserved names are: ${reserved}. Pick a different name.`,
    );
  }
}

// ============================================================================
// Factory: shared helpers
// ============================================================================

interface ValueDefsResult {
  seed: GlazeThemeSeed;
  defs: ColorMap;
  primary: string;
}

/**
 * Resolve `'max'` / `'min'` to their literal author tones (100 / 0).
 *
 * The hidden `STANDALONE_SEED` anchor exists only so `contrast` has something
 * to measure against — it is not an authored base. Pinning the extreme keeps
 * the token on the plain scheme mapping instead of the base-anchored dark
 * replay the resolver applies to real `base` references.
 */
function pinExtremeTone(tone: HCPair<ToneValue>): HCPair<ToneValue> {
  const pin = (value: ToneValue): ToneValue =>
    value === 'max' ? 100 : value === 'min' ? 0 : value;
  return Array.isArray(tone) ? [pin(tone[0]), pin(tone[1])] : pin(tone);
}

/**
 * Build the `ColorMap` for a value-shorthand `glaze.color()` call.
 *
 * The user-facing color (`STANDALONE_VALUE`) defaults to `mode: 'auto'`
 * across every value-shorthand form.
 *
 * An absolute `hue` override becomes the seed while a relative one becomes a
 * def field; `darkHue` always lands on the def in either form, so an absolute
 * `darkHue` wins outright instead of being re-offset by a relative `hue`.
 *
 * When the user requests `contrast` or relative `tone`, a hidden
 * `STANDALONE_SEED` def is synthesized at `mode: 'static'`. That keeps
 * the seed pinned to the literal user-provided color across all four
 * variants, so the contrast solver always anchors against it.
 */
function buildStandaloneValueDefs(
  main: OkhslColor,
  options: GlazeColorOverrides | undefined,
): ValueDefsResult {
  const seedHue = typeof options?.hue === 'number' ? options.hue : main.h;
  const seedSaturation = options?.saturation ?? main.s * 100;
  const relativeHue =
    typeof options?.hue === 'string' ? options.hue : undefined;

  const toneOption = options?.tone;
  const hasExternalBase = options?.base !== undefined;
  // Seed-anchor synthesis only kicks in when the user did NOT supply their
  // own base — in that case `contrast` and relative `tone` anchor to
  // the literal seed via the hidden `STANDALONE_SEED` def.
  const needsSeedAnchor =
    !hasExternalBase &&
    (options?.contrast !== undefined ||
      (toneOption !== undefined && !isAbsoluteTone(toneOption)));

  if (options?.opacity !== undefined)
    validateStandaloneOpacity(options.opacity);

  const userName = options?.name;
  if (userName !== undefined) validateStandaloneName(userName);
  const primary = userName ?? STANDALONE_VALUE;

  // The seed color is given in OKHSL lightness; express it as canonical tone.
  const seedTone = toTone(main.l);

  const primaryTone = toneOption ?? seedTone;

  const valueDef: RegularColorDef = {
    hue: relativeHue,
    saturation: options?.saturationFactor,
    darkHue: options?.darkHue,
    darkSaturation: options?.darkSaturationFactor,
    tone: needsSeedAnchor ? pinExtremeTone(primaryTone) : primaryTone,
    contrast: options?.contrast,
    mode: options?.mode ?? 'auto',
    autoFlip: options?.autoFlip,
    opacity: options?.opacity,
    pastel: options?.pastel,
    role: options?.role,
    base: hasExternalBase
      ? STANDALONE_BASE
      : needsSeedAnchor
        ? STANDALONE_SEED
        : undefined,
  };

  const defs: ColorMap = { [primary]: valueDef };

  if (needsSeedAnchor) {
    defs[STANDALONE_SEED] = {
      hue: main.h,
      saturation: 1,
      tone: seedTone,
      mode: 'static',
    };
  }

  return {
    seed: {
      hue: seedHue,
      saturation: seedSaturation,
      darkSaturation: options?.darkSaturation,
    },
    defs,
    primary,
  };
}

function createColorTokenFromDefs(
  seed: GlazeThemeSeed,
  defs: ColorMap,
  primary: string,
  configOverride: GlazeConfigOverride | undefined,
  baseToken: GlazeColorToken | undefined,
  buildExport: (override?: GlazeConfigOverride) => GlazeColorTokenExport,
): GlazeColorToken {
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

  const resolveOnce = (): Map<string, ResolvedColor> => {
    const version = getConfigVersion();
    if (cache && cache.version === version && cache.map) return cache.map;
    const effectiveConfig = getEffectiveConfig();
    const externalBases = baseToken
      ? new Map([[STANDALONE_BASE, baseToken.resolve()]])
      : undefined;
    const map = resolveAllColors(seed, defs, effectiveConfig, externalBases);
    cache = { map, version, effectiveConfig };
    return map;
  };

  const resolveStates = (options?: GlazeTokenOptions) => {
    const cfg = getConfig();
    return {
      dark: options?.states?.dark ?? cfg.states.dark,
      highContrast: options?.states?.highContrast ?? cfg.states.highContrast,
    };
  };

  const tokenLike = (options?: GlazeTokenOptions): Record<string, string> => {
    const tokenMap = buildTokenMap(
      resolveOnce(),
      '',
      resolveStates(options),
      resolveModes(options?.modes),
      options?.format ?? 'oklch',
      getEffectiveConfig().pastel,
    );
    return tokenMap[`#${primary}`];
  };

  return {
    resolve(): ResolvedColor {
      return resolveOnce().get(primary)!;
    },

    token: tokenLike,
    tasty: tokenLike,

    json(options?: GlazeJsonOptions): Record<string, string> {
      const format = options?.format ?? 'oklch';
      assertNativeFormat(format, 'json');
      const jsonMap = buildJsonMap(
        resolveOnce(),
        resolveModes(options?.modes),
        format,
        getEffectiveConfig().pastel,
      );
      return jsonMap[primary];
    },

    css(options: GlazeColorCssOptions): GlazeCssResult {
      const format = options.format ?? 'oklch';
      assertNativeFormat(format, 'css');
      const resolved = resolveOnce().get(primary)!;
      const renamed = new Map<string, ResolvedColor>([
        [options.name, resolved],
      ]);

      let channelCtx: ChannelCtx | undefined;
      if (options.splitHue && format === 'oklch') {
        const modes = resolveModes();
        assertAllPastel(renamed, modes);
        channelCtx = {
          seedHue: seed.hue,
          baseName: options.name,
          prefix: '',
          defs: { [options.name]: defs[primary] },
          mode: 'standalone',
          resolvedHue: resolved.light.h,
        };
      }

      return buildCssMap(
        renamed,
        '',
        options.suffix ?? '-color',
        format,
        getEffectiveConfig().pastel,
        channelCtx,
      );
    },

    dtcg(options?: GlazeDtcgOptions): GlazeColorDtcgResult {
      const modes = resolveModes(options?.modes);
      const doc = buildDtcgMap(
        resolveOnce(),
        '',
        modes,
        options?.colorSpace ?? 'srgb',
        getEffectiveConfig().pastel,
      );
      const result: GlazeColorDtcgResult = { light: doc.light[primary] };
      if (doc.dark) result.dark = doc.dark[primary];
      if (doc.lightContrast) {
        result.lightContrast = doc.lightContrast[primary];
      }
      if (doc.darkContrast) result.darkContrast = doc.darkContrast[primary];
      return result;
    },

    dtcgResolver(
      options: GlazeColorDtcgResolverOptions,
    ): GlazeDtcgResolverDocument {
      const doc = buildDtcgMap(
        resolveOnce(),
        '',
        resolveModes(options?.modes),
        options?.colorSpace ?? 'srgb',
        getEffectiveConfig().pastel,
      );
      const name = options.name;
      const result: GlazeDtcgResult = {
        light: { [name]: doc.light[primary] },
      };
      if (doc.dark) result.dark = { [name]: doc.dark[primary] };
      if (doc.lightContrast) {
        result.lightContrast = { [name]: doc.lightContrast[primary] };
      }
      if (doc.darkContrast) {
        result.darkContrast = { [name]: doc.darkContrast[primary] };
      }
      return buildDtcgResolver(result, options);
    },

    tailwind(options: GlazeColorTailwindOptions): string {
      const format = options.format ?? 'oklch';
      assertNativeFormat(format, 'tailwind');
      const renamed = new Map<string, ResolvedColor>([
        [options.name, resolveOnce().get(primary)!],
      ]);
      return buildTailwindMap(
        renamed,
        '',
        options.namespace ?? 'color-',
        resolveModes(options?.modes),
        format,
        options.darkSelector ?? '.dark',
        options.highContrastSelector ?? '.high-contrast',
        getEffectiveConfig().pastel,
      );
    },

    export(override?: GlazeConfigOverride): GlazeColorTokenExport {
      return buildExport(override);
    },
  };
}

/**
 * When a value/`from` color links to a base that was created via the
 * structured form (with explicit `hue`/`saturation`/`tone`), resolve
 * that base with `lightTone: false` for the linking math so the
 * contrast/tone anchor matches the input tone — not the
 * windowed output. The original base token's `.resolve()` is unaffected.
 */
function toLinkingBase(
  base: GlazeColorToken | undefined,
): GlazeColorToken | undefined {
  if (!base) return undefined;
  const exp = base.export();
  if (exp.form !== 'structured') return base;
  const linkingConfig: GlazeConfigOverride = {
    ...(exp.config ?? {}),
    lightTone: false,
  };
  return colorFromExport({ ...exp, config: linkingConfig });
}

/**
 * Resolve `base` (which may be a token reference or a raw color value)
 * into a `GlazeColorToken`. Raw values are auto-wrapped via
 * `createColorTokenFromValue` so they pick up the same auto-invert
 * defaults as an explicit wrap. Returns `undefined` when no base is provided.
 */
function resolveBaseToken(
  base: GlazeColorToken | GlazeColorValue | undefined,
): GlazeColorToken | undefined {
  if (base === undefined) return undefined;
  if (isGlazeColorToken(base)) return base;
  return createColorTokenFromValue(base, undefined, undefined);
}

/**
 * Discriminate a `GlazeColorToken` from a raw `GlazeColorValue`.
 */
export function isGlazeColorToken(
  candidate: GlazeColorToken | GlazeColorValue,
): candidate is GlazeColorToken {
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    !Array.isArray(candidate) &&
    'resolve' in candidate &&
    typeof (candidate as { resolve?: unknown }).resolve === 'function'
  );
}

// ============================================================================
// Factory: structured input
// ============================================================================

export function createColorToken(
  input: GlazeColorInput,
  configOverride?: GlazeConfigOverride,
): GlazeColorToken {
  validateStructuredInput(input);

  const userName = input.name;
  if (userName !== undefined) validateStandaloneName(userName);
  const primary = userName ?? STANDALONE_VALUE;

  const baseToken = resolveBaseToken(input.base);
  const hasExternalBase = baseToken !== undefined;
  const needsSeedAnchor = !hasExternalBase && input.contrast !== undefined;

  const defs: ColorMap = {
    [primary]: {
      tone: needsSeedAnchor ? pinExtremeTone(input.tone) : input.tone,
      saturation: input.saturationFactor,
      darkHue: input.darkHue,
      darkSaturation: input.darkSaturationFactor,
      mode: input.mode ?? 'auto',
      autoFlip: input.autoFlip,
      contrast: input.contrast,
      opacity: input.opacity,
      pastel: input.pastel,
      role: input.role,
      base: hasExternalBase
        ? STANDALONE_BASE
        : needsSeedAnchor
          ? STANDALONE_SEED
          : undefined,
    },
  };

  if (needsSeedAnchor) {
    defs[STANDALONE_SEED] = {
      // The seed anchor must be a concrete tone; resolve 'max'/'min' to its
      // extreme so the static anchor is well-defined.
      tone: pinExtremeTone(pairNormal(input.tone)),
      saturation: 1,
      mode: 'static',
    };
  }

  const localOverride = configOverride;

  return createColorTokenFromDefs(
    {
      hue: input.hue,
      saturation: input.saturation,
      darkSaturation: input.darkSaturation,
    },
    defs,
    primary,
    localOverride,
    baseToken,
    (exportArg) => ({
      kind: 'color',
      version: GLAZE_EXPORT_VERSION,
      form: 'structured',
      input: buildStructuredInputExport(input, exportArg),
      config: freezeConfigForExport(localOverride, exportArg),
    }),
  );
}

// ============================================================================
// Factory: value-shorthand input
// ============================================================================

export function createColorTokenFromValue(
  value: GlazeColorValue,
  options: GlazeColorOverrides | undefined,
  configOverride: GlazeConfigOverride | undefined,
): GlazeColorToken {
  const main = extractOkhslFromValue(value);
  const rawBaseToken = resolveBaseToken(options?.base);
  // For linking math, structured bases are re-resolved at full range
  // (lightTone: false) so contrast/tone anchors use the
  // input tone, not the windowed output.
  const linkingBase = toLinkingBase(rawBaseToken);
  const { seed, defs, primary } = buildStandaloneValueDefs(main, options);

  const localOverride = sparseValueFormLocal(configOverride);

  return createColorTokenFromDefs(
    seed,
    defs,
    primary,
    localOverride,
    linkingBase,
    (exportArg) => ({
      kind: 'color',
      version: GLAZE_EXPORT_VERSION,
      form: 'value',
      input: value,
      ...(options !== undefined
        ? { overrides: buildOverridesExport(options, exportArg) }
        : {}),
      config: freezeConfigForExport(localOverride, exportArg),
    }),
  );
}

// ============================================================================
// Export / rehydrate
// ============================================================================

/**
 * Build a JSON-safe snapshot of `GlazeColorOverrides`. `base` is
 * recursively serialized when it was originally a token; raw values are
 * preserved as-is so `glaze.colorFrom(...)` round-trips them.
 */
function buildOverridesExport(
  options: GlazeColorOverrides,
  exportArg?: GlazeConfigOverride,
): GlazeColorOverridesExport {
  const out: GlazeColorOverridesExport = {};
  if (options.hue !== undefined) out.hue = options.hue;
  if (options.saturation !== undefined) out.saturation = options.saturation;
  if (options.tone !== undefined) out.tone = options.tone;
  if (options.saturationFactor !== undefined) {
    out.saturationFactor = options.saturationFactor;
  }
  if (options.darkHue !== undefined) out.darkHue = options.darkHue;
  if (options.darkSaturation !== undefined) {
    out.darkSaturation = options.darkSaturation;
  }
  if (options.darkSaturationFactor !== undefined) {
    out.darkSaturationFactor = options.darkSaturationFactor;
  }
  if (options.mode !== undefined) out.mode = options.mode;
  if (options.autoFlip !== undefined) out.autoFlip = options.autoFlip;
  if (options.contrast !== undefined) out.contrast = options.contrast;
  if (options.opacity !== undefined) out.opacity = options.opacity;
  if (options.name !== undefined) out.name = options.name;
  if (options.pastel !== undefined) out.pastel = options.pastel;
  if (options.role !== undefined) out.role = options.role;
  if (options.base !== undefined) {
    out.base = isGlazeColorToken(options.base)
      ? options.base.export(exportArg)
      : options.base;
  }
  return out;
}

function buildStructuredInputExport(
  input: GlazeColorInput,
  exportArg?: GlazeConfigOverride,
): GlazeColorInputExport {
  const out: GlazeColorInputExport = {
    hue: input.hue,
    saturation: input.saturation,
    tone: input.tone,
  };
  if (input.saturationFactor !== undefined) {
    out.saturationFactor = input.saturationFactor;
  }
  if (input.darkHue !== undefined) out.darkHue = input.darkHue;
  if (input.darkSaturation !== undefined) {
    out.darkSaturation = input.darkSaturation;
  }
  if (input.darkSaturationFactor !== undefined) {
    out.darkSaturationFactor = input.darkSaturationFactor;
  }
  if (input.mode !== undefined) out.mode = input.mode;
  if (input.autoFlip !== undefined) out.autoFlip = input.autoFlip;
  if (input.opacity !== undefined) out.opacity = input.opacity;
  if (input.contrast !== undefined) out.contrast = input.contrast;
  if (input.name !== undefined) out.name = input.name;
  if (input.pastel !== undefined) out.pastel = input.pastel;
  if (input.role !== undefined) out.role = input.role;
  if (input.base !== undefined) {
    out.base = isGlazeColorToken(input.base)
      ? input.base.export(exportArg)
      : input.base;
  }
  return out;
}

/**
 * Discriminate a `GlazeColorTokenExport` from a raw `GlazeColorValue`.
 */
function isExportedToken(
  candidate: GlazeColorTokenExport | GlazeColorValue,
): candidate is GlazeColorTokenExport {
  return isColorTokenExport(candidate);
}

function rehydrateOverrides(
  data: GlazeColorOverridesExport,
): GlazeColorOverrides {
  const out: GlazeColorOverrides = {};
  if (data.hue !== undefined) out.hue = data.hue;
  if (data.saturation !== undefined) out.saturation = data.saturation;
  if (data.tone !== undefined) out.tone = data.tone;
  if (data.saturationFactor !== undefined) {
    out.saturationFactor = data.saturationFactor;
  }
  if (data.darkHue !== undefined) out.darkHue = data.darkHue;
  if (data.darkSaturation !== undefined) {
    out.darkSaturation = data.darkSaturation;
  }
  if (data.darkSaturationFactor !== undefined) {
    out.darkSaturationFactor = data.darkSaturationFactor;
  }
  if (data.mode !== undefined) out.mode = data.mode;
  if (data.autoFlip !== undefined) out.autoFlip = data.autoFlip;
  if (data.contrast !== undefined) out.contrast = data.contrast;
  if (data.opacity !== undefined) out.opacity = data.opacity;
  if (data.name !== undefined) out.name = data.name;
  if (data.pastel !== undefined) out.pastel = data.pastel;
  if (data.role !== undefined) out.role = data.role;
  if (data.base !== undefined) {
    out.base = isExportedToken(data.base)
      ? colorFromExport(data.base)
      : data.base;
  }
  return out;
}

function rehydrateStructuredInput(
  data: GlazeColorInputExport,
): GlazeColorInput {
  const out: GlazeColorInput = {
    hue: data.hue,
    saturation: data.saturation,
    tone: data.tone,
  };
  if (data.saturationFactor !== undefined) {
    out.saturationFactor = data.saturationFactor;
  }
  if (data.darkHue !== undefined) out.darkHue = data.darkHue;
  if (data.darkSaturation !== undefined) {
    out.darkSaturation = data.darkSaturation;
  }
  if (data.darkSaturationFactor !== undefined) {
    out.darkSaturationFactor = data.darkSaturationFactor;
  }
  if (data.mode !== undefined) out.mode = data.mode;
  if (data.autoFlip !== undefined) out.autoFlip = data.autoFlip;
  if (data.opacity !== undefined) out.opacity = data.opacity;
  if (data.contrast !== undefined) out.contrast = data.contrast;
  if (data.name !== undefined) out.name = data.name;
  if (data.pastel !== undefined) out.pastel = data.pastel;
  if (data.role !== undefined) out.role = data.role;
  if (data.base !== undefined) {
    out.base = isExportedToken(data.base)
      ? colorFromExport(data.base)
      : data.base;
  }
  return out;
}

/**
 * Rehydrate a token from its `.export()` snapshot. Recursively rebuilds
 * any base dependency. Inverse of `GlazeColorToken.export()`.
 *
 * The stored `config` field is the freeze from export time — passed as
 * the instance local override so the rehydrated token stays pinned
 * against later `glaze.configure()` calls.
 */
export function colorFromExport(data: GlazeColorTokenExport): GlazeColorToken {
  if (data === null || typeof data !== 'object') {
    throw new Error(
      `glaze.colorFrom: expected an object from token.export(), got ${data === null ? 'null' : typeof data}.`,
    );
  }
  assertExportKind(data, 'color', 'glaze.colorFrom');
  assertExportVersion(data, 'glaze.colorFrom');
  if (data.form !== 'value' && data.form !== 'structured') {
    throw new Error(
      `glaze.colorFrom: invalid "form" field — expected "value" or "structured" (got ${JSON.stringify((data as { form?: unknown }).form)}).`,
    );
  }
  if (data.input === undefined) {
    throw new Error(
      `glaze.colorFrom: missing "input" field — expected the original ${data.form === 'value' ? 'GlazeColorValue' : 'GlazeColorInput'}.`,
    );
  }

  if (data.form === 'value') {
    const value = data.input as GlazeColorValue;
    const overrides = data.overrides
      ? rehydrateOverrides(data.overrides)
      : undefined;
    return createColorTokenFromValue(value, overrides, data.config);
  }

  const input = rehydrateStructuredInput(data.input as GlazeColorInputExport);
  return createColorToken(input, data.config);
}
