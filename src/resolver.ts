/**
 * Color resolution engine.
 *
 * Runs the four-pass solver (light → light-HC → dark → dark-HC) that
 * turns a `ColorMap` into a fully resolved `ResolvedColor` per name — or,
 * under a manual `contrastLevel`, a two-pass solver (light → dark) whose
 * authored HC pairs, tone window, and contrast targets are interpolated at
 * that level and whose high-contrast slots mirror the normal ones.
 * Owns the per-scheme resolve helpers for regular, shadow, and mix
 * color defs.
 *
 * Variants are stored in OKHST: `h` / `s` are OKHSL hue/saturation and
 * `t` is the canonical contrast-uniform tone (0–1, reference eps). The
 * resolver works in tone for regular colors and converts to/from OKHSL
 * lightness only at the mix/shadow and luminance edges.
 *
 * Every function receives a single `GlazeConfigResolved` so the full
 * per-instance config (including overrides) is available without
 * re-reading the global singleton mid-resolve.
 */

import {
  okhslToLinearSrgb,
  sRGBLinearToGamma,
  srgbToOkhsl,
} from './okhsl-color-math';
import {
  findToneForContrast,
  findValueForMixContrast,
  metricLuminance,
  resolveContrastForLevel,
  resolveContrastForMode,
} from './contrast-solver';
import type { LinearRgb, ResolvedContrast } from './contrast-solver';
import {
  PAIR_SWITCH,
  clamp,
  contrastFraction,
  numberAt,
  pairHC,
  pairNormal,
  parseToneValue,
  parseToneValueAt,
  resolveEffectiveHue,
} from './hc-pair';
import {
  inferRoleFromName,
  normalizeRole,
  oppositeRole,
  roleToPolarity,
} from './roles';
import {
  computeShadow,
  circularLerp,
  isMixDef,
  isShadowDef,
  resolveShadowTuning,
} from './shadow';
import {
  fromTone,
  mapSaturationDark,
  mapToneForScheme,
  okhslToOkhst,
  schemeToneRange,
  toTone,
  variantToOkhsl,
} from './okhst';
import { extractOkhslFromValue } from './color-value';
import { hasAbsoluteTone, topoSort, validateColorDefs } from './validation';
import { warnContrastUnmet, warnContrastDrift } from './warnings';
import type {
  AdaptationMode,
  ColorDef,
  ColorMap,
  ContrastSpec,
  GlazeConfigResolved,
  GlazeThemeSeed,
  HCPair,
  MixColorDef,
  RegularColorDef,
  ResolvedColor,
  ResolvedColorVariant,
  Role,
  ShadowColorDef,
  ToneValue,
} from './types';

export interface ResolveContext extends GlazeThemeSeed {
  defs: ColorMap;
  resolved: Map<string, ResolvedColor>;
  /** Fully-merged effective config for this resolve pass. */
  config: GlazeConfigResolved;
  /** Per-name role memo (filled lazily by `resolveRole`). */
  roles: Map<string, Role>;
}

type ResolvedField = 'light' | 'dark' | 'lightContrast' | 'darkContrast';

/** An OKHSL-lightness-shaped variant used at the mix/shadow edge. */
interface OkhslVariant {
  h: number;
  s: number;
  l: number;
  alpha: number;
  /** Carried from the resolved variant so edge conversions reuse the right gamut. */
  pastel?: boolean;
}

export function getSchemeVariant(
  color: ResolvedColor,
  isDark: boolean,
  isHighContrast: boolean,
): ResolvedColorVariant {
  if (isDark && isHighContrast) return color.darkContrast;
  if (isDark) return color.dark;
  if (isHighContrast) return color.lightContrast;
  return color.light;
}

/** Edge adapter: resolved variant (`t`) → OKHSL-lightness variant. */
function toOkhslVariant(v: ResolvedColorVariant): OkhslVariant {
  const c = variantToOkhsl(v);
  return { h: c.h, s: c.s, l: c.l, alpha: v.alpha, pastel: v.pastel };
}

/** Edge adapter: OKHSL-lightness variant → resolved variant (`t`). */
function toToneVariant(v: OkhslVariant): ResolvedColorVariant {
  const c = okhslToOkhst({ h: v.h, s: v.s, l: v.l });
  return { h: c.h, s: c.s, t: c.t, alpha: v.alpha };
}

