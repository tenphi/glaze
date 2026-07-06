/**
 * Standalone single-color tokens (`glaze.color()` / `glaze.colorFrom()`).
 *
 * Owns the value-shorthand parser (hex, `rgb()` / `hsl()` / `okhsl()` /
 * `okhst()` / `oklch()`, `{ r, g, b }`, `{ h, s, l }`, `{ h, s, t }`,
 * `{ l, c, h }`), the structured-input validator, the two factory paths
 * (value vs structured), and the JSON-safe export / rehydration round-trip.
 *
 * Standalone tokens snapshot the full effective config at create time
 * so later `configure()` calls do not retroactively change exported
 * tokens. The snapshot is built eagerly in
 * `buildValueFormConfigOverride()` / `buildStructuredConfigOverride()`.
 * The token's resolved variants are then memoized on first
 * `.resolve()` / `.token()` / ... call.
 */

import { defaultConfig, getConfig, mergeConfig } from './config';
import type { ChannelCtx } from './channels';
import { assertAllPastel, assertNativeFormat } from './format-guard';
import {
  hslToSrgb,
  oklabToOkhsl,
  parseHexAlpha,
  srgbToOkhsl,
} from './okhsl-color-math';
import { okhstToOkhsl, toTone } from './okhst';
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
  GlazeTokenOptions,
  OkhslColor,
  OkhstColor,
  OklchColor,
  RgbColor,
  RegularColorDef,
  ResolvedColor,
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
// Effective config snapshots
// ============================================================================

/**
 * Build the per-token effective config override for a value-form color.
 *
 * Light window defaults to `false` (preserve input tone exactly).
 * All other fields snapshot from global at create time. User override
 * fields win over all defaults.
 */
function buildValueFormConfigOverride(
  userOverride?: GlazeConfigOverride,
): GlazeConfigOverride {
  const cfg = getConfig();
  return {
    lightTone:
      userOverride?.lightTone !== undefined ? userOverride.lightTone : false,
    darkTone:
      userOverride?.darkTone !== undefined
        ? userOverride.darkTone
        : cfg.darkTone,
    darkDesaturation: userOverride?.darkDesaturation ?? cfg.darkDesaturation,
    autoFlip: userOverride?.autoFlip ?? cfg.autoFlip,
    shadowTuning: userOverride?.shadowTuning ?? cfg.shadowTuning,
  };
}

/**
 * Build the per-token effective config override for a structured-form color.
 *
 * Both light and dark windows snapshot from global at create time.
 * User override fields win.
 */
function buildStructuredConfigOverride(
  userOverride?: GlazeConfigOverride,
): GlazeConfigOverride {
  const cfg = getConfig();
  return {
    lightTone:
      userOverride?.lightTone !== undefined
        ? userOverride.lightTone
        : cfg.lightTone,
    darkTone:
      userOverride?.darkTone !== undefined
        ? userOverride.darkTone
        : cfg.darkTone,
    darkDesaturation: userOverride?.darkDesaturation ?? cfg.darkDesaturation,
    autoFlip: userOverride?.autoFlip ?? cfg.autoFlip,
    shadowTuning: userOverride?.shadowTuning ?? cfg.shadowTuning,
  };
}

/**
 * Build the `GlazeConfigResolved` to pass to `resolveAllColors` from a
 * snapshot override. Uses `defaultConfig()` as the base so all required
 * fields are present; the snapshot fields win.
 */
function resolvedConfigFromOverride(
  override: GlazeConfigOverride,
): GlazeConfigResolved {
  return mergeConfig(defaultConfig(), override);
}

// ============================================================================
// Color string parsing
// ============================================================================

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

