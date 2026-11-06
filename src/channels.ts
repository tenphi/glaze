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
 * the shared `var()` reference stays valid. Every scheme renders with the
 * light plan (`buildHuePlans`), so a color inline in light (achromatic there)
 * is inline everywhere and declares no var in any scheme. Numeric hue values
 * are rounded to 2 decimals, the precision of the hue in `oklch()` output.
 *
 * Also owns the `splitHue` guards the output methods run before planning:
 * `assertSplitHueFormat` (only `oklch()` takes a `var()` hue), and
 * `claimHueVars` / `claimValueProps`, which keep every custom property an
 * export declares to one owner — the theme var, a color's own hue var, and
 * (`css()` only) each color's value property share one namespace.
 */

import { parseRelativeOrAbsolute } from './hc-pair';
import { isLightingDef, isMixDef } from './lighting';
import type {
  ColorDef,
  ColorMap,
  GlazeColorFormat,
  RegularColorDef,
  ResolvedColor,
  ResolvedColorVariant,
} from './types';

const ACHROMATIC_EPSILON = 1e-6;
const SCHEMES: readonly HueScheme[] = ['light', 'dark'];

/**
 * A numeric hue as emitted in a declaration: 2 decimals, matching the hue of
 * `formatOklch`, so a `from` color doesn't leak `266.15797905637027`.
 */
function hueValue(h: number): string {
  return parseFloat(h.toFixed(2)).toString();
}

/**
 * Throw when `splitHue` is on and the format can't carry a `var()` hue. Only
 * `oklch()` has a hue slot a custom property can stand in for; silently
 * emitting inline colors instead would leave the hue vars the caller asked
 * for missing.
 */
export function assertSplitHueFormat(
  splitHue: boolean | undefined,
  format: GlazeColorFormat,
): void {
  if (splitHue && format !== 'oklch') {
    throw new Error(
      `glaze: splitHue requires format 'oklch' (got '${format}'). ` +
        `Use format: 'oklch' or drop splitHue.`,
    );
  }
}

/** Which scheme's hue a plan or declaration set describes. */
export type HueScheme = 'light' | 'dark';

export interface HueDeclaration {
  prop: string;
  value: string;
}

export interface HuePlan {
  /** CSS `var()` reference spliced into `oklch(L C <hueVar>)`. */
  hueVar: string;
  /** When true, emit a full inline color (shadow/glow/mix/achromatic). */
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
    isLightingDef(def) ||
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
  const isStatic = (regDef.mode ?? 'auto') === 'static';
  if (isStatic && schemeSeedHue(ctx, 'dark') !== ctx.seedHue) {
    return {
      hueVar: `var(${prop})`,
      inline: false,
      declarations: [{ prop, value: hueValue(variant.h) }],
    };
  }
  // The resolver ignores a static color's `darkHue`, so its light authoring
  // holds in both schemes and it keeps following `--{baseName}-hue`.
  const darkHue = isStatic ? undefined : regDef.darkHue;

  // A color needs its own var as soon as *either* scheme authors a hue: the
  // `var()` reference is shared across schemes, so it can't be the theme var
  // in one and a per-color var in the other.
  //
  // `from` counts as authoring one. It carries a hue that is not the theme's,
  // so pointing the color at the theme hue var would re-skin it to whatever the
  // theme is seeded with — the same failure a `darkHue`-only color used to have.
  if (
    regDef.hue === undefined &&
    darkHue === undefined &&
    regDef.from === undefined
  ) {
    return { hueVar: baseHueVar, inline: false, declarations: [] };
  }

  const authored = scheme === 'dark' ? (darkHue ?? regDef.hue) : regDef.hue;