// ============================================================================
// Role resolution
// ============================================================================

/**
 * Resolve the role of a base color referenced by `baseName`, returning the
 * role the *dependent* color should take (the opposite of the base's role).
 * A base that lives in `defs` recursively resolves and is inverted via
 * `oppositeRole`; an external base (no local def, e.g. an injected standalone
 * token) is treated as a background, so the dependent defaults to foreground
 * (`'text'`).
 */
function resolveBaseRoleInMap(
  baseName: string | undefined,
  defs: ColorMap,
  inferRole: boolean,
  roles: Map<string, Role>,
): Role | undefined {
  if (!baseName) return undefined;
  const baseDef = defs[baseName];
  if (!baseDef) return 'text';
  return oppositeRole(
    resolveRoleInMap(baseName, baseDef, defs, inferRole, roles),
  );
}

/**
 * Role-resolution core that does not need a full `ResolveContext`. Shared by
 * the resolver (via `resolveRole`) and `verifyContrastDrift`.
 */
function resolveRoleInMap(
  name: string,
  def: ColorDef,
  defs: ColorMap,
  inferRole: boolean,
  roles: Map<string, Role>,
): Role {
  const cached = roles.get(name);
  if (cached) return cached;

  let role: Role | undefined;
  if (isShadowDef(def)) {
    role = 'surface';
  } else if (isMixDef(def)) {
    role =
      normalizeRole(def.role) ??
      (inferRole ? inferRoleFromName(name) : undefined) ??
      resolveBaseRoleInMap(def.base, defs, inferRole, roles) ??
      'text';
  } else {
    const regDef = def as RegularColorDef;
    role =
      normalizeRole(regDef.role) ??
      (inferRole ? inferRoleFromName(name) : undefined) ??
      resolveBaseRoleInMap(regDef.base, defs, inferRole, roles) ??
      'text';
  }

  const finalRole = role ?? 'text';
  roles.set(name, finalRole);
  return finalRole;
}

/**
 * Resolve a color's semantic `role` (text / surface / border) per the chain:
 *   1. explicit `def.role` (normalized)
 *   2. inferred from the color name when `config.inferRole` is on
 *   3. opposite of the base's role
 *   4. `'text'` (foreground) default
 *
 * Memoized on `ctx.roles` so the four scheme passes share one resolution.
 * Shadows have no contrast participation and default to `'surface'`.
 */
function resolveRole(name: string, def: ColorDef, ctx: ResolveContext): Role {
  return resolveRoleInMap(name, def, ctx.defs, ctx.config.inferRole, ctx.roles);
}

function resolveContrastSpec(
  spec: HCPair<ContrastSpec>,
  isHighContrast: boolean,
  config: GlazeConfigResolved,
  polarity?: 'fg' | 'bg',
): ResolvedContrast {
  if (!isHighContrast && contrastFraction(config) !== undefined) {
    // A defined fraction proves the level is a finite number, not `'auto'`.
    return resolveContrastForLevel(
      spec,
      config.contrastLevel as number,
      polarity,
    );
  }
  const outerExplicitHC = Array.isArray(spec);
  const outer = isHighContrast ? pairHC(spec) : pairNormal(spec);
  return resolveContrastForMode(
    outer,
    isHighContrast,
    polarity,
    outerExplicitHC,
  );
}

/**
 * The authored tone for this pass: the pair's own entry in `'auto'` mode, or
 * the manual-level interpolation. Returns the parsed struct so the `kind` —
 * which selects the branch in `resolveDependentColor` — is fixed here once.
 */
function passTone(
  tone: HCPair<ToneValue>,
  isHighContrast: boolean,
  config: GlazeConfigResolved,
): { kind: 'absolute' | 'relative' | 'extreme'; value: number } {
  const f = contrastFraction(config);
  return f === undefined || isHighContrast
    ? parseToneValue(isHighContrast ? pairHC(tone) : pairNormal(tone))
    : parseToneValueAt(tone, f);
}

/** The authored numeric pair for this pass (shadow `intensity`, mix `value`). */
function passNumber(
  p: HCPair<number>,
  isHighContrast: boolean,
  config: GlazeConfigResolved,
): number {
  const f = contrastFraction(config);
  if (f === undefined || isHighContrast) {
    return isHighContrast ? pairHC(p) : pairNormal(p);
  }
  return numberAt(p, f);
}

