/**
 * Hue channel planning for `splitHue` exports.
 *
 * Builds per-color hue var references and scheme-independent `--*-hue`
 * declarations for oklch CSS / Tasty output when every color is pastel.
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

function themeHuePlan(
  name: string,
  def: ColorDef | undefined,
  variant: ResolvedColorVariant,
  ctx: ChannelCtx,
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

  if (regDef.hue === undefined) {
    return { hueVar: baseHueVar, inline: false, declarations: [] };
  }

  const parsed = parseRelativeOrAbsolute(regDef.hue);
  const prop = cssProp(ctx.prefix, name, '-hue');

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
): HuePlan {
  if (isAchromatic(variant)) {
    return { hueVar: '', inline: true, declarations: [] };
  }

  const hue = ctx.resolvedHue ?? variant.h;
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
): HuePlan {
  if (ctx.mode === 'standalone') {
    return standaloneHuePlan(name, variant, ctx);
  }
  return themeHuePlan(name, def, variant, ctx);
}

/** Collect unique hue declarations across all colors (theme + per-color). */
export function collectHueDeclarations(
  resolved: Map<string, ResolvedColor>,
  ctx: ChannelCtx,
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
      value: String(ctx.seedHue),
    });
  }

  for (const [name, color] of resolved) {
    const def = ctx.defs[name];
    const plan = buildHuePlan(name, def, color.light, ctx);
    for (const decl of plan.declarations) {
      push(decl);
    }
  }

  return out;
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
