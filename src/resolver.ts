/**
 * Color resolution engine.
 *
 * Runs the four-pass solver (light → light-HC → dark → dark-HC) that
 * turns a `ColorMap` into a fully resolved `ResolvedColor` per name. A manual
 * `contrastLevel` interpolates the authored HC pairs, tone window, and contrast
 * targets at that level for the two *normal* passes only; the high-contrast
 * passes bypass the level entirely, so the high-contrast slots are the same
 * values `'auto'` resolves. At level 100 the normal passes already are the
 * high-contrast ones, so the solver drops to two passes (light → dark) and
 * mirrors the slots. Owns the per-scheme resolve helpers for regular, shadow /
 * glow, and mix color defs.
 *
 * In dark, an `auto` tone delta (`'+N'` / `'-N'`) steps from where its base
 * sits on the authored scale in that pass (`darkAnchor`, memoized per pass):
 * the authored tone for an `auto` base placed by a tone or a chain of `auto`
 * deltas, or — for a base whose dark tone is not an inverted authored one: a
 * `fixed` / `static` color, or one solved, mixed, or replayed (an `auto`
 * extreme) — its own dark tone taken back through the dark window. So a dark
 * delta lands where the same authored tone would, on every base: the dark
 * window's scale times the delta at the reference dark eps (exact in high
 * contrast), along the dark window's own curve under a custom one, mirrored
 * around wherever the base sits even when the base itself doesn't invert. The
 * flip is still decided on the base's light tone, so
 * dark mirrors the side light took, and a step that runs off the authored
 * scale from its anchor (past 0 or 100) stops at the dark window's edge — at
 * either end, for a base anchored at its own dark tone. A base sitting past the
 * window (pushed by a contrast floor or an extreme, or placed there as a fixed
 * / static color) is stepped from where it sits, and a step pointing further
 * out stops at the base (`stepFromAnchor`). External
 * `glaze.color()` bases supply their own anchor (`darkAnchorOf`).
 *
 * Variants are stored in OKHST: `h` / `s` are OKHSL hue/saturation and
 * `t` is the canonical contrast-uniform tone (0–1, reference eps). The
 * resolver works in tone for regular colors and converts to/from OKHSL
 * lightness only at the mix / shadow / glow and luminance edges. A glow whose
 * step crosses white with `headroom` above 0 also carries `hdr` — its opaque
 * base in OKHST plus an exposure in stops — and swaps the SDR shortfall
 * warning for one that fires only when the headroom cap falls short. HDR
 * values never feed another color: nothing may build on a glow.
 *
 * Every function receives a single `GlazeConfigResolved` so the full
 * per-instance config (including overrides) is available without
 * re-reading the global singleton mid-resolve.
 */

import {
  compositeOverGamma,
  okhslToLinearSrgb,
  sRGBLinearToGamma,
  srgbToOkhsl,
  toDisplayGamma,
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
  hcMirrorsNormal,
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
  circularLerp,
  computeLighting,
  isLightingDef,
  isMixDef,
  resolveLightingTuning,
  toResolvedHdr,
} from './lighting';
import {
  REF_EPS,
  fromTone,
  mapDarkToneUnclamped,
  mapSaturationDark,
  mapToneForScheme,
  normalizeToneWindow,
  okhslToOkhst,
  sameDarkWindow,
  schemeToneRange,
  toTone,
  unmapDarkTone,
  variantToOkhsl,
} from './okhst';
import { extractOkhslFromValue } from './color-value';
import { hasAbsoluteTone, topoSort, validateColorDefs } from './validation';
import {
  warnContrastUnmet,
  warnContrastDrift,
  warnLightingShortfall,
  warnMixContrastUnmet,
} from './warnings';
import type {
  AdaptationMode,
  ColorDef,
  ColorMap,
  ContrastSpec,
  GlazeConfigResolved,
  GlazeThemeSeed,
  GlowColorDef,
  HCPair,
  MixColorDef,
  RegularColorDef,
  ResolvedColor,
  ResolvedColorVariant,
  Role,
  ShadowColorDef,
  ToneValue,
} from './types';