/**
 * Apply the relative-tone delta against a base, honoring `flip`.
 *
 * When `flip` is on and `base + delta` falls outside `[0, 100]`, try mirroring
 * the delta to the other side of the base. If the mirrored target is also out
 * of range, keep the original delta so the caller clamps on the authored side.
 * When off, the caller clamps as usual.
 */
function applyToneFlip(delta: number, baseTone: number, flip: boolean): number {
  if (!flip) return delta;
  const target = baseTone + delta;
  if (target >= 0 && target <= 100) return delta;
  const mirrored = baseTone - delta;
  if (mirrored >= 0 && mirrored <= 100) return -delta;
  return delta;
}

/**
 * Dark position for an extreme tone (`'max'` / `'min'`) anchored to a base.
 *
 * A windowed dark remap compresses the base→extreme span, so the pair loses
 * contrast in dark. Instead, measure the tone shift the light scheme applied
 * between the base and the extreme, then replay it against the base's dark
 * tone: `auto` mirrors the sign (both ends invert), `fixed` keeps it. The
 * result is clamped to `[0, 100]` only — crossing the dark tone window is
 * intended, since the author asked for the extreme.
 */
function extremeDarkTone(
  authorTone: number,
  mode: AdaptationMode,
  isHighContrast: boolean,
  baseResolved: ResolvedColor,
  config: GlazeConfigResolved,
): number {
  const extremeLightTone = mapToneForScheme(
    authorTone,
    mode,
    false,
    isHighContrast,
    config,
  );
  const lightBase = getSchemeVariant(baseResolved, false, isHighContrast);
  const darkBase = getSchemeVariant(baseResolved, true, isHighContrast);
  const shift = extremeLightTone - lightBase.t * 100;
  return clamp(darkBase.t * 100 + (mode === 'auto' ? -shift : shift), 0, 100);
}

/**
 * Hue, absolute saturation (0–1) and tone (0–100) read off a color def's `from`.
 *
 * Memoized on the def object: a single resolve pass reads it once per scheme per
 * color, and the parse is pure, so the cache is a `WeakMap` keyed by the def
 * itself rather than a per-pass structure that would have to be threaded around.
 */
const fromSeeds = new WeakMap<
  RegularColorDef,
  { hue: number; saturation: number; tone: number }
>();

function fromSeed(
  def: RegularColorDef,
): { hue: number; saturation: number; tone: number } | undefined {
  if (def.from === undefined) return undefined;

  const cached = fromSeeds.get(def);
  if (cached) return cached;

  // `toTone` already returns the 0–100 tone; `s` stays the OKHSL 0–1 saturation
  // the resolver emits.
  const { h, s, l } = extractOkhslFromValue(def.from);
  const seed = { hue: h, saturation: s, tone: toTone(l) };

  fromSeeds.set(def, seed);

  return seed;
}

/**
 * The config this color resolves against.
 *
 * A `from` color carries a literal value, so its light variant has to survive
 * the light tone window intact — hence a local `lightTone: false`, the same
 * default the value-shorthand form of `glaze.color()` applies. Only the light
 * window is dropped: dark and high contrast keep theirs, because that is where
 * the color is expected to adapt.
 */
function configForColor(
  def: RegularColorDef,
  config: GlazeConfigResolved,
): GlazeConfigResolved {
  if (def.from === undefined) return config;

  return { ...config, lightTone: false };
}

function resolveRootColor(
  def: RegularColorDef,
  isHighContrast: boolean,
  config: GlazeConfigResolved,
): number {
  // Root tone is absolute or extreme ('max' = 100, 'min' = 0); both flow
  // through mapToneForScheme (and invert in dark under mode 'auto').
  if (def.tone === undefined) return clamp(fromSeed(def)!.tone, 0, 100);

  const parsed = passTone(def.tone, isHighContrast, config);
  return clamp(parsed.value, 0, 100);
}

/**
 * Effective hue and saturation for one color in one scheme.
 *
 * Dark schemes read the dark seed pair and the color's `darkHue` /
 * `darkSaturation`, each falling back to its light counterpart. An explicit
 * dark saturation — on the seed or the def — is taken literally; the global
 * `darkDesaturation` reduction applies only when neither is authored.
 * `mode: 'static'` pins one value across every scheme, so it skips all of it.
 *
 * Shared by `resolveColorForScheme` (the emitted variant) and
 * `resolveDependentColor` (the contrast solver's inputs) so the solver always
 * measures the color it is actually going to produce.
 */
