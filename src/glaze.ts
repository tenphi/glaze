/**
 * Glaze — OKHSL-based color theme generator.
 *
 * Generates robust light, dark, and high-contrast colors from a hue/saturation
 * seed, preserving contrast for UI pairs via explicit dependencies.
 */

import {
  okhslToLinearSrgb,
  sRGBLinearToGamma,
  gamutClampedLuminance,
  formatOkhsl,
  formatRgb,
  formatHsl,
  formatOklch,
  srgbToOkhsl,
  hslToSrgb,
  oklabToOkhsl,
  parseHex,
  parseHexAlpha,
} from './okhsl-color-math';
import {
  findLightnessForContrast,
  findValueForMixContrast,
  resolveMinContrast,
} from './contrast-solver';
import type { LinearRgb, MinContrast } from './contrast-solver';
import type {
  HCPair,
  AdaptationMode,
  RelativeValue,
  RegularColorDef,
  ShadowColorDef,
  ShadowTuning,
  MixColorDef,
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
  GlazePaletteOptions,
  GlazePaletteExportOptions,
  GlazeColorInput,
  GlazeColorInputExport,
  GlazeColorToken,
  GlazeColorTokenExport,
  GlazeColorValue,
  GlazeColorOverrides,
  GlazeColorOverridesExport,
  GlazeColorCssOptions,
  GlazeColorScaling,
  GlazeShadowInput,
  OkhslColor,
} from './types';

// ============================================================================
// Standalone color constants
// ============================================================================

/** Internal name of the user-facing standalone color in the synthesized def map. */
const STANDALONE_VALUE = 'value';
/** Internal name of the hidden static-anchor seed used for relative lightness / contrast. */
const STANDALONE_SEED = 'seed';
/** Internal name of an externally-resolved `GlazeColorToken` injected as a base reference. */
const STANDALONE_BASE = 'externalBase';

/**
 * Build the create-time scaling snapshot used when the caller did not
 * pass an explicit `scaling`. All windows are snapshotted from the
 * current `globalConfig` so later `glaze.configure()` calls don't
 * retroactively change the resolved variants of an already-created
 * token (matches the documented "frozen at create time" semantics).
 *
 * String value-shorthand inputs preserve their light lightness exactly
 * (`lightLightness: false`) and use an extended dark window
 * `[globalConfig.darkLightness[0], 100]` so a totally-black input can
 * Möbius-invert to totally-white in dark mode. Object / tuple /
 * structured inputs snapshot both windows from `globalConfig` verbatim
 * so they behave like an ordinary theme color (auto-adapted on both
 * sides).
 */
function defaultStandaloneScaling(isString: boolean): GlazeColorScaling {
  if (isString) {
    const [darkLo] = globalConfig.darkLightness;
    return {
      lightLightness: false,
      darkLightness: [darkLo, 100],
    };
  }
  return {
    lightLightness: globalConfig.lightLightness,
    darkLightness: globalConfig.darkLightness,
  };
}

/** Reserved internal names that user-supplied `name` must not collide with. */
const RESERVED_STANDALONE_NAMES = new Set([
  STANDALONE_VALUE,
  STANDALONE_SEED,
  STANDALONE_BASE,
]);

/**
 * Discriminate a `GlazeColorToken` from a raw `GlazeColorValue`.
 * Used to widen `base?` so it accepts either a token reference or a
 * raw value (auto-wrapped into `glaze.color(value)`).
 */