/** Where a color sits on the authored scale in one pass (see `darkAnchor`). */
interface DarkAnchor {
  /**
   * The anchor tone (0–100; a color sitting past the dark window — solved,
   * replayed, or a fixed / static color — leaves it).
   */
  tone: number;
  /**
   * The tone comes from the light side alone — an `auto` tone or a chain of
   * `auto` deltas on one — so it equals the light tone wherever the light
   * window is the identity.
   */
  lightSide: boolean;
}

/**
 * Defs anchored at their authored tone whatever their mode (see `darkAnchor`).
 * A `glaze.color()` token's hidden seed is `static` only so that its token's
 * `contrast` floor measures against the literal input; a delta on it still
 * steps in dark like one on an `auto` color authored at that tone.
 */
const authoredToneAnchors = new WeakSet<ColorDef>();

/**
 * Anchor `def` at its authored tone in dark, whatever its mode (internal, for
 * a token's hidden seed; see `authoredToneAnchors`).
 */
export function anchorAtAuthoredTone<T extends ColorDef>(def: T): T {
  authoredToneAnchors.add(def);
  return def;
}

/**
 * The base of a tone-less, contrast-less `auto` color, which takes its base's
 * dark anchor as is; `undefined` for any other def.
 */
function aliasBaseOf(def: ColorDef | undefined): string | undefined {
  if (def === undefined || isMixDef(def) || isLightingDef(def)) {
    return undefined;
  }
  const regDef = def as RegularColorDef;
  if (
    (regDef.mode ?? 'auto') !== 'auto' ||
    regDef.contrast !== undefined ||
    regDef.tone !== undefined ||
    regDef.from !== undefined
  ) {
    return undefined;
  }
  return regDef.base;
}

/**
 * An external base's dark-delta anchor for one pass, read in the base's own
 * resolve context (see `darkAnchorOf`), with the config it was read under.
 */
export interface ExternalDarkAnchor {
  tone: number;
  /** The base's effective config, whose dark window placed the base. */
  config: GlazeConfigResolved;
}

/**
 * An external base's dark-delta anchor for one pass, supplied by the base's
 * own `glaze.color()` token (internal).
 */
export type DarkAnchorHook = (isHighContrast: boolean) => ExternalDarkAnchor;

export interface ResolveContext extends GlazeThemeSeed {
  defs: ColorMap;
  resolved: Map<string, ResolvedColor>;
  /** Fully-merged effective config for this resolve pass. */
  config: GlazeConfigResolved;
  /** Per-name role memo (filled lazily by `resolveRole`). */
  roles: Map<string, Role>;
  /**
   * `unmetKey` of every regular-color variant whose contrast solve came back
   * unmet, so `verifyContrastDrift` doesn't repeat the solver's warning.
   */
  unmet: Set<string>;
  /** Per-name `darkAnchor` memo for the normal and high-contrast passes. */
  anchors: [Map<string, DarkAnchor>, Map<string, DarkAnchor>];
  /** Dark-delta anchors of external bases, supplied by their own tokens. */
  externalAnchors?: Map<string, DarkAnchorHook>;
}

/** The part of a `ResolveContext` that `darkAnchor` reads. */
type AnchorContext = Pick<
  ResolveContext,
  'defs' | 'resolved' | 'config' | 'anchors' | 'externalAnchors'
>;

type ResolvedField = 'light' | 'dark' | 'lightContrast' | 'darkContrast';