function resolveChannels(
  def: RegularColorDef,
  ctx: ResolveContext,
  isDark: boolean,
): { hue: number; saturation: number } {
  const mode = def.mode ?? 'auto';
  const satFactor = clamp(def.saturation ?? 1, 0, 1);

  // A `from` color carries its own hue and an ABSOLUTE saturation, so it stands
  // outside the seed entirely: the theme seed is a ceiling for every other color
  // (`saturation` is a 0–1 factor of it), and a literal color has to be able to
  // exceed it or the caller would have to re-seed the theme to be honored.
  // An explicit `hue` / `saturation` on the same def still wins — those are the
  // more specific instruction, and `saturation` keeps its factor-of-seed meaning.
  const seed = fromSeed(def);
  const fromHue =
    seed !== undefined && def.hue === undefined ? seed.hue : undefined;
  const fromSaturation =
    seed !== undefined && def.saturation === undefined
      ? seed.saturation
      : undefined;

  if (!isDark || mode === 'static') {
    return {
      hue: fromHue ?? resolveEffectiveHue(ctx.hue, def.hue),
      saturation:
        fromSaturation ?? clamp((satFactor * ctx.saturation) / 100, 0, 1),
    };
  }

  const darkSeedSaturation = ctx.darkSaturation ?? ctx.saturation;
  const darkFactor = clamp(def.darkSaturation ?? satFactor, 0, 1);
  const explicitDark =
    def.darkSaturation !== undefined || ctx.darkSaturation !== undefined;
  // Dark keeps the color's own saturation as its starting point too, but unlike
  // light it is still subject to `darkDesaturation` — dark is where the color is
  // allowed to move, so the global haircut applies as it does to any other color.
  const raw =
    fromSaturation !== undefined && def.darkSaturation === undefined
      ? fromSaturation
      : (darkFactor * darkSeedSaturation) / 100;

  return {
    hue:
      fromHue !== undefined && def.darkHue === undefined
        ? fromHue
        : resolveEffectiveHue(ctx.darkHue ?? ctx.hue, def.darkHue ?? def.hue),
    saturation: clamp(
      explicitDark ? raw : mapSaturationDark(raw, mode, ctx.config),
      0,
      1,
    ),
  };
}

