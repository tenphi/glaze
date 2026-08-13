/**
 * Hue channel planning for `splitHue` exports.
 *
 * Builds per-color hue var references and the `--*-hue` declarations backing
 * them for oklch CSS / Tasty output when every color is pastel.
 *
 * Hue is scheme-independent unless the theme or a color authors a dark hue,
 * so declarations are collected per scheme (`'light'` / `'dark'`) and the dark
 * set is emitted only when it actually differs — see `buildHueDeclarations`.
 * A color that authors a hue in *either* scheme gets its own var in both, so
 * the shared `var()` reference stays valid.
 */

import { parseRelativeOrAbsolute } from './hc-pair';
import { isMixDef, isShadowDef } from './shadow';
import type {
  ColorDef,
  ColorMap,
  RegularColorDef,
  ResolvedColor,
  ResolvedColorVariant,
} from './types';

const ACHROMATIC_EPSILON = 1e-6;

/** Which scheme's hue a plan or declaration set describes. */
export type HueScheme = 'light' | 'dark';

export interface HueDeclaration {
  prop: string;
  value: string;
}

export interface HuePlan {
  /** CSS `var()` reference spliced into `oklch(L C <hueVar>)`. */
  hueVar: string;
  /** When true, emit a full inline color (shadow/mix/achromatic). */
  inline: boolean;
  /** Scheme-independent `--*-hue` declarations for this color. */
  declarations: HueDeclaration[];
}

export interface ChannelCtx {
  seedHue: number;
  /**
   * Dark-scheme seed hue, when the theme authored one. Drives the dark
   * `--{baseName}-hue` value; falls back to `seedHue`.
   */
  darkSeedHue?: number;
  /** Theme-level hue var base name (without `--` / `-hue`). */
  baseName: string;
  /** Token / custom-property name prefix used for hue var naming (`brand-` etc.). */
  prefix: string;
  defs: ColorMap;
  mode: 'theme' | 'standalone';
  /** Standalone: resolved hue from the primary variant (scheme-independent). */
  resolvedHue?: number;
  /**
   * When false, hue declarations are not emitted (the pass only references
   * hue vars already declared by a sibling pass). Used by palette primary
   * unprefixed aliases so they reference the themed `--{themeName}-*-hue`
   * vars without re-declaring (and colliding with) other themes' base vars.
   * Defaults to true.
   */
  emitDeclarations?: boolean;
}

function cssProp(prefix: string, name: string, suffix: string): string {
  return `--${prefix}${name}${suffix}`;
}

function isAchromatic(v: ResolvedColorVariant): boolean {
  return v.s <= ACHROMATIC_EPSILON;
}

/** Seed hue backing `--{baseName}-hue` in a given scheme. */
function schemeSeedHue(ctx: ChannelCtx, scheme: HueScheme): number {
  return scheme === 'dark' ? (ctx.darkSeedHue ?? ctx.seedHue) : ctx.seedHue;
}

function themeHuePlan(
  name: string,
  def: ColorDef | undefined,
  variant: ResolvedColorVariant,
  ctx: ChannelCtx,
  scheme: HueScheme,
): HuePlan {
  if (
    def === undefined ||
    isShadowDef(def) ||
    isMixDef(def) ||
    isAchromatic(variant)
  ) {
    return { hueVar: '', inline: true, declarations: [] };
  }

  const regDef = def as RegularColorDef;
  const baseHueVar = `var(--${ctx.baseName}-hue)`;
  const prop = cssProp(ctx.prefix, name, '-hue');

  // `mode: 'static'` pins one hue across every scheme, but `--{baseName}-hue`
  // is re-declared in dark whenever the theme seeds one. Pin the resolved hue
  // so a static color doesn't drift with it — matching what the resolver does.
  // Both variants carry the same hue under `static`, so either one works.
  if (
    (regDef.mode ?? 'auto') === 'static' &&
    schemeSeedHue(ctx, 'dark') !== ctx.seedHue
  ) {
    return {
      hueVar: `var(${prop})`,
      inline: false,
      declarations: [{ prop, value: String(variant.h) }],
    };
  }

  // A color needs its own var as soon as *either* scheme authors a hue: the
  // `var()` reference is shared across schemes, so it can't be the theme var
  // in one and a per-color var in the other.
  //
  // `from` counts as authoring one. It carries a hue that is not the theme's,
  // so pointing the color at the theme hue var would re-skin it to whatever the
  // theme is seeded with — the same failure a `darkHue`-only color used to have.
  if (
    regDef.hue === undefined &&
    regDef.darkHue === undefined &&
    regDef.from === undefined
  ) {
    return { hueVar: baseHueVar, inline: false, declarations: [] };
  }

  const authored =
    scheme === 'dark' ? (regDef.darkHue ?? regDef.hue) : regDef.hue;

  if (authored === undefined) {
    // `from` supplied the hue for this scheme, so pin the resolved literal —
    // tracking the theme var would re-skin the color to the theme's hue, which
    // is the one thing a literal color must not do.
    if (regDef.from !== undefined) {
      return {
        hueVar: `var(${prop})`,
        inline: false,
        declarations: [{ prop, value: String(variant.h) }],
      };
    }

    // Only the other scheme authored a hue; track the theme var in this one.
    return {
      hueVar: `var(${prop})`,
      inline: false,
      declarations: [{ prop, value: baseHueVar }],
    };
  }

  const parsed = parseRelativeOrAbsolute(authored);

  if (parsed.relative) {
    const sign = parsed.value >= 0 ? '+' : '-';
    const magnitude = Math.abs(parsed.value);
    const value = `calc(var(--${ctx.baseName}-hue) ${sign} ${magnitude})`;
    return {
      hueVar: `var(${prop})`,
      inline: false,
      declarations: [{ prop, value }],
    };
  }

  const absHue = ((parsed.value % 360) + 360) % 360;
  return {
    hueVar: `var(${prop})`,
    inline: false,
    declarations: [{ prop, value: String(absHue) }],
  };
}