function parseColorString(input: string): OkhslColor {
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
function validateOkhslColor(value: OkhslColor): void {
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
function validateRgbColor(value: RgbColor): void {
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
function validateOklchColor(value: OklchColor): void {
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

function oklchComponentsToOkhsl(
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

function isRgbColorObject(value: object): value is RgbColor {
  return 'r' in value && 'g' in value && 'b' in value;
}

function isOklchColorObject(value: object): value is OklchColor {
  return 'c' in value && 'l' in value && 'h' in value;
}

function isOkhstColorObject(value: object): value is OkhstColor {
  return 't' in value && 'h' in value && 's' in value;
}

/** Validate a user-supplied `{ h, s, t }` OKHST object (s/t in 0–1). */
function validateOkhstColor(value: OkhstColor): void {
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

// ============================================================================
// Factory: shared helpers
// ============================================================================

interface ValueDefsResult {
  seedHue: number;
  seedSaturation: number;
  defs: ColorMap;
  primary: string;
}

/**
 * Build the `ColorMap` for a value-shorthand `glaze.color()` call.
 *
 * The user-facing color (`STANDALONE_VALUE`) defaults to `mode: 'auto'`
 * across every value-shorthand form.
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

  const valueDef: RegularColorDef = {
    hue: relativeHue,
    saturation: options?.saturationFactor,
    tone: toneOption ?? seedTone,
    contrast: options?.contrast,
    mode: options?.mode ?? 'auto',
    flip: options?.flip,
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
    seedHue,
    seedSaturation,
    defs,
    primary,
  };
}

function createColorTokenFromDefs(
  seedHue: number,
  seedSaturation: number,
  defs: ColorMap,
  primary: string,
  effectiveConfig: GlazeConfigResolved,
  baseToken: GlazeColorToken | undefined,
  exportData: () => GlazeColorTokenExport,
): GlazeColorToken {
  // Cache the resolve result across token / tasty / json / css / resolve calls.
  let cached: Map<string, ResolvedColor> | undefined;
  const resolveOnce = (): Map<string, ResolvedColor> => {
    if (cached) return cached;
    const externalBases = baseToken
      ? new Map([[STANDALONE_BASE, baseToken.resolve()]])
      : undefined;
    cached = resolveAllColors(
      seedHue,
      seedSaturation,
      defs,
      effectiveConfig,
      externalBases,
    );
    return cached;
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
      effectiveConfig.pastel,
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
        effectiveConfig.pastel,
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
          seedHue,
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
        effectiveConfig.pastel,
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
        effectiveConfig.pastel,
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
        effectiveConfig.pastel,
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
        effectiveConfig.pastel,
      );
    },

    export: exportData,
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
      tone: input.tone,
      saturation: input.saturationFactor,
      mode: input.mode ?? 'auto',
      flip: input.flip,
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
    const seedTone = pairNormal(input.tone);
    defs[STANDALONE_SEED] = {
      // The seed anchor must be a concrete tone; resolve 'max'/'min' to its
      // extreme so the static anchor is well-defined.
      tone: seedTone === 'max' ? 100 : seedTone === 'min' ? 0 : seedTone,
      saturation: 1,
      mode: 'static',
    };
  }

  const effectiveConfigOverride = buildStructuredConfigOverride(configOverride);
  const effectiveConfig = resolvedConfigFromOverride(effectiveConfigOverride);

  const exportData = (): GlazeColorTokenExport => ({
    form: 'structured',
    input: buildStructuredInputExport(input),
    config: effectiveConfigOverride,
  });

  return createColorTokenFromDefs(
    input.hue,
    input.saturation,
    defs,
    primary,
    effectiveConfig,
    baseToken,
    exportData,
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
  const { seedHue, seedSaturation, defs, primary } = buildStandaloneValueDefs(
    main,
    options,
  );

  const effectiveConfigOverride = buildValueFormConfigOverride(configOverride);
  const effectiveConfig = resolvedConfigFromOverride(effectiveConfigOverride);

  const exportData = (): GlazeColorTokenExport => ({
    form: 'value',
    input: value,
    ...(options !== undefined
      ? { overrides: buildOverridesExport(options) }
      : {}),
    config: effectiveConfigOverride,
  });

  return createColorTokenFromDefs(
    seedHue,
    seedSaturation,
    defs,
    primary,
    effectiveConfig,
    linkingBase,
    exportData,
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
): GlazeColorOverridesExport {
  const out: GlazeColorOverridesExport = {};
  if (options.hue !== undefined) out.hue = options.hue;
  if (options.saturation !== undefined) out.saturation = options.saturation;
  if (options.tone !== undefined) out.tone = options.tone;
  if (options.saturationFactor !== undefined) {
    out.saturationFactor = options.saturationFactor;
  }
  if (options.mode !== undefined) out.mode = options.mode;
  if (options.flip !== undefined) out.flip = options.flip;
  if (options.contrast !== undefined) out.contrast = options.contrast;
  if (options.opacity !== undefined) out.opacity = options.opacity;
  if (options.name !== undefined) out.name = options.name;
  if (options.pastel !== undefined) out.pastel = options.pastel;
  if (options.role !== undefined) out.role = options.role;
  if (options.base !== undefined) {
    out.base = isGlazeColorToken(options.base)
      ? options.base.export()
      : options.base;
  }
  return out;
}

function buildStructuredInputExport(
  input: GlazeColorInput,
): GlazeColorInputExport {
  const out: GlazeColorInputExport = {
    hue: input.hue,
    saturation: input.saturation,
    tone: input.tone,
  };
  if (input.saturationFactor !== undefined) {
    out.saturationFactor = input.saturationFactor;
  }
  if (input.mode !== undefined) out.mode = input.mode;
  if (input.flip !== undefined) out.flip = input.flip;
  if (input.opacity !== undefined) out.opacity = input.opacity;
  if (input.contrast !== undefined) out.contrast = input.contrast;
  if (input.name !== undefined) out.name = input.name;
  if (input.pastel !== undefined) out.pastel = input.pastel;
  if (input.role !== undefined) out.role = input.role;
  if (input.base !== undefined) {
    out.base = isGlazeColorToken(input.base) ? input.base.export() : input.base;
  }
  return out;
}

/**
 * Discriminate a `GlazeColorTokenExport` from a raw `GlazeColorValue`.
 */
function isExportedToken(
  candidate: GlazeColorTokenExport | GlazeColorValue,
): candidate is GlazeColorTokenExport {
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    !Array.isArray(candidate) &&
    'form' in candidate &&
    ((candidate as GlazeColorTokenExport).form === 'value' ||
      (candidate as GlazeColorTokenExport).form === 'structured')
  );
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
  if (data.mode !== undefined) out.mode = data.mode;
  if (data.flip !== undefined) out.flip = data.flip;
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
  if (data.mode !== undefined) out.mode = data.mode;
  if (data.flip !== undefined) out.flip = data.flip;
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
 * The stored `config` field contains the full effective config override
 * snapshotted at creation time, so the rehydrated token is deterministic
 * regardless of subsequent `glaze.configure()` calls.
 */
export function colorFromExport(data: GlazeColorTokenExport): GlazeColorToken {
  if (data === null || typeof data !== 'object') {
    throw new Error(
      `glaze.colorFrom: expected an object from token.export(), got ${data === null ? 'null' : typeof data}.`,
    );
  }
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
    // The stored `config` contains the full effective snapshot — pass it
    // directly so the rehydrated token reproduces identical behavior.
    return createColorTokenFromValue(value, overrides, data.config);
  }

  const input = rehydrateStructuredInput(data.input as GlazeColorInputExport);
  return createColorToken(input, data.config);
}