function resolveDependentColor(
  name: string,
  def: RegularColorDef,
  ctx: ResolveContext,
  isHighContrast: boolean,
  isDark: boolean,
  channels: { hue: number; saturation: number },
  polarity: 'fg' | 'bg',
  effectivePastel: boolean,
): number {
  const baseName = def.base!;
  const baseResolved = ctx.resolved.get(baseName);
  if (!baseResolved) {
    throw new Error(
      `glaze: base "${baseName}" not yet resolved for "${name}".`,
    );
  }

  const mode = def.mode ?? 'auto';
  const flip = def.autoFlip ?? ctx.config.autoFlip;
  const pastel = effectivePastel;
  const config = configForColor(def, ctx.config);

  const baseVariant = getSchemeVariant(baseResolved, isDark, isHighContrast);
  const baseTone = baseVariant.t * 100;

  let preferredTone: number;
  let isExtreme = false;
  // A `from` color with no authored `tone` is placed at the tone it carries —
  // not at its base's, which is what an ordinary dependent color would inherit.
  const seed = fromSeed(def);
  const rawTone: HCPair<ToneValue> | undefined =
    def.tone ?? (seed !== undefined ? seed.tone : undefined);

  if (rawTone === undefined) {
    preferredTone = baseTone;
  } else {
    const parsed = passTone(rawTone, isHighContrast, config);

    if (parsed.kind === 'relative') {
      if (isDark && mode === 'auto') {
        const baseLightVariant = getSchemeVariant(
          baseResolved,
          false,
          isHighContrast,
        );
        const baseLightTone = baseLightVariant.t * 100;
        const absoluteLightTone = clamp(
          baseLightTone + applyToneFlip(parsed.value, baseLightTone, flip),
          0,
          100,
        );
        // Invert + remap the base-anchored light tone into the dark window,
        // exactly like an absolute author tone under `mode: 'auto'`.
        preferredTone = mapToneForScheme(
          absoluteLightTone,
          'auto',
          true,
          isHighContrast,
          config,
        );
      } else {
        const delta = applyToneFlip(parsed.value, baseTone, flip);
        preferredTone = clamp(baseTone + delta, 0, 100);
      }
    } else {
      // Absolute or extreme ('max' = 100, 'min' = 0).
      isExtreme = parsed.kind === 'extreme';
      if (isExtreme && isDark && mode !== 'static') {
        // Replay the light-scheme shift so the base/extreme pair keeps its
        // contrast instead of being squeezed by the dark window.
        preferredTone = extremeDarkTone(
          parsed.value,
          mode,
          isHighContrast,
          baseResolved,
          config,
        );
      } else {
        preferredTone = mapToneForScheme(
          parsed.value,
          mode,
          isDark,
          isHighContrast,
          config,
        );
      }
    }
  }

  const rawContrast = def.contrast;
  if (rawContrast !== undefined) {
    const resolvedContrast = resolveContrastSpec(
      rawContrast,
      isHighContrast,
      config,
      polarity,
    );

    const baseOkhsl = toOkhslVariant(baseVariant);
    const baseLinearRgb = okhslToLinearSrgb(
      baseOkhsl.h,
      baseOkhsl.s,
      baseOkhsl.l,
      baseVariant.pastel ?? ctx.config.pastel,
    );

    // An extreme keeps its own position — clamping it back into the scheme
    // window would undo the shift the extreme asked for.
    const preferredRange = isExtreme
      ? ([0, 1] as const)
      : schemeToneRange(isDark, mode, isHighContrast, config);

    let initialDirection: 'lighter' | 'darker' | undefined;
    if (preferredTone < baseTone) {
      initialDirection = 'darker';
    } else if (preferredTone > baseTone) {
      initialDirection = 'lighter';
    }

    const solve = {
      hue: channels.hue,
      saturation: channels.saturation,
      preferredTone: clamp(
        preferredTone / 100,
        preferredRange[0],
        preferredRange[1],
      ),
      baseLinearRgb,
      toneRange: [0, 1] as [number, number],
      flip,
      pastel,
    };

    // Under a manual contrast level, pin which side of the base the color sits
    // on so a slider can't send it leaping across its own base.
    //
    // `autoFlip`'s tie-break is unstable along a ramp: when both sides meet the
    // floor it takes whichever lands nearer the anchor, and which side that is
    // shifts as the target grows. So the side is decided once — by a probe solve
    // at the *nearer endpoint's* target — and then preferred at every level in
    // that half of the ramp via `preferInitial`.
    //
    // Anchoring to the nearer endpoint is what keeps levels 0 and 100
    // bit-identical to the classic normal / high-contrast output: at an endpoint
    // the probe solves the very problem that pass would solve, so it reproduces
    // that side. `flip` stays on, so a pinned side that physically cannot reach
    // the target still falls back to the opposite one and the floor is met.
    // A color whose two endpoints genuinely disagree therefore changes side at
    // most once, at level 50 — the same place every other un-interpolable
    // decision switches.
    const level = contrastFraction(ctx.config);
    let preferInitial = false;
    if (level !== undefined && level > 0 && level < 1) {
      const probe = findToneForContrast({
        ...solve,
        contrast: resolveContrastForLevel(
          rawContrast,
          level < PAIR_SWITCH ? 0 : 100,
          polarity,
        ),
        initialDirection,
      });
      initialDirection = probe.tone * 100 < baseTone ? 'darker' : 'lighter';
      preferInitial = true;
    }

    const result = findToneForContrast({
      ...solve,
      contrast: resolvedContrast,
      initialDirection,
      preferInitial,
    });

    if (!result.met) {
      warnContrastUnmet(
        name,
        isDark,
        isHighContrast,
        resolvedContrast,
        result.contrast,
      );
    }

    return result.tone * 100;
  }

  return clamp(preferredTone, 0, 100);
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
    return resolveMixForScheme(name, def, ctx, isDark, isHighContrast);
  }

  const regDef = def as RegularColorDef;
  const mode = regDef.mode ?? 'auto';
  // `from` supplies an absolute tone, so a color that carries one is a root even
  // with no authored `tone` — same as any other absolutely-placed color.
  const isRoot = hasAbsoluteTone(regDef) && !regDef.base;
  const channels = resolveChannels(regDef, ctx, isDark);
  const role = resolveRole(name, def, ctx);
  const polarity = roleToPolarity(role);
  const pastel = regDef.pastel ?? ctx.config.pastel;
  const config = configForColor(regDef, ctx.config);

  const finalTone = isRoot
    ? mapToneForScheme(
        resolveRootColor(regDef, isHighContrast, config),
        mode,
        isDark,
        isHighContrast,
        config,
      )
    : resolveDependentColor(
        name,
        regDef,
        ctx,
        isHighContrast,
        isDark,
        channels,
        polarity,
        pastel,
      );

  return {
    h: channels.hue,
    s: channels.saturation,
    t: clamp(finalTone / 100, 0, 1),
    alpha: regDef.opacity ?? 1,
    pastel,
  };
}