function standaloneHuePlan(
  name: string,
  variant: ResolvedColorVariant,
  ctx: ChannelCtx,
  scheme: HueScheme,
): HuePlan {
  if (isAchromatic(variant)) {
    return { hueVar: '', inline: true, declarations: [] };
  }

  // `resolvedHue` is the light-variant hue captured by the caller; the dark
  // pass reads the hue off the dark variant it was handed.
  const hue = scheme === 'dark' ? variant.h : (ctx.resolvedHue ?? variant.h);
  const prop = cssProp(ctx.prefix, name, '-hue');
  return {
    hueVar: `var(${prop})`,
    inline: false,
    declarations: [{ prop, value: String(hue) }],
  };
}

export function buildHuePlan(
  name: string,
  def: ColorDef | undefined,
  variant: ResolvedColorVariant,
  ctx: ChannelCtx,
  scheme: HueScheme = 'light',
): HuePlan {
  if (ctx.mode === 'standalone') {
    return standaloneHuePlan(name, variant, ctx, scheme);
  }
  return themeHuePlan(name, def, variant, ctx, scheme);
}

/** Collect unique hue declarations across all colors (theme + per-color). */
function collectHueDeclarations(
  resolved: Map<string, ResolvedColor>,
  ctx: ChannelCtx,
  scheme: HueScheme,
): HueDeclaration[] {
  if (ctx.emitDeclarations === false) return [];

  const seen = new Set<string>();
  const out: HueDeclaration[] = [];

  const push = (decl: HueDeclaration): void => {
    if (seen.has(decl.prop)) return;
    seen.add(decl.prop);
    out.push(decl);
  };

  if (ctx.mode === 'theme') {
    push({
      prop: `--${ctx.baseName}-hue`,
      value: String(schemeSeedHue(ctx, scheme)),
    });
  }

  for (const [name, color] of resolved) {
    const def = ctx.defs[name];
    const variant = scheme === 'dark' ? color.dark : color.light;
    const plan = buildHuePlan(name, def, variant, ctx, scheme);
    for (const decl of plan.declarations) {
      push(decl);
    }
  }

  return out;
}

/**
 * Hue declarations for both schemes. `dark` is empty when it resolves to the
 * same hues as light — the common case, with no `darkHue` anywhere.
 *
 * When they differ, the **whole** dark set is returned rather than only the
 * entries whose text changed. A relative declaration reads
 * `calc(var(--theme-hue) + N)` in both schemes even though its resolved value
 * moves with the seed, and custom properties substitute `var()` at
 * computed-value time on the declaring element — so re-declaring
 * `--{baseName}-hue` alone would leave inherited per-color vars still holding
 * the light-substituted value.
 */
export function buildHueDeclarations(
  resolved: Map<string, ResolvedColor>,
  ctx: ChannelCtx,
): { light: HueDeclaration[]; dark: HueDeclaration[] } {
  const light = collectHueDeclarations(resolved, ctx, 'light');
  const dark = collectHueDeclarations(resolved, ctx, 'dark');

  const same =
    dark.length === light.length &&
    dark.every(
      (decl, i) => decl.prop === light[i].prop && decl.value === light[i].value,
    );

  return { light, dark: same ? [] : dark };
}

export function buildHuePlans(
  resolved: Map<string, ResolvedColor>,
  ctx: ChannelCtx,
): Map<string, HuePlan> {
  const plans = new Map<string, HuePlan>();
  for (const [name, color] of resolved) {
    plans.set(name, buildHuePlan(name, ctx.defs[name], color.light, ctx));
  }
  return plans;
}