function isGlazeColorToken(
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
// Global configuration
// ============================================================================

let globalConfig: GlazeConfigResolved = {
  lightLightness: [10, 100],
  darkLightness: [15, 95],
  darkDesaturation: 0.1,
  darkCurve: 0.5,
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
// Contrast warning
// ============================================================================

/**
 * Dedupe contrast warnings within a single process. The cache survives
 * the lifetime of a token because tokens memoize their resolution; the
 * limit is a soft cap to keep noise bounded across long-lived sessions
 * (e.g. dev servers with HMR re-resolving themes repeatedly).
 */
const CONTRAST_WARN_CACHE_LIMIT = 256;
const contrastWarnCache = new Set<string>();

function schemeLabel(isDark: boolean, isHighContrast: boolean): string {
  if (isDark && isHighContrast) return 'darkContrast';
  if (isDark) return 'dark';
  if (isHighContrast) return 'lightContrast';
  return 'light';
}

function formatContrastTarget(input: MinContrast, ratio: number): string {
  return typeof input === 'string'
    ? `"${input}" (${ratio.toFixed(2)})`
    : ratio.toFixed(2);
}

/**
 * Slack factor below the requested target before we emit a warning.
 * The contrast solver already overshoots by `OVERSHOOT` (currently 1%)
 * to absorb rounding noise (`see findLightnessForContrast` in
 * `contrast-solver.ts`), so an `actual` ratio within ~2x that overshoot
 * is effectively a pass and not worth nagging the user about.
 */
const CONTRAST_WARN_SLACK = 0.98;

function warnContrastUnmet(
  name: string,
  isDark: boolean,
  isHighContrast: boolean,
  target: MinContrast,
  actual: number,
): void {
  const targetRatio = resolveMinContrast(target);
  if (actual >= targetRatio * CONTRAST_WARN_SLACK) return;

  const scheme = schemeLabel(isDark, isHighContrast);
  const key = `${name}|${scheme}|${targetRatio.toFixed(3)}|${actual.toFixed(2)}`;
  if (contrastWarnCache.has(key)) return;

  if (contrastWarnCache.size >= CONTRAST_WARN_CACHE_LIMIT) {
    contrastWarnCache.clear();
  }
  contrastWarnCache.add(key);

  console.warn(
    `glaze: color "${name}" cannot meet contrast ${formatContrastTarget(
      target,
      targetRatio,
    )} in ${scheme} scheme (got ${actual.toFixed(2)}). ` +
      `Try widening the lightness window, lowering the contrast target, ` +
      `or picking a base color further from this color's lightness.`,
  );
}

// ============================================================================
// Shadow helpers
// ============================================================================

function isShadowDef(def: ColorDef): def is ShadowColorDef {
  return (def as ShadowColorDef).type === 'shadow';
}

function isMixDef(def: ColorDef): def is MixColorDef {
  return (def as MixColorDef).type === 'mix';
}

const DEFAULT_SHADOW_TUNING: Required<ShadowTuning> = {
  saturationFactor: 0.18,
  maxSaturation: 0.25,
  lightnessFactor: 0.25,
  lightnessBounds: [0.05, 0.2],
  minGapTarget: 0.05,
  alphaMax: 1.0,
  bgHueBlend: 0.2,
};

function resolveShadowTuning(perColor?: ShadowTuning): Required<ShadowTuning> {
  return {
    ...DEFAULT_SHADOW_TUNING,
    ...globalConfig.shadowTuning,
    ...perColor,
    lightnessBounds:
      perColor?.lightnessBounds ??
      globalConfig.shadowTuning?.lightnessBounds ??
      DEFAULT_SHADOW_TUNING.lightnessBounds,
  };
}

function circularLerp(a: number, b: number, t: number): number {
  let diff = b - a;
  if (diff > 180) diff -= 360;
  else if (diff < -180) diff += 360;
  return (((a + diff * t) % 360) + 360) % 360;
}

/**
 * Compute the canonical max-contrast reference t value for normalization.
 * Uses bg.l=1, fg.l=0, intensity=100 — the theoretical maximum.
 * This is a fixed constant per tuning configuration, ensuring uniform
 * scaling across all bg/fg pairs at low intensities.
 */
function computeRefT(tuning: Required<ShadowTuning>): number {
  const EPSILON = 1e-6;
  let lShRef = clamp(
    tuning.lightnessFactor,
    tuning.lightnessBounds[0],
    tuning.lightnessBounds[1],
  );
  lShRef = Math.max(Math.min(lShRef, 1 - tuning.minGapTarget), 0);
  const gapRef = Math.max(1 - lShRef, EPSILON);
  return 1 / gapRef;
}

function computeShadow(
  bg: ResolvedColorVariant,
  fg: ResolvedColorVariant | undefined,
  intensity: number,
  tuning: Required<ShadowTuning>,
): ResolvedColorVariant {
  const EPSILON = 1e-6;
  const clampedIntensity = clamp(intensity, 0, 100);
  const contrastWeight = fg ? Math.abs(bg.l - fg.l) : 1;
  const deltaL = (clampedIntensity / 100) * contrastWeight;

  const h = fg ? circularLerp(fg.h, bg.h, tuning.bgHueBlend) : bg.h;
  const s = fg
    ? Math.min(fg.s * tuning.saturationFactor, tuning.maxSaturation)
    : 0;

  let lSh = clamp(
    bg.l * tuning.lightnessFactor,
    tuning.lightnessBounds[0],
    tuning.lightnessBounds[1],
  );
  lSh = Math.max(Math.min(lSh, bg.l - tuning.minGapTarget), 0);

  const gap = Math.max(bg.l - lSh, EPSILON);
  const t = deltaL / gap;

  const tRef = computeRefT(tuning);
  const norm = Math.tanh(tRef / tuning.alphaMax);
  const alpha = Math.min(
    (tuning.alphaMax * Math.tanh(t / tuning.alphaMax)) / norm,
    tuning.alphaMax,
  );

  return { h, s, l: lSh, alpha };
}

// ============================================================================
// Validation
// ============================================================================

function validateColorDefs(
  defs: ColorMap,
  externalBases?: Map<string, ResolvedColor>,
): void {
  const localNames = new Set(Object.keys(defs));
  const allNames = new Set([
    ...localNames,
    ...(externalBases ? externalBases.keys() : []),
  ]);

  for (const [name, def] of Object.entries(defs)) {
    if (isShadowDef(def)) {
      if (!allNames.has(def.bg)) {
        throw new Error(
          `glaze: shadow "${name}" references non-existent bg "${def.bg}".`,
        );
      }
      if (localNames.has(def.bg) && isShadowDef(defs[def.bg])) {
        throw new Error(
          `glaze: shadow "${name}" bg "${def.bg}" references another shadow color.`,
        );
      }
      if (def.fg !== undefined) {
        if (!allNames.has(def.fg)) {
          throw new Error(
            `glaze: shadow "${name}" references non-existent fg "${def.fg}".`,
          );
        }
        if (localNames.has(def.fg) && isShadowDef(defs[def.fg])) {
          throw new Error(
            `glaze: shadow "${name}" fg "${def.fg}" references another shadow color.`,
          );
        }
      }
      continue;
    }

    if (isMixDef(def)) {
      if (!allNames.has(def.base)) {
        throw new Error(
          `glaze: mix "${name}" references non-existent base "${def.base}".`,
        );
      }
      if (!allNames.has(def.target)) {
        throw new Error(
          `glaze: mix "${name}" references non-existent target "${def.target}".`,
        );
      }
      if (localNames.has(def.base) && isShadowDef(defs[def.base])) {
        throw new Error(
          `glaze: mix "${name}" base "${def.base}" references a shadow color.`,
        );
      }
      if (localNames.has(def.target) && isShadowDef(defs[def.target])) {
        throw new Error(
          `glaze: mix "${name}" target "${def.target}" references a shadow color.`,
        );
      }
      continue;
    }

    const regDef = def as RegularColorDef;

    if (regDef.contrast !== undefined && !regDef.base) {
      throw new Error(`glaze: color "${name}" has "contrast" without "base".`);
    }

    if (
      regDef.lightness !== undefined &&
      !isAbsoluteLightness(regDef.lightness) &&
      !regDef.base
    ) {
      throw new Error(
        `glaze: color "${name}" has relative "lightness" without "base".`,
      );
    }

    if (regDef.base && !allNames.has(regDef.base)) {
      throw new Error(
        `glaze: color "${name}" references non-existent base "${regDef.base}".`,
      );
    }

    if (
      regDef.base &&
      localNames.has(regDef.base) &&
      isShadowDef(defs[regDef.base])
    ) {
      throw new Error(
        `glaze: color "${name}" base "${regDef.base}" references a shadow color.`,
      );
    }

    if (!isAbsoluteLightness(regDef.lightness) && regDef.base === undefined) {
      throw new Error(
        `glaze: color "${name}" must have either absolute "lightness" (root) or "base" (dependent).`,
      );
    }

    if (regDef.contrast !== undefined && regDef.opacity !== undefined) {
      console.warn(
        `glaze: color "${name}" has both "contrast" and "opacity". Opacity makes perceived lightness unpredictable.`,
      );
    }
  }

  // Check for circular references (follows base, bg, fg edges).
  // External bases are leaves (no outgoing edges in `defs`), so they can't
  // form a cycle and we short-circuit there.
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(name: string): void {
    if (!localNames.has(name)) return;
    if (inStack.has(name)) {
      throw new Error(
        `glaze: circular base reference detected involving "${name}".`,
      );
    }
    if (visited.has(name)) return;

    inStack.add(name);
    const def = defs[name];
    if (isShadowDef(def)) {
      dfs(def.bg);
      if (def.fg) dfs(def.fg);
    } else if (isMixDef(def)) {
      dfs(def.base);
      dfs(def.target);
    } else {
      const regDef = def as RegularColorDef;
      if (regDef.base) {
        dfs(regDef.base);
      }
    }
    inStack.delete(name);
    visited.add(name);
  }

  for (const name of localNames) {
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
    // External base references (not in `defs`) are leaves — they're already
    // pre-seeded into `ctx.resolved` and don't participate in the local sort.
    if (def === undefined) return;
    if (isShadowDef(def)) {
      visit(def.bg);
      if (def.fg) visit(def.fg);
    } else if (isMixDef(def)) {
      visit(def.base);
      visit(def.target);
    } else {
      const regDef = def as RegularColorDef;
      if (regDef.base) {
        visit(regDef.base);
      }
    }

    result.push(name);
  }

  for (const name of Object.keys(defs)) {
    visit(name);
  }

  return result;
}

// ============================================================================
// Lightness window selection
// ============================================================================

/**
 * Resolve the active lightness window for a scheme.
 * - HC variants always return `[0, 100]` (existing behavior, predates per-call overrides).
 * - Otherwise, per-call `scaling` (e.g. from `glaze.color()`'s third arg) wins;
 *   `false` is interpreted as `[0, 100]` (no remap). Falls back to `globalConfig.*Lightness`.
 */
function lightnessWindow(
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
  return kind === 'dark'
    ? globalConfig.darkLightness
    : globalConfig.lightLightness;
}

// ============================================================================
// Light scheme mapping
// ============================================================================

function mapLightnessLight(
  l: number,
  mode: AdaptationMode,
  isHighContrast: boolean,
  scaling?: GlazeColorScaling,
): number {
  if (mode === 'static') return l;
  const [lo, hi] = lightnessWindow(isHighContrast, 'light', scaling);
  return (l * (hi - lo)) / 100 + lo;
}

// ============================================================================
// Dark scheme mapping
// ============================================================================

function mobiusCurve(t: number, beta: number): number {
  if (beta >= 1) return t;
  return t / (t + beta * (1 - t));
}

function mapLightnessDark(
  l: number,
  mode: AdaptationMode,
  isHighContrast: boolean,
  scaling?: GlazeColorScaling,
): number {
  if (mode === 'static') return l;

  const beta = isHighContrast
    ? pairHC(globalConfig.darkCurve)
    : pairNormal(globalConfig.darkCurve);
  const [darkLo, darkHi] = lightnessWindow(isHighContrast, 'dark', scaling);

  if (mode === 'fixed') {
    return (l * (darkHi - darkLo)) / 100 + darkLo;
  }

  const [lightLo, lightHi] = lightnessWindow(isHighContrast, 'light', scaling);
  const lightL = (l * (lightHi - lightLo)) / 100 + lightLo;
  const t = (lightHi - lightL) / (lightHi - lightLo);
  return darkLo + (darkHi - darkLo) * mobiusCurve(t, beta);
}

function lightMappedToDark(
  lightL: number,
  isHighContrast: boolean,
  scaling?: GlazeColorScaling,
): number {
  const beta = isHighContrast
    ? pairHC(globalConfig.darkCurve)
    : pairNormal(globalConfig.darkCurve);
  const [lightLo, lightHi] = lightnessWindow(isHighContrast, 'light', scaling);
  const [darkLo, darkHi] = lightnessWindow(isHighContrast, 'dark', scaling);
  const clamped = clamp(lightL, lightLo, lightHi);
  const t = (lightHi - clamped) / (lightHi - lightLo);
  return darkLo + (darkHi - darkLo) * mobiusCurve(t, beta);
}

function mapSaturationDark(s: number, mode: AdaptationMode): number {
  if (mode === 'static') return s;
  return s * (1 - globalConfig.darkDesaturation);
}

function schemeLightnessRange(
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
  /**
   * Optional per-resolve scaling overrides for the lightness windows.
   * Used by `glaze.color()` to preserve light input by default while
   * still adapting dark to `globalConfig.darkLightness`.
   */
  scaling?: GlazeColorScaling;
}

function resolveRootColor(
  _name: string,
  def: RegularColorDef,
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
  def: RegularColorDef,
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

  const baseVariant = getSchemeVariant(baseResolved, isDark, isHighContrast);
  const baseL = baseVariant.l * 100;

  let preferredL: number;
  const rawLightness = def.lightness;

  if (rawLightness === undefined) {
    preferredL = baseL;
  } else {
    const rawValue = isHighContrast
      ? pairHC(rawLightness)
      : pairNormal(rawLightness);
    const parsed = parseRelativeOrAbsolute(rawValue);

    if (parsed.relative) {
      const delta = parsed.value;
      if (isDark && mode === 'auto') {
        const baseLightVariant = getSchemeVariant(
          baseResolved,
          false,
          isHighContrast,
        );
        const absoluteLightL = clamp(baseLightVariant.l * 100 + delta, 0, 100);
        preferredL = lightMappedToDark(
          absoluteLightL,
          isHighContrast,
          ctx.scaling,
        );
      } else {
        preferredL = clamp(baseL + delta, 0, 100);
      }
    } else {
      if (isDark) {
        preferredL = mapLightnessDark(
          parsed.value,
          mode,
          isHighContrast,
          ctx.scaling,
        );
      } else {
        preferredL = mapLightnessLight(
          parsed.value,
          mode,
          isHighContrast,
          ctx.scaling,
        );
      }
    }
  }

  const rawContrast = def.contrast;
  if (rawContrast !== undefined) {
    const minCr = isHighContrast
      ? pairHC(rawContrast)
      : pairNormal(rawContrast);

    const effectiveSat = isDark
      ? mapSaturationDark((satFactor * ctx.saturation) / 100, mode)
      : (satFactor * ctx.saturation) / 100;

    const baseLinearRgb = okhslToLinearSrgb(
      baseVariant.h,
      baseVariant.s,
      baseVariant.l,
    );

    const windowRange = schemeLightnessRange(
      isDark,
      mode,
      isHighContrast,
      ctx.scaling,
    );

    const result = findLightnessForContrast({
      hue: effectiveHue,
      saturation: effectiveSat,
      preferredLightness: clamp(
        preferredL / 100,
        windowRange[0],
        windowRange[1],
      ),
      baseLinearRgb,
      contrast: minCr,
      lightnessRange: [0, 1],
    });

    if (!result.met) {
      warnContrastUnmet(name, isDark, isHighContrast, minCr, result.contrast);
    }

    return { l: result.lightness * 100, satFactor };
  }

  return { l: clamp(preferredL, 0, 100), satFactor };
}

function getSchemeVariant(
  color: ResolvedColor,
  isDark: boolean,
  isHighContrast: boolean,
): ResolvedColorVariant {
  if (isDark && isHighContrast) return color.darkContrast;
  if (isDark) return color.dark;
  if (isHighContrast) return color.lightContrast;
  return color.light;
}

function resolveColorForScheme(
  name: string,
  def: ColorDef,
  ctx: ResolveContext,
  isDark: boolean,
  isHighContrast: boolean,
): ResolvedColorVariant {
  if (isShadowDef(def)) {
    return resolveShadowForScheme(def, ctx, isDark, isHighContrast);
  }

  if (isMixDef(def)) {
    return resolveMixForScheme(def, ctx, isDark, isHighContrast);
  }

  const regDef = def as RegularColorDef;
  const mode = regDef.mode ?? 'auto';
  const isRoot = isAbsoluteLightness(regDef.lightness) && !regDef.base;
  const effectiveHue = resolveEffectiveHue(ctx.hue, regDef.hue);

  let lightL: number;
  let satFactor: number;

  if (isRoot) {
    const root = resolveRootColor(name, regDef, ctx, isHighContrast);
    lightL = root.lightL;
    satFactor = root.satFactor;
  } else {
    const dep = resolveDependentColor(
      name,
      regDef,
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
    finalL = mapLightnessDark(lightL, mode, isHighContrast, ctx.scaling);
    finalSat = mapSaturationDark((satFactor * ctx.saturation) / 100, mode);
  } else if (isDark && !isRoot) {
    finalL = lightL;
    finalSat = mapSaturationDark((satFactor * ctx.saturation) / 100, mode);
  } else if (isRoot) {
    finalL = mapLightnessLight(lightL, mode, isHighContrast, ctx.scaling);
    finalSat = (satFactor * ctx.saturation) / 100;
  } else {
    finalL = lightL;
    finalSat = (satFactor * ctx.saturation) / 100;
  }

  return {
    h: effectiveHue,
    s: clamp(finalSat, 0, 1),
    l: clamp(finalL / 100, 0, 1),
    alpha: regDef.opacity ?? 1,
  };
}

function resolveShadowForScheme(
  def: ShadowColorDef,
  ctx: ResolveContext,
  isDark: boolean,
  isHighContrast: boolean,
): ResolvedColorVariant {
  const bgResolved = ctx.resolved.get(def.bg)!;
  const bgVariant = getSchemeVariant(bgResolved, isDark, isHighContrast);

  let fgVariant: ResolvedColorVariant | undefined;
  if (def.fg) {
    const fgResolved = ctx.resolved.get(def.fg)!;
    fgVariant = getSchemeVariant(fgResolved, isDark, isHighContrast);
  }

  const intensity = isHighContrast
    ? pairHC(def.intensity)
    : pairNormal(def.intensity);

  const tuning = resolveShadowTuning(def.tuning);
  return computeShadow(bgVariant, fgVariant, intensity, tuning);
}

function variantToLinearRgb(v: ResolvedColorVariant): LinearRgb {
  return okhslToLinearSrgb(v.h, v.s, v.l);
}

/**
 * Resolve hue for OKHSL mixing, handling achromatic colors.
 * When one color has no saturation, its hue is meaningless —
 * use the hue from the color that has saturation (matches CSS
 * color-mix "missing component" behavior).
 */
function mixHue(
  base: ResolvedColorVariant,
  target: ResolvedColorVariant,
  t: number,
): number {
  const SAT_EPSILON = 1e-6;
  const baseHasSat = base.s > SAT_EPSILON;
  const targetHasSat = target.s > SAT_EPSILON;

  if (baseHasSat && targetHasSat) return circularLerp(base.h, target.h, t);
  if (targetHasSat) return target.h;
  return base.h;
}

function linearSrgbLerp(
  base: LinearRgb,
  target: LinearRgb,
  t: number,
): LinearRgb {
  return [
    base[0] + (target[0] - base[0]) * t,
    base[1] + (target[1] - base[1]) * t,
    base[2] + (target[2] - base[2]) * t,
  ];
}

function linearRgbToVariant(rgb: LinearRgb): ResolvedColorVariant {
  const gamma: [number, number, number] = [
    Math.max(0, Math.min(1, sRGBLinearToGamma(rgb[0]))),
    Math.max(0, Math.min(1, sRGBLinearToGamma(rgb[1]))),
    Math.max(0, Math.min(1, sRGBLinearToGamma(rgb[2]))),
  ];
  const [h, s, l] = srgbToOkhsl(gamma);
  return { h, s, l, alpha: 1 };
}

function resolveMixForScheme(
  def: MixColorDef,
  ctx: ResolveContext,
  isDark: boolean,
  isHighContrast: boolean,
): ResolvedColorVariant {
  const baseResolved = ctx.resolved.get(def.base)!;
  const targetResolved = ctx.resolved.get(def.target)!;
  const baseVariant = getSchemeVariant(baseResolved, isDark, isHighContrast);
  const targetVariant = getSchemeVariant(
    targetResolved,
    isDark,
    isHighContrast,
  );

  const rawValue = isHighContrast ? pairHC(def.value) : pairNormal(def.value);
  let t = clamp(rawValue, 0, 100) / 100;

  const blend = def.blend ?? 'opaque';
  const space = def.space ?? 'okhsl';
  const baseLinear = variantToLinearRgb(baseVariant);
  const targetLinear = variantToLinearRgb(targetVariant);

  if (def.contrast !== undefined) {
    const minCr = isHighContrast
      ? pairHC(def.contrast)
      : pairNormal(def.contrast);

    let luminanceAt: (v: number) => number;

    if (blend === 'transparent') {
      luminanceAt = (v: number) =>
        gamutClampedLuminance(linearSrgbLerp(baseLinear, targetLinear, v));
    } else if (space === 'srgb') {
      luminanceAt = (v: number) =>
        gamutClampedLuminance(linearSrgbLerp(baseLinear, targetLinear, v));
    } else {
      luminanceAt = (v: number) => {
        const h = mixHue(baseVariant, targetVariant, v);
        const s = baseVariant.s + (targetVariant.s - baseVariant.s) * v;
        const l = baseVariant.l + (targetVariant.l - baseVariant.l) * v;
        return gamutClampedLuminance(okhslToLinearSrgb(h, s, l));
      };
    }

    const result = findValueForMixContrast({
      preferredValue: t,
      baseLinearRgb: baseLinear,
      targetLinearRgb: targetLinear,
      contrast: minCr,
      luminanceAtValue: luminanceAt,
    });
    t = result.value;
  }

  if (blend === 'transparent') {
    return {
      h: targetVariant.h,
      s: targetVariant.s,
      l: targetVariant.l,
      alpha: clamp(t, 0, 1),
    };
  }

  if (space === 'srgb') {
    const mixed = linearSrgbLerp(baseLinear, targetLinear, t);
    return linearRgbToVariant(mixed);
  }

  return {
    h: mixHue(baseVariant, targetVariant, t),
    s: clamp(baseVariant.s + (targetVariant.s - baseVariant.s) * t, 0, 1),
    l: clamp(baseVariant.l + (targetVariant.l - baseVariant.l) * t, 0, 1),
    alpha: 1,
  };
}

function resolveAllColors(
  hue: number,
  saturation: number,
  defs: ColorMap,
  scaling?: GlazeColorScaling,
  externalBases?: Map<string, ResolvedColor>,
): Map<string, ResolvedColor> {
  validateColorDefs(defs, externalBases);
  const order = topoSort(defs);

  const ctx: ResolveContext = {
    hue,
    saturation,
    defs,
    resolved: new Map(),
    scaling,
  };

  // Pre-seed externally-resolved bases. The per-pass `for (const name of order)`
  // loops below only iterate `defs` keys, so external entries persist across
  // all four passes and are read via `getSchemeVariant` per scheme.
  if (externalBases) {
    for (const [name, color] of externalBases) {
      ctx.resolved.set(name, color);
    }
  }

  function defMode(def: ColorDef): AdaptationMode | undefined {
    if (isShadowDef(def) || isMixDef(def)) return undefined;
    return (def as RegularColorDef).mode ?? 'auto';
  }

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
      mode: defMode(defs[name]),
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
      mode: defMode(defs[name]),
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
      mode: defMode(defs[name]),
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

function fmt(value: number, decimals: number): string {
  return parseFloat(value.toFixed(decimals)).toString();
}

function formatVariant(
  v: ResolvedColorVariant,
  format: GlazeColorFormat = 'okhsl',
): string {
  const base = formatters[format](v.h, v.s * 100, v.l * 100);
  if (v.alpha >= 1) return base;
  const closing = base.lastIndexOf(')');
  return `${base.slice(0, closing)} / ${fmt(v.alpha, 4)})`;
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
  defaultPrefix = false,
): string {
  const prefix = options?.prefix ?? defaultPrefix;
  if (prefix === true) {
    return `${themeName}-`;
  }
  if (typeof prefix === 'object' && prefix !== null) {
    return prefix[themeName] ?? `${themeName}-`;
  }
  return '';
}

function validatePrimaryTheme(
  primary: string | undefined,
  themes: PaletteInput,
): void {
  if (primary !== undefined && !(primary in themes)) {
    const available = Object.keys(themes).join(', ');
    throw new Error(
      `glaze: primary theme "${primary}" not found in palette. Available: ${available}.`,
    );
  }
}

/**
 * Resolve the effective primary for an export call.
 * `false` disables, a string overrides, `undefined` inherits from palette.
 */
function resolveEffectivePrimary(
  exportPrimary: string | false | undefined,
  palettePrimary: string | undefined,
): string | undefined {
  if (exportPrimary === false) return undefined;
  return exportPrimary ?? palettePrimary;
}

/**
 * Filter a resolved color map, skipping keys already in `seen`.
 * Warns on collision and keeps the first-written value (first-write-wins).
 * Returns a new map containing only non-colliding entries.
 */
function filterCollisions(
  resolved: Map<string, ResolvedColor>,
  prefix: string,
  seen: Map<string, string>,
  themeName: string,
  isPrimary?: boolean,
): Map<string, ResolvedColor> {
  const filtered = new Map<string, ResolvedColor>();
  const label = isPrimary ? `${themeName} (primary)` : themeName;

  for (const [name, color] of resolved) {
    const key = `${prefix}${name}`;
    if (seen.has(key)) {
      console.warn(
        `glaze: token "${key}" from theme "${label}" collides with theme "${seen.get(key)}" — skipping.`,
      );
      continue;
    }
    seen.set(key, label);
    filtered.set(name, color);
  }
  return filtered;
}

function createPalette(
  themes: PaletteInput,
  paletteOptions?: GlazePaletteOptions,
) {
  validatePrimaryTheme(paletteOptions?.primary, themes);

  return {
    tokens(
      options?: GlazeJsonOptions & GlazePaletteExportOptions,
    ): Record<string, Record<string, string>> {
      const effectivePrimary = resolveEffectivePrimary(
        options?.primary,
        paletteOptions?.primary,
      );
      if (options?.primary !== undefined) {
        validatePrimaryTheme(effectivePrimary, themes);
      }
      const modes = resolveModes(options?.modes);
      const allTokens: Record<string, Record<string, string>> = {};
      const seen = new Map<string, string>();

      for (const [themeName, theme] of Object.entries(themes)) {
        const resolved = theme.resolve();
        const prefix = resolvePrefix(options, themeName, true);
        const filtered = filterCollisions(resolved, prefix, seen, themeName);
        const tokens = buildFlatTokenMap(
          filtered,
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

        if (themeName === effectivePrimary) {
          const primaryFiltered = filterCollisions(
            resolved,
            '',
            seen,
            themeName,
            true,
          );
          const unprefixed = buildFlatTokenMap(
            primaryFiltered,
            '',
            modes,
            options?.format,
          );
          for (const variant of Object.keys(unprefixed)) {
            Object.assign(allTokens[variant]!, unprefixed[variant]);
          }
        }
      }

      return allTokens;
    },

    tasty(
      options?: GlazeTokenOptions & GlazePaletteExportOptions,
    ): Record<string, Record<string, string>> {
      const effectivePrimary = resolveEffectivePrimary(
        options?.primary,
        paletteOptions?.primary,
      );
      if (options?.primary !== undefined) {
        validatePrimaryTheme(effectivePrimary, themes);
      }
      const states = {
        dark: options?.states?.dark ?? globalConfig.states.dark,
        highContrast:
          options?.states?.highContrast ?? globalConfig.states.highContrast,
      };
      const modes = resolveModes(options?.modes);

      const allTokens: Record<string, Record<string, string>> = {};
      const seen = new Map<string, string>();

      for (const [themeName, theme] of Object.entries(themes)) {
        const resolved = theme.resolve();
        const prefix = resolvePrefix(options, themeName, true);
        const filtered = filterCollisions(resolved, prefix, seen, themeName);
        const tokens = buildTokenMap(
          filtered,
          prefix,
          states,
          modes,
          options?.format,
        );
        Object.assign(allTokens, tokens);

        if (themeName === effectivePrimary) {
          const primaryFiltered = filterCollisions(
            resolved,
            '',
            seen,
            themeName,
            true,
          );
          const unprefixed = buildTokenMap(
            primaryFiltered,
            '',
            states,
            modes,
            options?.format,
          );
          Object.assign(allTokens, unprefixed);
        }
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

    css(options?: GlazeCssOptions & GlazePaletteExportOptions): GlazeCssResult {
      const effectivePrimary = resolveEffectivePrimary(
        options?.primary,
        paletteOptions?.primary,
      );
      if (options?.primary !== undefined) {
        validatePrimaryTheme(effectivePrimary, themes);
      }
      const suffix = options?.suffix ?? '-color';
      const format = options?.format ?? 'rgb';

      const allLines: Record<keyof GlazeCssResult, string[]> = {
        light: [],
        dark: [],
        lightContrast: [],
        darkContrast: [],
      };
      const seen = new Map<string, string>();

      for (const [themeName, theme] of Object.entries(themes)) {
        const resolved = theme.resolve();
        const prefix = resolvePrefix(options, themeName, true);
        const filtered = filterCollisions(resolved, prefix, seen, themeName);

        const css = buildCssMap(filtered, prefix, suffix, format);

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

        if (themeName === effectivePrimary) {
          const primaryFiltered = filterCollisions(
            resolved,
            '',
            seen,
            themeName,
            true,
          );
          const unprefixed = buildCssMap(primaryFiltered, '', suffix, format);
          for (const key of [
            'light',
            'dark',
            'lightContrast',
            'darkContrast',
          ] as const) {
            if (unprefixed[key]) {
              allLines[key].push(unprefixed[key]);
            }
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

/**
 * Matches the CSS color functions Glaze itself emits (`rgb()`, `hsl()`,
 * `okhsl()`, `oklch()`) plus their legacy alpha aliases (`rgba()`, `hsla()`).
 *
 * Only bare numeric components are supported. Named colors (`red`),
 * relative-color syntax (`from <color> ...`), and angle units other
 * than bare degrees (`deg` is the only suffix tolerated by `parseFloat`)
 * are out of scope.
 */
const COLOR_FN_RE = /^(rgba?|hsla?|okhsl|oklch)\(\s*([^)]*)\s*\)$/i;

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
      'glaze.color: OkhslColor s/l must be in 0–1 range. Did you mean the structured form { hue, saturation, lightness } (which uses 0–100)?',
    );
  }
}

/**
 * Validate a user-supplied `[r, g, b]` tuple in 0-255.
 */
function validateRgbTuple(value: readonly [number, number, number]): void {
  for (const n of value) {
    if (!Number.isFinite(n) || n < 0 || n > 255) {
      throw new Error(
        `glaze.color: RGB tuple components must be finite numbers in 0–255 (got [${value.join(', ')}]).`,
      );
    }
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
 * `saturation` / `lightness` numerics (and any HC-pair second value)
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
  const checkLightness = (value: number, label: string): void => {
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new Error(
        `glaze.color: structured ${label} must be a finite number in 0–100 (got ${value}).`,
      );
    }
  };
  if (Array.isArray(input.lightness)) {
    checkLightness(input.lightness[0], 'lightness[normal]');
    checkLightness(input.lightness[1], 'lightness[hc]');
  } else {
    checkLightness(input.lightness, 'lightness');
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
 * RGB tuple) go through one parser.
 */
function extractOkhslFromValue(value: GlazeColorValue): OkhslColor {
  if (typeof value === 'string') return parseColorString(value);
  if (Array.isArray(value)) {
    const tuple = value as readonly [number, number, number];
    validateRgbTuple(tuple);
    const [r, g, b] = tuple;
    const [h, s, l] = srgbToOkhsl([r / 255, g / 255, b / 255]);
    return { h, s, l };
  }
  validateOkhslColor(value as OkhslColor);
  return value as OkhslColor;
}

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
 * across every value-shorthand form. String inputs pair with the
 * extended dark window so a totally-black input renders as totally-white
 * in dark mode; `OkhslColor` / RGB-tuple inputs auto-adapt into the
 * snapshotted `globalConfig.lightLightness` / `globalConfig.darkLightness`
 * windows.
 *
 * When the user requests `contrast` or relative `lightness`, a hidden
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

  const lightnessOption = options?.lightness;
  const hasExternalBase = options?.base !== undefined;
  // Seed-anchor synthesis only kicks in when the user did NOT supply their
  // own base — in that case `contrast` and relative `lightness` anchor to
  // the literal seed via the hidden `STANDALONE_SEED` def.
  const needsSeedAnchor =
    !hasExternalBase &&
    (options?.contrast !== undefined ||
      (lightnessOption !== undefined && !isAbsoluteLightness(lightnessOption)));

  if (options?.opacity !== undefined)
    validateStandaloneOpacity(options.opacity);

  // User-supplied `name` becomes the def key (and surfaces in error / warn
  // messages). It must not collide with internal reserved names; we throw
  // a clear error rather than silently shadowing them.
  const userName = options?.name;
  if (userName !== undefined) validateStandaloneName(userName);
  const primary = userName ?? STANDALONE_VALUE;

  const valueDef: RegularColorDef = {
    hue: relativeHue,
    saturation: options?.saturationFactor,
    lightness: lightnessOption ?? main.l * 100,
    contrast: options?.contrast,
    mode: options?.mode ?? 'auto',
    opacity: options?.opacity,
    base: hasExternalBase
      ? STANDALONE_BASE
      : needsSeedAnchor
        ? STANDALONE_SEED
        : undefined,
  };

  const defs: ColorMap = { [primary]: valueDef };

  if (needsSeedAnchor) {
    // `saturation: 1` is the default factor; combined with seedSaturation
    // = main.s * 100, the seed renders at exactly the user-provided color.
    defs[STANDALONE_SEED] = {
      hue: main.h,
      saturation: 1,
      lightness: main.l * 100,
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
  effectiveScaling: GlazeColorScaling,
  baseToken: GlazeColorToken | undefined,
  exportData: () => GlazeColorTokenExport,
): GlazeColorToken {
  // Cache the resolve result across token / tasty / json / css / resolve calls.
  // The base token's `.resolve()` is called lazily on first resolve and the
  // result is captured by reference, so subsequent base mutations don't apply
  // (matches the existing snapshot semantics for `scaling.darkLightness`).
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
      effectiveScaling,
      externalBases,
    );
    return cached;
  };

  const resolveStates = (options?: GlazeTokenOptions) => ({
    dark: options?.states?.dark ?? globalConfig.states.dark,
    highContrast:
      options?.states?.highContrast ?? globalConfig.states.highContrast,
  });

  const tokenLike = (options?: GlazeTokenOptions): Record<string, string> => {
    const tokenMap = buildTokenMap(
      resolveOnce(),
      '',
      resolveStates(options),
      resolveModes(options?.modes),
      options?.format,
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
      const jsonMap = buildJsonMap(
        resolveOnce(),
        resolveModes(options?.modes),
        options?.format,
      );
      return jsonMap[primary];
    },

    css(options: GlazeColorCssOptions): GlazeCssResult {
      const renamed = new Map<string, ResolvedColor>([
        [options.name, resolveOnce().get(primary)!],
      ]);
      return buildCssMap(
        renamed,
        '',
        options.suffix ?? '-color',
        options.format ?? 'rgb',
      );
    },

    export: exportData,
  };
}

/**
 * Resolve `base` (which may be a token reference or a raw color value)
 * into a `GlazeColorToken`. Raw values are auto-wrapped via
 * `glaze.color(value)` so they pick up the same auto-invert defaults as
 * an explicit wrap. Returns `undefined` when no base is provided.
 */
function resolveBaseToken(
  base: GlazeColorToken | GlazeColorValue | undefined,
): GlazeColorToken | undefined {
  if (base === undefined) return undefined;
  if (isGlazeColorToken(base)) return base;
  return createColorTokenFromValue(base, undefined, undefined);
}

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
  if (options.lightness !== undefined) out.lightness = options.lightness;
  if (options.saturationFactor !== undefined) {
    out.saturationFactor = options.saturationFactor;
  }
  if (options.mode !== undefined) out.mode = options.mode;
  if (options.contrast !== undefined) out.contrast = options.contrast;
  if (options.opacity !== undefined) out.opacity = options.opacity;
  if (options.name !== undefined) out.name = options.name;
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
    lightness: input.lightness,
  };
  if (input.saturationFactor !== undefined) {
    out.saturationFactor = input.saturationFactor;
  }
  if (input.mode !== undefined) out.mode = input.mode;
  if (input.opacity !== undefined) out.opacity = input.opacity;
  if (input.contrast !== undefined) out.contrast = input.contrast;
  if (input.name !== undefined) out.name = input.name;
  if (input.base !== undefined) {
    out.base = isGlazeColorToken(input.base) ? input.base.export() : input.base;
  }
  return out;
}

function createColorToken(
  input: GlazeColorInput,
  scaling: GlazeColorScaling | undefined,
): GlazeColorToken {
  validateStructuredInput(input);

  const userName = input.name;
  if (userName !== undefined) validateStandaloneName(userName);
  const primary = userName ?? STANDALONE_VALUE;

  const baseToken = resolveBaseToken(input.base);
  const hasExternalBase = baseToken !== undefined;
  // Mirror value-form behavior: when `contrast` is provided without an
  // external base, synthesize a hidden static seed so contrast anchors
  // against the input's own normal-mode lightness.
  const needsSeedAnchor = !hasExternalBase && input.contrast !== undefined;

  const defs: ColorMap = {
    [primary]: {
      lightness: input.lightness,
      saturation: input.saturationFactor,
      mode: input.mode ?? 'auto',
      contrast: input.contrast,
      opacity: input.opacity,
      base: hasExternalBase
        ? STANDALONE_BASE
        : needsSeedAnchor
          ? STANDALONE_SEED
          : undefined,
    },
  };

  if (needsSeedAnchor) {
    defs[STANDALONE_SEED] = {
      lightness: pairNormal(input.lightness),
      saturation: 1,
      mode: 'static',
    };
  }

  // Structured form uses the same snapshotted default as object / tuple
  // value-shorthand: both light and dark windows come from `globalConfig`,
  // captured at create time. With the default `mode: 'auto'` this matches
  // the behavior of an ordinary theme color (Möbius-inverted in dark).
  const effectiveScaling: GlazeColorScaling =
    scaling ?? defaultStandaloneScaling(false);

  const exportData = (): GlazeColorTokenExport => ({
    form: 'structured',
    input: buildStructuredInputExport(input),
    scaling: effectiveScaling,
  });

  return createColorTokenFromDefs(
    input.hue,
    input.saturation,
    defs,
    primary,
    effectiveScaling,
    baseToken,
    exportData,
  );
}

function createColorTokenFromValue(
  value: GlazeColorValue,
  options: GlazeColorOverrides | undefined,
  scaling: GlazeColorScaling | undefined,
): GlazeColorToken {
  const inputIsString = typeof value === 'string';
  const main = extractOkhslFromValue(value);
  const baseToken = resolveBaseToken(options?.base);
  const { seedHue, seedSaturation, defs, primary } = buildStandaloneValueDefs(
    main,
    options,
  );
  // Default scaling is snapshotted from `globalConfig` at create time:
  //   - String inputs (typical end-user values from a color picker / theme
  //     setting) default to "light preserves input, dark Möbius-inverts up
  //     to 100" so the natural `#000` ↔ `#fff` flip works out of the box.
  //   - Object / tuple inputs default to the full `globalConfig.lightLightness`
  //     / `globalConfig.darkLightness` windows — same as a theme color and
  //     same as the structured form.
  // Both forms freeze the windows at create time so later `glaze.configure()`
  // calls don't retroactively change exported tokens.
  const effectiveScaling: GlazeColorScaling =
    scaling ?? defaultStandaloneScaling(inputIsString);

  const exportData = (): GlazeColorTokenExport => ({
    form: 'value',
    input: value,
    ...(options !== undefined
      ? { overrides: buildOverridesExport(options) }
      : {}),
    scaling: effectiveScaling,
  });

  return createColorTokenFromDefs(
    seedHue,
    seedSaturation,
    defs,
    primary,
    effectiveScaling,
    baseToken,
    exportData,
  );
}

/**
 * Rehydrate a token from its `.export()` snapshot. Recursively rebuilds
 * any base dependency. Inverse of `GlazeColorToken.export()`.
 */
function colorFromExport(data: GlazeColorTokenExport): GlazeColorToken {
  // Shape guard: rehydration takes untrusted JSON (localStorage, URL,
  // remote API), so a corrupted blob shouldn't blow up deep inside the
  // resolver with confusing errors.
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
    return createColorTokenFromValue(value, overrides, data.scaling);
  }
  const input = rehydrateStructuredInput(data.input as GlazeColorInputExport);
  return createColorToken(input, data.scaling);
}

function rehydrateOverrides(
  data: GlazeColorOverridesExport,
): GlazeColorOverrides {
  const out: GlazeColorOverrides = {};
  if (data.hue !== undefined) out.hue = data.hue;
  if (data.saturation !== undefined) out.saturation = data.saturation;
  if (data.lightness !== undefined) out.lightness = data.lightness;
  if (data.saturationFactor !== undefined) {
    out.saturationFactor = data.saturationFactor;
  }
  if (data.mode !== undefined) out.mode = data.mode;
  if (data.contrast !== undefined) out.contrast = data.contrast;
  if (data.opacity !== undefined) out.opacity = data.opacity;
  if (data.name !== undefined) out.name = data.name;
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
    lightness: data.lightness,
  };
  if (data.saturationFactor !== undefined) {
    out.saturationFactor = data.saturationFactor;
  }
  if (data.mode !== undefined) out.mode = data.mode;
  if (data.opacity !== undefined) out.opacity = data.opacity;
  if (data.contrast !== undefined) out.contrast = data.contrast;
  if (data.name !== undefined) out.name = data.name;
  if (data.base !== undefined) {
    out.base = isExportedToken(data.base)
      ? colorFromExport(data.base)
      : data.base;
  }
  return out;
}

/**
 * Discriminate a `GlazeColorTokenExport` from a raw `GlazeColorValue`.
 * `GlazeColorTokenExport` always has a `form` field set to either
 * `'value'` or `'structured'`; raw values never do.
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
    lightLightness: config.lightLightness ?? globalConfig.lightLightness,
    darkLightness: config.darkLightness ?? globalConfig.darkLightness,
    darkDesaturation: config.darkDesaturation ?? globalConfig.darkDesaturation,
    darkCurve: config.darkCurve ?? globalConfig.darkCurve,
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
    shadowTuning: config.shadowTuning ?? globalConfig.shadowTuning,
  };
};

/**
 * Compose multiple themes into a palette.
 */
glaze.palette = function palette(
  themes: PaletteInput,
  options?: GlazePaletteOptions,
) {
  return createPalette(themes, options);
};

/**
 * Create a theme from a serialized export.
 */
glaze.from = function from(data: GlazeThemeExport): GlazeTheme {
  return createTheme(data.hue, data.saturation, data.colors);
};

function isStructuredColorInput(
  input: GlazeColorInput | GlazeColorValue,
): input is GlazeColorInput {
  return (
    typeof input === 'object' &&
    input !== null &&
    !Array.isArray(input) &&
    'hue' in input &&
    'lightness' in input
  );
}

/**
 * Create a standalone single-color token.
 *
 * Two overloads:
 * - `glaze.color(input, scaling?)` — structured form:
 *   `{ hue, saturation, lightness, ... }` plus an optional per-call
 *   lightness-window override.
 * - `glaze.color(value, overrides?, scaling?)` — value-shorthand: a hex
 *   string (3/6/8 digits), one of the CSS color functions Glaze itself
 *   emits (`rgb()`, `hsl()`, `okhsl()`, `oklch()`), an `OkhslColor`
 *   object `{ h, s, l }` (0–1 ranges), or an `[r, g, b]` (0–255) tuple.
 *
 * Defaults: every input form defaults to `mode: 'auto'` so colors
 * automatically adapt between light and dark like an ordinary theme
 * color. The scaling snapshot taken at create time differs by input
 * form:
 * - String value-shorthand: `{ lightLightness: false, darkLightness:
 *   [globalConfig.darkLightness[0], 100] }`. Light preserves the input
 *   exactly; dark Möbius-inverts up to 100, so `glaze.color('#000')`
 *   renders as `#fff` in dark mode (and `glaze.color('#fff')` falls to
 *   the dark `lo` floor).
 * - `OkhslColor` object / RGB-tuple / structured value-shorthand:
 *   `{ lightLightness: globalConfig.lightLightness, darkLightness:
 *   globalConfig.darkLightness }` — both windows come straight from
 *   `globalConfig`, so the resulting token behaves like a theme color.
 *
 * Pass `{ mode: 'fixed' }` to opt back into the legacy linear, non-
 * inverting mapping, or `{ mode: 'static' }` to pin the same lightness
 * across every variant.
 *
 * Relative `lightness: '+N'` and `contrast: <ratio>` are anchored to
 * the literal seed (the value passed in) by default, pinned at
 * `mode: 'static'` across all four variants. Pass `overrides.base` (a
 * `GlazeColorToken`) to anchor `contrast` and relative `lightness`
 * against another color's resolved variant per scheme instead. Relative
 * `hue: '+N'` always anchors to the seed.
 *
 * Alpha components in `rgba()` / `hsla()` / slash-alpha syntax and
 * 8-digit hex are parsed but dropped with a `console.warn`.
 */
glaze.color = function color(
  input: GlazeColorInput | GlazeColorValue,
  arg2?: GlazeColorOverrides | GlazeColorScaling,
  arg3?: GlazeColorScaling,
): GlazeColorToken {
  if (isStructuredColorInput(input)) {
    return createColorToken(input, arg2 as GlazeColorScaling | undefined);
  }
  return createColorTokenFromValue(
    input,
    arg2 as GlazeColorOverrides | undefined,
    arg3,
  );
} as {
  (input: GlazeColorInput, scaling?: GlazeColorScaling): GlazeColorToken;
  (
    value: GlazeColorValue,
    overrides?: GlazeColorOverrides,
    scaling?: GlazeColorScaling,
  ): GlazeColorToken;
};

/**
 * Compute a shadow color from a bg/fg pair and intensity.
 *
 * Both `bg` and `fg` accept any `GlazeColorValue` form: hex (`#rgb` /
 * `#rrggbb` / `#rrggbbaa`), `rgb()` / `hsl()` / `okhsl()` / `oklch()`
 * strings, `OkhslColor` objects, or `[r, g, b]` (0–255) tuples.
 */
glaze.shadow = function shadow(input: GlazeShadowInput): ResolvedColorVariant {
  const bg = extractOkhslFromValue(input.bg as GlazeColorValue);
  const fg = input.fg
    ? extractOkhslFromValue(input.fg as GlazeColorValue)
    : undefined;
  const tuning = resolveShadowTuning(input.tuning);
  return computeShadow(
    { ...bg, alpha: 1 },
    fg ? { ...fg, alpha: 1 } : undefined,
    input.intensity,
    tuning,
  );
};

/**
 * Format a resolved color variant as a CSS string.
 */
glaze.format = function format(
  variant: ResolvedColorVariant,
  colorFormat?: GlazeColorFormat,
): string {
  return formatVariant(variant, colorFormat);
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
 * Rehydrate a `glaze.color()` token from a `.export()` snapshot.
 *
 * The snapshot is a plain JSON-safe object containing the original
 * input value, overrides (with any `base` token recursively serialized),
 * and the captured scaling. The reconstructed token is identical in
 * behavior to the original at the time of export.
 *
 * @example
 * ```ts
 * const text = glaze.color('#1a1a1a', { contrast: 'AA' });
 * const data = text.export();           // JSON-safe
 * localStorage.setItem('text', JSON.stringify(data));
 * // ...later...
 * const restored = glaze.colorFrom(JSON.parse(localStorage.getItem('text')!));
 * ```
 */
glaze.colorFrom = function colorFrom(
  data: GlazeColorTokenExport,
): GlazeColorToken {
  return colorFromExport(data);
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
    lightLightness: [10, 100],
    darkLightness: [15, 95],
    darkDesaturation: 0.1,
    darkCurve: 0.5,
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