/** An OKHSL-lightness-shaped variant used at the mix / shadow / glow edge. */
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
  if (isLightingDef(def)) {
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
 * Shadows and glows have no contrast participation and default to `'surface'`.
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

/** The authored numeric pair for this pass (shadow / glow `intensity`, mix `value`). */
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
 * Deliberately not memoized. Keying a cache on the def object looks free — a
 * resolve reads this a handful of times per color — but defs are stored by
 * reference, so mutating one in place and re-setting it would invalidate the
 * theme's own cache while a def-keyed cache quietly served the old color. The
 * parse is a few microseconds against a resolve that is already cached; that is
 * not a trade worth a staleness bug.
 */
function fromSeed(
  def: RegularColorDef,
): { hue: number; saturation: number; tone: number } | undefined {
  if (def.from === undefined) return undefined;

  // `toTone` already returns the 0–100 tone; `s` stays the OKHSL 0–1 saturation
  // the resolver emits.
  const { h, s, l } = extractOkhslFromValue(def.from);

  return { hue: h, saturation: s, tone: toTone(l) };
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
  // Dark keeps the color's own saturation as its starting point too, but unlike
  // light it is still subject to `darkDesaturation` — dark is where the color is
  // allowed to move, so the global haircut applies as it does to any other color.
  const fromDark =
    fromSaturation !== undefined && def.darkSaturation === undefined;
  const raw = fromDark
    ? fromSaturation
    : (darkFactor * darkSeedSaturation) / 100;
  // A theme-level `darkSaturation` only counts as "authored" for a color that
  // actually reads the seed. A `from` color does not, so letting the theme's
  // value suppress the haircut here would leave the same color MORE saturated in
  // dark than it is in a theme that never set one.
  const explicitDark = fromDark
    ? false
    : def.darkSaturation !== undefined || ctx.darkSaturation !== undefined;

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

/**
 * Whether a light-side anchor reads the stored light tone in this pass: high
 * contrast or a level at 100 at the reference light eps, where the light window
 * bypasses to the full range and is the identity. Those passes have always
 * stepped dark deltas from the light tone, so reading it as stored keeps them
 * bit-identical (recomputing the authored tone differs by float noise, which
 * can flip a tie-broken contrast solve). A normal pass has always read the
 * authored tone as is, so it keeps doing so even where its window is the
 * identity too (`lightTone: false` / `[0, 100]`). Read off the theme's config,
 * not a color's: a `from` color drops its own light window.
 */
function readsStoredLightTone(
  isHighContrast: boolean,
  config: GlazeConfigResolved,
): boolean {
  if (normalizeToneWindow(config.lightTone).eps !== REF_EPS) return false;
  return isHighContrast || hcMirrorsNormal(config);
}

/**
 * Where a step of `delta` from `anchor` lands on the authored scale: clamped to
 * `0–100`, widened to reach an anchor past the dark window (a base a contrast
 * floor, an extreme's replay, or its own fixed / static placement put there).
 * A step back toward the scale then moves by the full delta, and one that
 * points further out stops at the anchor — the base itself — instead of
 * snapping back to the window's edge. Either way a step stops at the window's
 * edge or at its base, whichever is further out, so the result moves
 * continuously as the base crosses the edge.
 */
function stepFromAnchor(anchor: number, delta: number): number {
  return clamp(anchor + delta, Math.min(0, anchor), Math.max(100, anchor));
}

/**
 * Where a color sits on the authored `0–100` tone scale in one pass: the tone
 * an `auto` color would be authored at to land where this one sits in dark. In
 * dark, an `auto` tone delta steps from its base's anchor, so the dark step is
 * the dark window's scale times the delta on every base.
 *
 * - An `auto` color placed by a tone (a root, an absolute tone, a `from` value,
 *   an extreme with no base) returns that tone as authored for the pass.
 * - An `auto` tone delta returns its base's anchor plus the delta
 *   (`stepFromAnchor`), flipped exactly as the light pass flipped it on the
 *   base's light tone, so a chain of deltas steps evenly. An `auto` color with
 *   no tone of its own returns its base's.
 * - Any other color — one whose dark tone is not the inversion of an authored
 *   tone: a `fixed` / `static` color (which keeps its side, or rides its base
 *   with its delta's sign kept), an `auto` contrast-solved color, an `auto`
 *   extreme on a base (which replays its light shift), a mix — returns its own
 *   dark tone taken back through the dark window (`unmapDarkTone`). So an
 *   `auto` dependent mirrors around wherever its base sits in dark, inverting
 *   per its own mode. That falls outside `0–100` when the color sits past the
 *   window; a step from it stays off the scale until it comes back
 *   (`stepFromAnchor`, `mapDarkToneUnclamped`), so it does not snap to the
 *   window's edge.
 * - An external base (a `glaze.color()` link) supplies its own anchor, read in
 *   its own resolve context (`ctx.externalAnchors`), when its active dark window
 *   is this pass's. A base under another dark window — or one with no hook — is
 *   read back through this pass's dark window, so a `'+0'` lands on it and the
 *   step is this window's scale times the delta.
 * - A token's hidden seed (`anchorAtAuthoredTone`) is `static`, but returns its
 *   tone as authored, like an `auto` color placed by a tone, so a delta on it
 *   inverts in dark as it would from the same color in a theme.
 *
 * In high contrast and at `contrastLevel: 100` at the reference light eps
 * (`readsStoredLightTone`), a light-side color's light tone *is* its authored
 * tone, so it is read as stored. That keeps those passes bit-identical to the
 * light-tone anchor they have always used, as a normal pass stays on the
 * authored tone it has always used.
 *
 * Memoized per resolve and pass on `ctx.anchors`, so a long chain of deltas
 * resolves in linear time without deep recursion: the dark passes run in topo
 * order, so a base's anchor is cached before its dependents ask for it. A
 * tone-less alias never asks for its own, so a chain of aliases is walked in a
 * loop instead.
 */
function darkAnchor(
  name: string,
  ctx: AnchorContext,
  isHighContrast: boolean,
): DarkAnchor {
  const memo = ctx.anchors[isHighContrast ? 1 : 0];
  const cached = memo.get(name);
  if (cached) return cached;

  if (aliasBaseOf(ctx.defs[name]) !== undefined) {
    const chain: string[] = [];
    let target = name;
    for (
      let base = aliasBaseOf(ctx.defs[target]);
      base !== undefined && !memo.has(target);
      base = aliasBaseOf(ctx.defs[target])
    ) {
      chain.push(target);
      target = base;
    }
    let anchor = darkAnchor(target, ctx, isHighContrast);
    for (let i = chain.length - 1; i >= 0; i--) {
      anchor = withStoredLightTone(chain[i], anchor, ctx, isHighContrast);
      memo.set(chain[i], anchor);
    }
    return anchor;
  }

  const color = ctx.resolved.get(name)!;
  const fromDark = (config: GlazeConfigResolved): DarkAnchor => ({
    tone: unmapDarkTone(
      getSchemeVariant(color, true, isHighContrast).t * 100,
      'auto',
      isHighContrast,
      config,
    ),
    lightSide: false,
  });

  let anchor: DarkAnchor;
  const def: ColorDef | undefined = ctx.defs[name];
  if (def === undefined) {
    const external = ctx.externalAnchors?.get(name)?.(isHighContrast);
    anchor =
      external === undefined ||
      !sameDarkWindow(isHighContrast, external.config, ctx.config)
        ? fromDark(ctx.config)
        : { tone: external.tone, lightSide: false };
  } else if (isMixDef(def) || isLightingDef(def)) {
    anchor = fromDark(ctx.config);
  } else {
    const regDef = def as RegularColorDef;
    const mode = regDef.mode ?? 'auto';
    const config = configForColor(regDef, ctx.config);
    const rawTone = regDef.tone ?? fromSeed(regDef)?.tone;
    const parsed =
      rawTone === undefined
        ? undefined
        : passTone(rawTone, isHighContrast, config);

    if (
      (mode !== 'auto' && !authoredToneAnchors.has(regDef)) ||
      regDef.contrast !== undefined
    ) {
      anchor = fromDark(config);
    } else if (parsed === undefined) {
      anchor = darkAnchor(regDef.base!, ctx, isHighContrast);
    } else if (parsed.kind === 'relative') {
      const base = darkAnchor(regDef.base!, ctx, isHighContrast);
      const baseLightTone =
        getSchemeVariant(ctx.resolved.get(regDef.base!)!, false, isHighContrast)
          .t * 100;
      const flip = regDef.autoFlip ?? ctx.config.autoFlip;
      anchor = {
        tone: stepFromAnchor(
          base.tone,
          applyToneFlip(parsed.value, baseLightTone, flip),
        ),
        lightSide: base.lightSide,
      };
    } else if (parsed.kind === 'extreme' && regDef.base !== undefined) {
      anchor = fromDark(config);
    } else {
      anchor = { tone: clamp(parsed.value, 0, 100), lightSide: true };
    }
  }

  anchor = withStoredLightTone(name, anchor, ctx, isHighContrast);
  memo.set(name, anchor);
  return anchor;
}

/**
 * A light-side anchor read as the color's stored light tone where that is its
 * authored tone (`readsStoredLightTone`; see `darkAnchor`).
 */
function withStoredLightTone(
  name: string,
  anchor: DarkAnchor,
  ctx: AnchorContext,
  isHighContrast: boolean,
): DarkAnchor {
  if (!anchor.lightSide || !readsStoredLightTone(isHighContrast, ctx.config)) {
    return anchor;
  }
  const color = ctx.resolved.get(name)!;
  return {
    tone: getSchemeVariant(color, false, isHighContrast).t * 100,
    lightSide: true,
  };
}

/**
 * A resolved color's dark-delta anchor for one pass (see `darkAnchor`), read
 * after its resolve. This is what a `glaze.color()` token hands the resolver
 * (with its config, and cached per pass) when another token links to it as a
 * `base`, so the link steps from where the base sits under the base's own
 * windows and defs. Internal, not public API.
 */
export function darkAnchorOf(
  name: string,
  isHighContrast: boolean,
  source: {
    defs: ColorMap;
    config: GlazeConfigResolved;
    resolved: Map<string, ResolvedColor>;
    externalBases?: Map<string, ResolvedColor>;
    externalAnchors?: Map<string, DarkAnchorHook>;
  },
): number {
  const resolved = new Map(source.externalBases);
  for (const [key, color] of source.resolved) resolved.set(key, color);
  return darkAnchor(
    name,
    {
      defs: source.defs,
      config: source.config,
      resolved,
      anchors: [new Map(), new Map()],
      externalAnchors: source.externalAnchors,
    },
    isHighContrast,
  ).tone;
}

/**
 * Which side of its base a tone sits on (both 0–100), or `undefined` when they
 * coincide. A gap within float noise counts as coinciding: a `'+0'` on a base
 * whose dark tone was read back through the dark window lands a few ulps off
 * it, and a strict comparison would let that noise pick the color's side.
 */
function sideOfBase(
  tone: number,
  baseTone: number,
): 'lighter' | 'darker' | undefined {
  if (Math.abs(tone - baseTone) < 1e-9) return undefined;
  return tone < baseTone ? 'darker' : 'lighter';
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
        const baseLightTone =
          getSchemeVariant(baseResolved, false, isHighContrast).t * 100;
        // Flip on the light scale, as the light pass did, so the dark step
        // mirrors the light one instead of picking a side of its own.
        const delta = applyToneFlip(parsed.value, baseLightTone, flip);
        // Step from where the base sits on the authored scale — the tone its
        // own dark variant is the inversion of — not from its light tone,
        // which carries the light window's lift (or, for a solved color or a
        // mix, sits wherever light put it). Either would land in the dark step
        // and make it uneven across bases.
        const anchor = darkAnchor(baseName, ctx, isHighContrast).tone;
        // Invert + remap the stepped tone into the dark window, exactly like
        // an absolute author tone under `mode: 'auto'` — past the window's
        // edge where the base itself sits past it.
        preferredTone = mapDarkToneUnclamped(
          stepFromAnchor(anchor, delta),
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

    let initialDirection = sideOfBase(preferredTone, baseTone);

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
    // on so a slider can't send it leaping across its own base. The normal
    // passes only: a high-contrast pass has no ramp to be stable along, and it
    // must reproduce what `'auto'` resolves, which never probes.
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
    // A color whose two endpoints genuinely disagree switches its preferred
    // side at level 50, where every other un-interpolable decision switches;
    // that fallback can still move it across earlier, or back and forth.
    const level = isHighContrast ? undefined : contrastFraction(config);
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
      initialDirection =
        sideOfBase(probe.tone * 100, baseTone) ?? initialDirection;
      preferInitial = true;
    }

    const result = findToneForContrast({
      ...solve,
      contrast: resolvedContrast,
      initialDirection,
      preferInitial,
    });

    if (!result.met) {
      ctx.unmet.add(unmetKey(name, isDark, isHighContrast));
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
  if (isLightingDef(def)) {
    return resolveLightingForScheme(name, def, ctx, isDark, isHighContrast);
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

/**
 * Shadow / glow: solve the pigment opacity that lands this scheme's `bg`
 * exactly `intensity × k` tones darker / lighter. `bg` and `fg` are read per
 * scheme, so the object factor `k` adapts on its own in dark and high contrast.
 * A glow past white with `headroom` gets `hdr` (base in OKHST + exposure); the
 * same headroom applies in every scheme, high contrast included.
 */
function resolveLightingForScheme(
  name: string,
  def: ShadowColorDef | GlowColorDef,
  ctx: ResolveContext,
  isDark: boolean,
  isHighContrast: boolean,
): ResolvedColorVariant {
  const bgVariant = toOkhslVariant(
    getSchemeVariant(ctx.resolved.get(def.bg)!, isDark, isHighContrast),
  );
  const fgVariant = def.fg
    ? toOkhslVariant(
        getSchemeVariant(ctx.resolved.get(def.fg)!, isDark, isHighContrast),
      )
    : undefined;

  const intensity = passNumber(def.intensity, isHighContrast, ctx.config);
  const tuning = resolveLightingTuning(
    def.tuning,
    def.type === 'shadow' ? ctx.config.shadowTuning : ctx.config.glowTuning,
  );
  const pastel = def.pastel ?? ctx.config.pastel;
  const result = computeLighting(
    def.type,
    { ...bgVariant, pastel: bgVariant.pastel ?? ctx.config.pastel },
    fgVariant,
    intensity,
    tuning,
    pastel,
  );
  warnLightingShortfall(
    def.type,
    name,
    { isDark, isHighContrast },
    result,
    tuning.headroom,
  );

  const variant: ResolvedColorVariant = {
    ...toToneVariant({
      h: result.h,
      s: result.s,
      l: result.l,
      alpha: result.alpha,
    }),
    pastel,
  };
  if (result.hdr) variant.hdr = toResolvedHdr(result.hdr);
  return variant;
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

    if (blend === 'transparent') {
      const baseGamma = toDisplayGamma(baseLinear);
      const targetGamma = toDisplayGamma(targetLinear);
      luminanceAt = (v: number) =>
        metricLuminance(metric, compositeOverGamma(baseGamma, targetGamma, v));
    } else if (space === 'srgb') {
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
      contrast: resolvedContrast,
      luminanceAtValue: luminanceAt,
      flip: ctx.config.autoFlip,
    });
    t = result.value;

    // Unmet means even the pure target falls short of the floor. The mix
    // settles at the end of the range it searched; say so like a regular
    // color does (deduped, with the same slack, so a rounding miss stays quiet).
    if (!result.met) {
      warnMixContrastUnmet(
        name,
        isDark,
        isHighContrast,
        resolvedContrast,
        result.contrast,
      );
    }
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
  if (isLightingDef(def) || isMixDef(def)) return undefined;
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

/** Key for `ResolveContext.unmet`: one color in one scheme. */
function unmetKey(
  name: string,
  isDark: boolean,
  isHighContrast: boolean,
): string {
  return `${name}|${isDark ? 'dark' : 'light'}|${isHighContrast ? 'hc' : ''}`;
}

/** Below this OKHSL saturation a variant is a gray: its tone is exact. */
const ACHROMATIC_EPSILON = 1e-6;

/**
 * After the passes, surface chromatic contrast drift (the drift check in
 * docs/okhst.mdx): a color resolved with a `base` + `contrast` may land
 * slightly under the contrast its tone implies because chromatic luminance
 * drifts from the gray tone.
 *
 * Two kinds of variant are skipped. One the solver reported as unmet (`unmet`)
 * already got a "cannot meet" warning with the same measured value, and the
 * shortfall is an unreachable floor, not drift. An achromatic one (saturation
 * 0) has no chromatic luminance to drift, so the advisory's cause can't apply.
 *
 * Under a manual `contrastLevel` the spec is resolved at the level, so the check
 * measures each normal variant against the target it was actually solved for. At
 * level 100 the high-contrast slots are mirrors and are skipped: the normal
 * schemes already carry that check, and repeating it would emit a byte-identical
 * advisory under a different scheme label, which dedupes as a separate key.
 */
function verifyContrastDrift(
  order: string[],
  defs: ColorMap,
  result: Map<string, ResolvedColor>,
  config: GlazeConfigResolved,
  unmet: ReadonlySet<string>,
): void {
  const roles = new Map<string, Role>();
  for (const name of order) {
    const def = defs[name];
    if (isLightingDef(def) || isMixDef(def)) continue;
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
    const mirrored = hcMirrorsNormal(config);

    for (const s of schemes) {
      // At level 100 the high-contrast slots are mirrors of the normal ones.
      if (mirrored && s.isHighContrast) continue;
      if (unmet.has(unmetKey(name, s.isDark, s.isHighContrast))) continue;
      const cVariant = color[s.field];
      if (cVariant.s <= ACHROMATIC_EPSILON) continue;
      const spec = resolveContrastSpec(
        regDef.contrast,
        s.isHighContrast,
        config,
        polarity,
      );
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
  externalAnchors?: Map<string, DarkAnchorHook>,
): Map<string, ResolvedColor> {
  validateColorDefs(defs, externalBases);
  const order = topoSort(defs);

  const ctx: ResolveContext = {
    ...seed,
    defs,
    resolved: new Map(),
    config,
    roles: new Map(),
    unmet: new Set(),
    anchors: [new Map(), new Map()],
    externalAnchors,
  };

  // Pre-seed externally-resolved bases. The per-pass loops iterate only
  // `defs` keys (via `order`), so external entries persist across all
  // four passes and are read via `getSchemeVariant` per scheme.
  if (externalBases) {
    for (const [name, color] of externalBases) {
      ctx.resolved.set(name, color);
    }
  }

  // A manual contrast level positions the *normal* passes; the high-contrast
  // passes bypass it, so they run as usual and produce the same values `'auto'`
  // does. Level 100 is the one exception: there the normal passes already *are*
  // the high-contrast passes bit for bit, so the two are skipped and their slots
  // mirror the normal ones. That holds because within a pass a dependent reads
  // its base's same slot (topo order), and the only cross-scheme reads — the
  // relative-tone dark branch (`darkAnchor`) and `extremeDarkTone` — read
  // `light`, which equals `lightContrast` at 100, and every window they map or
  // unmap through is the same full-range literal in both.
  const mirrored = hcMirrorsNormal(config);

  // Pass 1: Light (normal, or at the level).
  const lightMap = runPass(order, defs, ctx, false, false, 'light');

  // Pass 2: Light high-contrast.
  let lightHCMap = lightMap;
  if (!mirrored) {
    seedField(order, ctx, 'lightContrast', lightMap);
    lightHCMap = runPass(order, defs, ctx, false, true, 'lightContrast');
  }

  // Pass 3: Dark (normal, or at the level).
  seedField(order, ctx, 'dark', lightMap);
  seedField(order, ctx, 'darkContrast', lightHCMap);
  const darkMap = runPass(order, defs, ctx, true, false, 'dark');

  // Pass 4: Dark high-contrast.
  let darkHCMap = darkMap;
  if (!mirrored) {
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

  verifyContrastDrift(order, defs, result, config, ctx.unmet);

  return result;
}

// Re-export for callers that previously imported tone helpers from here.
export { fromTone, toTone };