  if (authored === undefined) {
    // `from` supplied the hue for this scheme, so pin the resolved literal —
    // tracking the theme var would re-skin the color to the theme's hue, which
    // is the one thing a literal color must not do.
    if (regDef.from !== undefined) {
      return {
        hueVar: `var(${prop})`,
        inline: false,
        declarations: [{ prop, value: hueValue(variant.h) }],
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
    const magnitude = hueValue(Math.abs(parsed.value));
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
    declarations: [{ prop, value: hueValue(absHue) }],
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
    declarations: [{ prop, value: hueValue(hue) }],
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

/**
 * The plan whose declarations `name` contributes in `scheme`, or `undefined`
 * when the color declares nothing.
 *
 * Rendering uses the light plan in every scheme (`buildHuePlans`), so a color
 * whose light plan is inline — achromatic in light, say — is a literal
 * `oklch()` everywhere. Its dark plan may still name a var (it has chroma
 * there), but nothing would read it: a dead declaration that, in an unprefixed
 * palette, could override another theme's live hue var.
 */
function declaringPlan(
  name: string,
  color: ResolvedColor,
  ctx: ChannelCtx,
  scheme: HueScheme,
): HuePlan | undefined {
  const def = ctx.defs[name];
  const light = buildHuePlan(name, def, color.light, ctx);
  if (light.inline) return undefined;
  if (scheme === 'light') return light;
  return buildHuePlan(name, def, color.dark, ctx, scheme);
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
      value: hueValue(schemeSeedHue(ctx, scheme)),
    });
  }

  for (const [name, color] of resolved) {
    const plan = declaringPlan(name, color, ctx, scheme);
    for (const decl of plan?.declarations ?? []) {
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

/** Who declares a custom property in a `splitHue` export. */
export interface SplitHueOwner {
  /** The owner as the collision error names it. */
  label: string;
  /** True for a color's `css()` value property, false for a hue var. */
  value: boolean;
}

/**
 * Every custom property a `splitHue` export declares, by name. Pass one map
 * across all the passes of an export call (a palette runs one per theme, plus
 * the primary's aliases) to catch collisions between them.
 */
export type SplitHueOwners = Map<string, SplitHueOwner>;

/** How a caller words who declares a property, and the fix. */
export interface HueVarLabels {
  /** The theme-level var's owner, e.g. `the theme hue (name: 'brand')`. */
  theme: string;
  /** A color's own var's owner, e.g. `color "brand"'s own hue`. */
  color: (name: string) => string;
  /** A color's `css()` value property's owner, e.g. `color "brand"'s value`. */
  value: (name: string) => string;
  /** The remedy appended when two hue vars clash. */
  fix: string;
  /** The remedy appended when a value property is one side of the clash. */
  valueFix: string;
}

/**
 * Record `prop` as `owner`'s, or throw when someone else already holds it. A
 * repeat claim by the same owner is fine: that is the same declaration seen
 * again (a theme pass re-run with the same prefix).
 */
function claim(
  owners: SplitHueOwners,
  prop: string,
  owner: SplitHueOwner,
  labels: HueVarLabels,
): void {
  const held = owners.get(prop);
  if (held === undefined) {
    owners.set(prop, owner);
    return;
  }
  if (held.label === owner.label) return;
  const fix = held.value || owner.value ? labels.valueFix : labels.fix;
  throw new Error(
    `glaze: splitHue would declare "${prop}" twice: for ${held.label} and ` +
      `for ${owner.label}. One would silently override the other. ${fix}`,
  );
}

/**
 * Claim every hue var this pass declares in `owners` and throw when a name is
 * already held by someone else.
 *
 * Theme and per-color vars share one namespace: `--{baseName}-hue` and
 * `--{prefix}{color}-hue`. A color named after the theme var (`brand` with
 * `name: 'brand'`), or a palette color named after another theme under an
 * empty prefix, would declare the same property as the theme. Only one value
 * survives — the theme's, after `collectHueDeclarations` dedupes — so the
 * color would silently render at the wrong hue.
 *
 * Every declaration a rendered plan references is claimed, in both schemes: a
 * color's own var only when its light plan references it. That includes a
 * declaration `collectHueDeclarations` would drop as a duplicate (a chromatic
 * `brand` color under `name: 'brand'`), since the color would still read the
 * survivor's hue. A color achromatic in light is inline in every scheme and
 * declares nothing, so it can share a name with the theme var.
 */
export function claimHueVars(
  resolved: Map<string, ResolvedColor>,
  ctx: ChannelCtx,
  owners: SplitHueOwners,
  labels: HueVarLabels,
): void {
  if (ctx.emitDeclarations === false) return;

  if (ctx.mode === 'theme') {
    const owner = { label: labels.theme, value: false };
    claim(owners, `--${ctx.baseName}-hue`, owner, labels);
  }

  for (const [name, color] of resolved) {
    const owner = { label: labels.color(name), value: false };
    for (const scheme of SCHEMES) {
      const plan = declaringPlan(name, color, ctx, scheme);
      for (const decl of plan?.declarations ?? []) {
        claim(owners, decl.prop, owner, labels);
      }
    }
  }
}

/**
 * Claim each color's `css()` value property, `--{prefix}{color}{suffix}`, in
 * the same `owners` map as the hue vars.
 *
 * Value properties share the custom-property namespace with the hue vars, so
 * `suffix: '-hue'` — or `suffix: ''` with a color named `*-hue` — can land a
 * color's value on a hue var: its own, which makes a `var()` cycle, or one
 * another color or theme declares (in a palette, another theme's), which
 * hands every color reading it a color string where a hue belongs. Either way
 * the CSS is invalid at computed-value time.
 *
 * Unlike `claimHueVars` this runs on every pass, including one that declares
 * no hue vars (a palette's primary aliases): its value properties are emitted
 * all the same. Not for `tasty()`, whose `#name` colors compile to
 * `--name-color` and can't land on a `$…-hue` var.
 */
export function claimValueProps(
  resolved: Map<string, ResolvedColor>,
  prefix: string,
  suffix: string,
  owners: SplitHueOwners,
  labels: HueVarLabels,
): void {
  for (const name of resolved.keys()) {
    const owner = { label: labels.value(name), value: true };
    claim(owners, cssProp(prefix, name, suffix), owner, labels);
  }
}