function resolveShadowForScheme(
  def: ShadowColorDef,
  ctx: ResolveContext,
  isDark: boolean,
  isHighContrast: boolean,
): ResolvedColorVariant {
  const bgResolved = ctx.resolved.get(def.bg)!;
  const bgVariant = toOkhslVariant(
    getSchemeVariant(bgResolved, isDark, isHighContrast),
  );

  let fgVariant: OkhslVariant | undefined;
  if (def.fg) {
    const fgResolved = ctx.resolved.get(def.fg)!;
    fgVariant = toOkhslVariant(
      getSchemeVariant(fgResolved, isDark, isHighContrast),
    );
  }

  const intensity = passNumber(def.intensity, isHighContrast, ctx.config);

  const tuning = resolveShadowTuning(def.tuning, ctx.config.shadowTuning);
  return {
    ...toToneVariant(computeShadow(bgVariant, fgVariant, intensity, tuning)),
    pastel: def.pastel ?? ctx.config.pastel,
  };
}

function okhslVariantToLinearRgb(v: OkhslVariant, pastel: boolean): LinearRgb {
  return okhslToLinearSrgb(v.h, v.s, v.l, pastel);
}

/**
 * Resolve hue for OKHSL mixing, handling achromatic colors.
 * When one color has no saturation, its hue is meaningless —
 * use the hue from the color that has saturation (matches CSS
 * color-mix "missing component" behavior).
 */
function mixHue(base: OkhslVariant, target: OkhslVariant, t: number): number {
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

function linearRgbToToneVariant(
  rgb: LinearRgb,
  pastel: boolean,
): ResolvedColorVariant {
  const gamma: [number, number, number] = [
    Math.max(0, Math.min(1, sRGBLinearToGamma(rgb[0]))),
    Math.max(0, Math.min(1, sRGBLinearToGamma(rgb[1]))),
    Math.max(0, Math.min(1, sRGBLinearToGamma(rgb[2]))),
  ];
  const [h, s, l] = srgbToOkhsl(gamma, pastel);
  return toToneVariant({ h, s, l, alpha: 1 });
}

function resolveMixForScheme(
  name: string,
  def: MixColorDef,
  ctx: ResolveContext,
  isDark: boolean,
  isHighContrast: boolean,
): ResolvedColorVariant {
  const baseResolved = ctx.resolved.get(def.base)!;
  const targetResolved = ctx.resolved.get(def.target)!;
  const baseVariant = toOkhslVariant(
    getSchemeVariant(baseResolved, isDark, isHighContrast),
  );
  const targetVariant = toOkhslVariant(
    getSchemeVariant(targetResolved, isDark, isHighContrast),
  );

  const rawValue = passNumber(def.value, isHighContrast, ctx.config);
  let t = clamp(rawValue, 0, 100) / 100;

  const blend = def.blend ?? 'opaque';
  const space = def.space ?? 'okhsl';
  const role = resolveRole(name, def, ctx);
  const polarity = roleToPolarity(role);
  const pastel = def.pastel ?? ctx.config.pastel;
  const baseLinear = okhslVariantToLinearRgb(
    baseVariant,
    baseVariant.pastel ?? ctx.config.pastel,
  );
  const targetLinear = okhslVariantToLinearRgb(
    targetVariant,
    targetVariant.pastel ?? ctx.config.pastel,
  );

  if (def.contrast !== undefined) {
    const resolvedContrast = resolveContrastSpec(
      def.contrast,
      isHighContrast,
      ctx.config,
      polarity,
    );
    const metric = resolvedContrast.metric;

    let luminanceAt: (v: number) => number;

    if (blend === 'transparent' || space === 'srgb') {
      luminanceAt = (v: number) =>
        metricLuminance(metric, linearSrgbLerp(baseLinear, targetLinear, v));
    } else {
      luminanceAt = (v: number) => {
        const h = mixHue(baseVariant, targetVariant, v);
        const s = baseVariant.s + (targetVariant.s - baseVariant.s) * v;
        const l = baseVariant.l + (targetVariant.l - baseVariant.l) * v;
        return metricLuminance(metric, okhslToLinearSrgb(h, s, l, pastel));
      };
    }

    const result = findValueForMixContrast({
      preferredValue: t,
      baseLinearRgb: baseLinear,
      targetLinearRgb: targetLinear,
      contrast: resolvedContrast,
      luminanceAtValue: luminanceAt,
      flip: ctx.config.autoFlip,
    });
    t = result.value;
  }

  if (blend === 'transparent') {
    return {
      ...toToneVariant({
        h: targetVariant.h,
        s: targetVariant.s,
        l: targetVariant.l,
        alpha: clamp(t, 0, 1),
      }),
      pastel,
    };
  }

  if (space === 'srgb') {
    const mixed = linearSrgbLerp(baseLinear, targetLinear, t);
    return { ...linearRgbToToneVariant(mixed, pastel), pastel };
  }

  return {
    ...toToneVariant({
      h: mixHue(baseVariant, targetVariant, t),
      s: clamp(baseVariant.s + (targetVariant.s - baseVariant.s) * t, 0, 1),
      l: clamp(baseVariant.l + (targetVariant.l - baseVariant.l) * t, 0, 1),
      alpha: 1,
    }),
    pastel,
  };
}

function defMode(def: ColorDef): AdaptationMode | undefined {
  if (isShadowDef(def) || isMixDef(def)) return undefined;
  return (def as RegularColorDef).mode ?? 'auto';
}

/**
 * Run a single resolve pass over all local names. Pass 1 lazily creates
 * each `ResolvedColor` (all four slots seeded with the just-resolved
 * variant) the first time it sees a name; later passes update the
 * `target` slot on the existing record.
 */
function runPass(
  order: string[],
  defs: ColorMap,
  ctx: ResolveContext,
  isDark: boolean,
  isHighContrast: boolean,
  target: ResolvedField,
): Map<string, ResolvedColorVariant> {
  const out = new Map<string, ResolvedColorVariant>();
  for (const name of order) {
    const variant = resolveColorForScheme(
      name,
      defs[name],
      ctx,
      isDark,
      isHighContrast,
    );
    out.set(name, variant);
    const existing = ctx.resolved.get(name);
    if (existing) {
      ctx.resolved.set(name, { ...existing, [target]: variant });
    } else {
      ctx.resolved.set(name, {
        name,
        light: variant,
        dark: variant,
        lightContrast: variant,
        darkContrast: variant,
        mode: defMode(defs[name]),
      });
    }
  }
  return out;
}

/**
 * Re-seed a single variant slot with a previously-resolved map so the
 * upcoming pass reads sensible fallbacks via `getSchemeVariant`.
 */
function seedField(
  order: string[],
  ctx: ResolveContext,
  field: ResolvedField,
  source: Map<string, ResolvedColorVariant>,
): void {
  for (const name of order) {
    const existing = ctx.resolved.get(name)!;
    ctx.resolved.set(name, { ...existing, [field]: source.get(name)! });
  }
}

/**
 * After the passes, surface chromatic contrast drift (§10): a color
 * resolved with a `base` + `contrast` may land slightly under the contrast
 * its tone implies because chromatic luminance drifts from the gray tone.
 *
 * Under a manual `contrastLevel` only the two emitted variants are checked
 * (the high-contrast slots are mirrors), and the spec is resolved at the level
 * so the check measures the output against the target it was actually solved
 * for.
 */
function verifyContrastDrift(
  order: string[],
  defs: ColorMap,
  result: Map<string, ResolvedColor>,
  config: GlazeConfigResolved,
): void {
  const roles = new Map<string, Role>();
  for (const name of order) {
    const def = defs[name];
    if (isShadowDef(def) || isMixDef(def)) continue;
    const regDef = def as RegularColorDef;
    if (regDef.contrast === undefined || !regDef.base) continue;
    const color = result.get(name);
    const base = result.get(regDef.base);
    if (!color || !base) continue;

    const role = resolveRoleInMap(name, def, defs, config.inferRole, roles);
    const polarity = roleToPolarity(role);

    const schemes: {
      isDark: boolean;
      isHighContrast: boolean;
      field: ResolvedField;
    }[] = [
      { isDark: false, isHighContrast: false, field: 'light' },
      { isDark: false, isHighContrast: true, field: 'lightContrast' },
      { isDark: true, isHighContrast: false, field: 'dark' },
      { isDark: true, isHighContrast: true, field: 'darkContrast' },
    ];
    const manual = contrastFraction(config) !== undefined;

    for (const s of schemes) {
      // Manual mode mirrors the high-contrast slots and never emits them.
      if (manual && s.isHighContrast) continue;
      const spec = resolveContrastSpec(
        regDef.contrast,
        s.isHighContrast,
        config,
        polarity,
      );
      const cVariant = color[s.field];
      const bVariant = base[s.field];
      const cOkhsl = toOkhslVariant(cVariant);
      const bOkhsl = toOkhslVariant(bVariant);
      // Measure in the spec's metric basis so the APCA warning compares APCA
      // luminances, not WCAG ones. Each variant carries its own effective
      // pastel flag so the gamut mapping matches what the resolver applied;
      // fall back to the config default for any variant without one.
      const cPastel = cVariant.pastel ?? config.pastel;
      const bPastel = bVariant.pastel ?? config.pastel;
      const yC = metricLuminance(
        spec.metric,
        okhslToLinearSrgb(cOkhsl.h, cOkhsl.s, cOkhsl.l, cPastel),
      );
      const yB = metricLuminance(
        spec.metric,
        okhslToLinearSrgb(bOkhsl.h, bOkhsl.s, bOkhsl.l, bPastel),
      );
      warnContrastDrift(name, s.isDark, s.isHighContrast, spec, yC, yB);
    }
  }
}

export function resolveAllColors(
  seed: GlazeThemeSeed,
  defs: ColorMap,
  config: GlazeConfigResolved,
  externalBases?: Map<string, ResolvedColor>,
): Map<string, ResolvedColor> {
  validateColorDefs(defs, externalBases);
  const order = topoSort(defs);

  const ctx: ResolveContext = {
    ...seed,
    defs,
    resolved: new Map(),
    config,
    roles: new Map(),
  };

  // Pre-seed externally-resolved bases. The per-pass loops iterate only
  // `defs` keys (via `order`), so external entries persist across all
  // four passes and are read via `getSchemeVariant` per scheme.
  if (externalBases) {
    for (const [name, color] of externalBases) {
      ctx.resolved.set(name, color);
    }
  }

  // Under a manual contrast level the normal passes already resolve *at* that
  // level, so the two high-contrast passes are skipped and their slots mirror
  // the normal ones. Level 100 stays bit-identical to the high-contrast passes:
  // within a pass a dependent reads its base's same slot (topo order), and the
  // only cross-scheme reads — the relative-tone dark branch and
  // `extremeDarkTone` — read `light`, which equals `lightContrast` at 100.
  const manual = contrastFraction(config) !== undefined;

  // Pass 1: Light (normal, or at the level).
  const lightMap = runPass(order, defs, ctx, false, false, 'light');

  // Pass 2: Light high-contrast.
  let lightHCMap = lightMap;
  if (!manual) {
    seedField(order, ctx, 'lightContrast', lightMap);
    lightHCMap = runPass(order, defs, ctx, false, true, 'lightContrast');
  }

  // Pass 3: Dark (normal, or at the level).
  seedField(order, ctx, 'dark', lightMap);
  seedField(order, ctx, 'darkContrast', lightHCMap);
  const darkMap = runPass(order, defs, ctx, true, false, 'dark');

  // Pass 4: Dark high-contrast.
  let darkHCMap = darkMap;
  if (!manual) {
    seedField(order, ctx, 'darkContrast', darkMap);
    darkHCMap = runPass(order, defs, ctx, true, true, 'darkContrast');
  }

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

  verifyContrastDrift(order, defs, result, config);

  return result;
}

// Re-export for callers that previously imported tone helpers from here.
export { fromTone, toTone };
