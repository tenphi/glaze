/**
 * Output formatting for resolved color maps.
 *
 * Owns the CSS-string formatter dispatch table (`okhsl` / `rgb` / `hsl` /
 * `oklch`), the HDR glow writer (`formatHdrVariant`: extended `color(srgb …)`,
 * or `color(srgb-linear …)` on request), and the token-map shapes Glaze emits:
 * - `buildTokenMap` — Tasty style-to-state bindings (`#name` keys, state aliases).
 * - `buildFlatTokenMap` — `{ light, dark, ... }` per-variant maps.
 * - `buildJsonMap` — `{ name: { light, dark, ... } }` per-color JSON.
 * - `buildCssMap` — CSS custom property declaration strings per variant.
 * - `buildDtcgMap` — W3C DTCG (2025.10) token documents, one per scheme.
 * - `buildDtcgResolver` — W3C DTCG Resolver-Module document (one modifier, a context per scheme).
 * - `buildTailwindMap` — Tailwind v4 `@theme` block + dark/HC overrides.
 *
 * The HDR tier (`variant.hdr`, a glow past SDR white) is emitted only with
 * `modes.hdr` (`css()`: its `hdr` option), and always as a literal
 * `color(srgb R G B)` with channels past 1 — whatever `format`, even under
 * `splitHue`.
 * Without it every shape is byte-identical to SDR. Each shape carries it the
 * way its consumer composes values:
 * - Tasty: a sparse `hdr` state key after each SDR key that has one (`''`,
 *   hdr, dark, dark & hdr, hc, hc & hdr, dark & hc, dark & hc & hdr). Tasty
 *   gives later keys priority, so a dark key still beats the light HDR one.
 * - `json()`: sparse `lightHdr` / `darkHdr` / … keys per color.
 * - `tokens()` / `css()` / Tailwind: dense per-scheme HDR blocks — every
 *   color with an HDR value in any (emitted) scheme, re-declared with its SDR
 *   value where a scheme has none — so a cascade layering one HDR block over
 *   the SDR ones can't leak a light HDR value into dark.
 * - DTCG: `$value` stays SDR; the HDR value rides in
 *   `$extensions['me.tenphi.glaze'].hdr` of the scheme documents that have it.
 */

import {
  buildHueDeclarations,
  buildHuePlans,
  type ChannelCtx,
  type HuePlan,
} from './channels';
import {
  formatHsl,
  formatOkhsl,
  formatOkhst,
  formatOklch,
  formatRgb,
  formatSrgb,
  formatSrgbLinear,
  okhslToOklch,
  okhslToSrgb,
  relativeLuminanceFromLinearRgb,
  sRGBLinearToGamma,
  srgbToHex,
} from './okhsl-color-math';
import { okhstToOkhsl, toneFromY, variantToOkhsl } from './okhst';
import { hdrToLinearSrgb, hdrToSrgb } from './lighting';
import { getConfig } from './config';
import { hcMirrorsNormal } from './hc-pair';
import type {
  DtcgColorSpace,
  DtcgColorToken,
  DtcgColorValue,
  DtcgDocument,
  DtcgSrgbColorValue,
  DtcgTokenTree,
  GlazeColorFormat,
  GlazeCssResult,
  GlazeCssSchemeBlocks,
  GlazeDtcgHdr,
  GlazeDtcgResolverDocument,
  GlazeDtcgResolverOptions,
  GlazeDtcgResult,
  GlazeHdrFormat,
  GlazeOutputModes,
  ResolvedColor,
  ResolvedColorVariant,
  ResolvedHdr,
} from './types';

export type { ChannelCtx } from './channels';

/** The four scheme variants, in emission order. */
export const SCHEMES = [
  'light',
  'dark',
  'lightContrast',
  'darkContrast',
] as const;

type Scheme = (typeof SCHEMES)[number];

/** Key of a scheme's HDR counterpart (`lightHdr`, `darkHdr`, …). */
type HdrScheme = `${Scheme}Hdr`;

function hdrKey(scheme: Scheme): HdrScheme {
  return `${scheme}Hdr`;
}

/** The scheme variants `modes` emits, in order. Light always. */
function emittedSchemes(modes: Required<GlazeOutputModes>): Scheme[] {
  const schemes: Scheme[] = ['light'];
  if (modes.dark) schemes.push('dark');
  if (modes.highContrast) schemes.push('lightContrast');
  if (modes.dark && modes.highContrast) schemes.push('darkContrast');
  return schemes;
}

/**
 * Whether a color belongs in the dense HDR blocks: it has an HDR value in at
 * least one of `schemes`.
 */
function hasHdrIn(color: ResolvedColor, schemes: readonly Scheme[]): boolean {
  return schemes.some((scheme) => color[scheme].hdr !== undefined);
}

/** Join per-scheme declaration lines into `css()` blocks. */
export function joinSchemeLines(
  lines: Record<Scheme, string[]>,
): GlazeCssSchemeBlocks {
  return {
    light: lines.light.join('\n'),
    dark: lines.dark.join('\n'),
    lightContrast: lines.lightContrast.join('\n'),
    darkContrast: lines.darkContrast.join('\n'),
  };
}

/** Fresh, empty per-scheme declaration line buckets. */
export function emptySchemeLines(): Record<Scheme, string[]> {
  return { light: [], dark: [], lightContrast: [], darkContrast: [] };
}

const formatters: Record<
  Exclude<GlazeColorFormat, 'okhst'>,
  (h: number, s: number, l: number, pastel: boolean) => string
> = {
  okhsl: formatOkhsl,
  rgb: formatRgb,
  hsl: formatHsl,
  oklch: formatOklch,
};

function fmt(value: number, decimals: number): string {
  return parseFloat(value.toFixed(decimals)).toString();
}

export function formatVariant(
  v: ResolvedColorVariant,
  format: GlazeColorFormat = 'oklch',
  pastel = false,
): string {
  // Variants store canonical tone; convert to OKHSL lightness at the edge.
  // Per-variant `pastel` (set by the resolver from def or config fallback)
  // wins over the format-time fallback, so output matches resolution.
  const effectivePastel = v.pastel ?? pastel;

  let base: string;
  if (format === 'okhst') {
    base = formatOkhst(v.h, v.s, v.t, effectivePastel);
  } else {
    const { l } = variantToOkhsl(v);
    base = formatters[format](v.h, v.s, l, effectivePastel);
  }

  if (v.alpha >= 1) return base;
  const closing = base.lastIndexOf(')');
  return `${base.slice(0, closing)} / ${fmt(v.alpha, 4)})`;
}

/**
 * Format a variant's HDR value (`variant.hdr`, set on a glow past white with
 * `headroom`) as extended `color(srgb R G B)` (default) or
 * `color(srgb-linear R G B)` — the same color, with the brightest channel
 * past 1 — or `undefined` when it has none. One of these whatever the SDR
 * format: OKLCH lightness clamps at parse time and `rgb()` / `hsl()` cannot
 * pass white. Emitted as a literal, never with a split hue.
 */
export function formatHdrVariant(
  v: ResolvedColorVariant,
  format: GlazeHdrFormat = 'srgb',
): string | undefined {
  if (format !== 'srgb' && format !== 'srgb-linear') {
    throw new Error(
      `glaze: unknown HDR format ${JSON.stringify(format)}. ` +
        `Use 'srgb' or 'srgb-linear'.`,
    );
  }
  if (v.hdr === undefined) return undefined;
  return format === 'srgb'
    ? formatSrgb(hdrToSrgb(v.hdr))
    : formatSrgbLinear(hdrToLinearSrgb(v.hdr));
}

/**
 * Format a resolved variant as `oklch(L C <hueVar>)`, splicing a CSS hue var
 * for `splitHue` exports. Falls back to inline when the plan is inline.
 */
export function formatVariantHue(
  v: ResolvedColorVariant,
  plan: HuePlan,
  pastel = false,
): string {
  const effectivePastel = v.pastel ?? pastel;
  const { l } = variantToOkhsl(v);
  const [L, C] = okhslToOklch(v.h, v.s, l, effectivePastel);

  let base: string;
  if (plan.inline) {
    if (v.s <= 1e-6) {
      base = `oklch(${fmt(L, 4)} 0 0)`;
    } else {
      base = formatOklch(v.h, v.s, l, effectivePastel);
    }
  } else {
    base = `oklch(${fmt(L, 4)} ${fmt(C, 4)} ${plan.hueVar})`;
  }

  if (v.alpha >= 1) return base;
  const closing = base.lastIndexOf(')');
  return `${base.slice(0, closing)} / ${fmt(v.alpha, 4)})`;
}

function formatColorValue(
  v: ResolvedColorVariant,
  format: GlazeColorFormat,
  pastel: boolean,
  huePlan?: HuePlan,
): string {
  if (format === 'oklch' && huePlan !== undefined) {
    return formatVariantHue(v, huePlan, pastel);
  }
  return formatVariant(v, format, pastel);
}

/**
 * Resolve the effective output modes for an export.
 *
 * `modes.highContrast` and `contrastLevel` are independent: the level positions
 * the normal variants, the high-contrast tier stays the true high-contrast
 * resolution, and the two compose — a slider raises the baseline while a
 * `prefers-contrast: more` block still escalates on top of it.
 *
 * The one exception is a **global** level of 100, where the normal variants
 * already *are* the high-contrast ones. The tier would be an exact duplicate, so
 * it is dropped and a single light/dark set is emitted — including against an
 * explicit `highContrast: true` override, which has nothing different left to
 * ask for.
 *
 * A level set on a single theme or token does not change which modes are
 * emitted: `modes` is global-only, and a palette must not have one sibling
 * collapse the shared token structure. A per-instance level of 100 therefore
 * still reports into the tier, with values equal to its own normal ones.
 */
export function resolveModes(
  override?: GlazeOutputModes,
): Required<GlazeOutputModes> {
  const cfg = getConfig();
  const highContrast = override?.highContrast ?? cfg.modes.highContrast;
  return {
    dark: override?.dark ?? cfg.modes.dark,
    highContrast: highContrast && !hcMirrorsNormal(cfg),
    hdr: override?.hdr ?? cfg.modes.hdr,
  };
}

/**
 * Tasty state aliases. `hdr` falls back to the global `states.hdr` — a
 * `glaze.color()` token, which is never a glow, doesn't pass it.
 */
export interface TastyStates {
  dark: string;
  highContrast: string;
  hdr?: string;
}

export function buildTokenMap(
  resolved: Map<string, ResolvedColor>,
  prefix: string,
  states: TastyStates,
  modes: Required<GlazeOutputModes>,
  format: GlazeColorFormat = 'oklch',
  pastel = false,
  channelCtx?: ChannelCtx,
): Record<string, Record<string, string>> {
  const tokens: Record<string, Record<string, string>> = {};
  const huePlans =
    channelCtx !== undefined && format === 'oklch'
      ? buildHuePlans(resolved, channelCtx)
      : undefined;

  if (huePlans !== undefined && channelCtx !== undefined) {
    const hueDecls = buildHueDeclarations(resolved, channelCtx);
    for (const decl of hueDecls.light) {
      tokens[`$${decl.prop.slice(2)}`] = { '': decl.value };
    }
    // Hue vars must not outlive the modes gate the color values respect.
    if (modes.dark) {
      for (const decl of hueDecls.dark) {
        const key = `$${decl.prop.slice(2)}`;
        tokens[key] = { ...tokens[key], [states.dark]: decl.value };
      }
    }
    for (const [name, color] of resolved) {
      tokens[`#${prefix}${name}`] = buildTokenEntry(
        color,
        states,
        modes,
        format,
        pastel,
        huePlans.get(name),
      );
    }
    return tokens;
  }

  for (const [name, color] of resolved) {
    const key = `#${prefix}${name}`;
    tokens[key] = buildTokenEntry(color, states, modes, format, pastel);
  }

  return tokens;
}

/**
 * One color's Tasty state map. With `modes.hdr`, each SDR key whose variant
 * has an HDR value is followed by its `hdr` key (`states.hdr` alone after
 * `''`, `<key> & <hdr>` after the others), so the order is `''`, hdr, dark,
 * dark & hdr, hc, hc & hdr, dark & hc, dark & hc & hdr — only the HDR keys
 * that exist. Tasty gives later keys priority, so in a dark HDR context the
 * dark key (or its own HDR key) still beats the light HDR one.
 */
function buildTokenEntry(
  color: ResolvedColor,
  states: TastyStates,
  modes: Required<GlazeOutputModes>,
  format: GlazeColorFormat,
  pastel: boolean,
  huePlan?: HuePlan,
): Record<string, string> {
  const entry: Record<string, string> = {};
  const add = (key: string, v: ResolvedColorVariant): void => {
    entry[key] = formatColorValue(v, format, pastel, huePlan);
    if (modes.hdr && v.hdr !== undefined) {
      const hdrState = states.hdr ?? getConfig().states.hdr;
      entry[key === '' ? hdrState : `${key} & ${hdrState}`] =
        formatHdrVariant(v)!;
    }
  };

  add('', color.light);
  if (modes.dark) {
    add(states.dark, color.dark);
  }
  if (modes.highContrast) {
    add(states.highContrast, color.lightContrast);
  }
  if (modes.dark && modes.highContrast) {
    add(`${states.dark} & ${states.highContrast}`, color.darkContrast);
  }

  return entry;
}

/**
 * Per-scheme flat maps (`{ light, dark, … }`), gated by `modes`. With
 * `modes.hdr` each emitted scheme gains a dense `<scheme>Hdr` map right after
 * it (`light`, `lightHdr`, `dark`, `darkHdr`, …): every color with an HDR
 * value in any emitted scheme, its SDR value where that scheme has none.
 */
export function buildFlatTokenMap(
  resolved: Map<string, ResolvedColor>,
  prefix: string,
  modes: Required<GlazeOutputModes>,
  format: GlazeColorFormat = 'oklch',
  pastel = false,
): Record<string, Record<string, string>> {
  const schemes = emittedSchemes(modes);
  const result: Record<string, Record<string, string>> = {};
  for (const scheme of schemes) {
    result[scheme] = {};
    if (modes.hdr) result[hdrKey(scheme)] = {};
  }

  for (const [name, color] of resolved) {
    const key = `${prefix}${name}`;
    const dense = modes.hdr && hasHdrIn(color, schemes);
    for (const scheme of schemes) {
      const v = color[scheme];
      const sdr = formatVariant(v, format, pastel);
      result[scheme][key] = sdr;
      if (dense) result[hdrKey(scheme)][key] = formatHdrVariant(v) ?? sdr;
    }
  }

  return result;
}

/**
 * Per-color JSON (`{ name: { light, dark, … } }`), gated by `modes`. With
 * `modes.hdr`, a variant with an HDR value adds a sparse `<scheme>Hdr` key
 * right after its SDR one (`light`, `lightHdr`, `dark`, …).
 */
export function buildJsonMap(
  resolved: Map<string, ResolvedColor>,
  modes: Required<GlazeOutputModes>,
  format: GlazeColorFormat = 'oklch',
  pastel = false,
): Record<string, Record<string, string>> {
  const schemes = emittedSchemes(modes);
  const result: Record<string, Record<string, string>> = {};

  for (const [name, color] of resolved) {
    const entry: Record<string, string> = {};
    for (const scheme of schemes) {
      const v = color[scheme];
      entry[scheme] = formatVariant(v, format, pastel);
      if (modes.hdr && v.hdr !== undefined) {
        entry[hdrKey(scheme)] = formatHdrVariant(v)!;
      }
    }
    result[name] = entry;
  }

  return result;
}

/**
 * CSS custom-property declarations for all four schemes. With `hdr`, the
 * result gains dense `hdr` blocks: every color with an HDR value in any
 * scheme, re-declared in each block with that scheme's HDR value, or its
 * exact SDR declaration where the scheme has none.
 */
export function buildCssMap(
  resolved: Map<string, ResolvedColor>,
  prefix: string,
  suffix: string,
  format: GlazeColorFormat,
  pastel = false,
  channelCtx?: ChannelCtx,
  hdr = false,
): GlazeCssResult {
  const lines = emptySchemeLines();
  const hdrLines = hdr ? emptySchemeLines() : undefined;

  const huePlans =
    channelCtx !== undefined && format === 'oklch'
      ? buildHuePlans(resolved, channelCtx)
      : undefined;

  if (huePlans !== undefined && channelCtx !== undefined) {
    const hueDecls = buildHueDeclarations(resolved, channelCtx);
    for (const decl of hueDecls.light) {
      lines.light.push(`${decl.prop}: ${decl.value};`);
    }
    for (const decl of hueDecls.dark) {
      lines.dark.push(`${decl.prop}: ${decl.value};`);
      lines.darkContrast.push(`${decl.prop}: ${decl.value};`);
    }
  }

  for (const [name, color] of resolved) {
    const prop = `--${prefix}${name}${suffix}`;
    const plan = huePlans?.get(name);
    const dense = hdrLines !== undefined && hasHdrIn(color, SCHEMES);
    for (const scheme of SCHEMES) {
      const v = color[scheme];
      const decl = `${prop}: ${formatColorValue(v, format, pastel, plan)};`;
      lines[scheme].push(decl);
      if (dense) {
        hdrLines[scheme].push(
          v.hdr !== undefined ? `${prop}: ${formatHdrVariant(v)};` : decl,
        );
      }
    }
  }

  const result: GlazeCssResult = joinSchemeLines(lines);
  if (hdrLines !== undefined) result.hdr = joinSchemeLines(hdrLines);
  return result;
}

// ============================================================================
// DTCG (W3C Design Tokens Format Module 2025.10)
// ============================================================================

function roundTo(value: number, decimals: number): number {
  return parseFloat(value.toFixed(decimals));
}

/**
 * Build a DTCG `$value` color object for a resolved variant.
 *
 * `srgb` (default) emits gamma sRGB components in 0–1 plus a 6-digit `hex`
 * hint — the most universally understood form (Figma, Tokens Studio, Style
 * Dictionary). `oklch` emits `[L, C, H]` components with no hex — Glaze-native
 * and wide-gamut. `alpha` is included only when below 1.
 */
export function dtcgColorValue(
  v: ResolvedColorVariant,
  colorSpace: DtcgColorSpace = 'srgb',
  pastel = false,
): DtcgColorValue {
  const effectivePastel = v.pastel ?? pastel;
  const { l } = variantToOkhsl(v);
  const alpha = v.alpha < 1 ? roundTo(v.alpha, 6) : undefined;

  if (colorSpace === 'oklch') {
    const [L, C, H] = okhslToOklch(v.h, v.s, l, effectivePastel);
    const value: DtcgColorValue = {
      colorSpace: 'oklch',
      components: [roundTo(L, 6), roundTo(C, 6), roundTo(H, 4)],
    };
    if (alpha !== undefined) value.alpha = alpha;
    return value;
  }

  const value = dtcgSrgbValue(v.h, v.s, l, effectivePastel);
  if (alpha !== undefined) value.alpha = alpha;
  return value;
}

/** A DTCG sRGB color value (gamma components, 6 decimals, plus `hex`). */
function dtcgSrgbValue(
  h: number,
  s: number,
  l: number,
  pastel: boolean,
): DtcgSrgbColorValue {
  const [r, g, b] = okhslToSrgb(h, s, l, pastel);
  return {
    colorSpace: 'srgb',
    components: [roundTo(r, 6), roundTo(g, 6), roundTo(b, 6)],
    hex: srgbToHex([r, g, b]),
  };
}

/** The `$extensions` namespace Glaze writes into DTCG tokens. */
const DTCG_EXTENSION_NAMESPACE = 'me.tenphi.glaze';

/**
 * The DTCG form of an HDR value: `exposure` in stops, the luminance `tone`
 * it lands (past 100 unless `headroom` caps a saturated base short of it), the
 * opaque `base` as a DTCG sRGB color (always sRGB, whatever `colorSpace`, and
 * never pastel — the base is standard OKHSL), and the HDR color as extended
 * sRGB components (the numbers of `glaze.formatHdr()`), the brightest above 1.
 */
function dtcgHdrValue(hdr: ResolvedHdr): GlazeDtcgHdr {
  const linear = hdrToLinearSrgb(hdr);
  const { h, s, l } = okhstToOkhsl(hdr);
  return {
    exposure: roundTo(hdr.exposure, 6),
    tone: roundTo(toneFromY(relativeLuminanceFromLinearRgb(linear)), 4),
    base: dtcgSrgbValue(h, s, l, false),
    value: {
      colorSpace: 'srgb',
      components: [
        roundTo(sRGBLinearToGamma(linear[0]), 6),
        roundTo(sRGBLinearToGamma(linear[1]), 6),
        roundTo(sRGBLinearToGamma(linear[2]), 6),
      ],
    },
  };
}

function dtcgToken(
  v: ResolvedColorVariant,
  colorSpace: DtcgColorSpace,
  pastel: boolean,
  hdr: boolean,
): DtcgColorToken {
  const token: DtcgColorToken = {
    $type: 'color',
    $value: dtcgColorValue(v, colorSpace, pastel),
  };
  if (hdr && v.hdr !== undefined) {
    token.$extensions = {
      [DTCG_EXTENSION_NAMESPACE]: { hdr: dtcgHdrValue(v.hdr) },
    };
  }
  return token;
}

/**
 * Build a `GlazeDtcgResult`: one spec-conformant DTCG token document per
 * scheme variant, gated by `modes`. Light is always present. With
 * `modes.hdr`, a token whose variant has an HDR value carries it in
 * `$extensions['me.tenphi.glaze'].hdr` — only in that scheme's document;
 * `$value` stays SDR.
 */
export function buildDtcgMap(
  resolved: Map<string, ResolvedColor>,
  prefix: string,
  modes: Required<GlazeOutputModes>,
  colorSpace: DtcgColorSpace = 'srgb',
  pastel = false,
): GlazeDtcgResult {
  const light: DtcgDocument = {};
  const dark: DtcgDocument | undefined = modes.dark ? {} : undefined;
  const lightContrast: DtcgDocument | undefined = modes.highContrast
    ? {}
    : undefined;
  const darkContrast: DtcgDocument | undefined =
    modes.dark && modes.highContrast ? {} : undefined;
  const token = (v: ResolvedColorVariant): DtcgColorToken =>
    dtcgToken(v, colorSpace, pastel, modes.hdr);

  for (const [name, color] of resolved) {
    const key = `${prefix}${name}`;
    light[key] = token(color.light);
    if (dark) dark[key] = token(color.dark);
    if (lightContrast) lightContrast[key] = token(color.lightContrast);
    if (darkContrast) darkContrast[key] = token(color.darkContrast);
  }

  return { light, dark, lightContrast, darkContrast };
}

// ============================================================================
// DTCG Resolver Module (single document for all scheme variants)
// ============================================================================

/**
 * Default context names emitted on the `scheme` modifier — the Glaze variant
 * keys, so the resolver document mirrors `GlazeDtcgResult` exactly.
 */
const DEFAULT_DTCG_CONTEXT_NAMES = {
  light: 'light',
  dark: 'dark',
  lightContrast: 'lightContrast',
  darkContrast: 'darkContrast',
} as const;

/**
 * Wrap a per-scheme `GlazeDtcgResult` into a single W3C DTCG Resolver-Module
 * document. The light document becomes `sets[setName].sources[0]` (the default
 * context); each other present variant becomes a `contexts[ctx]` override
 * array on a single `modifiers[modifierName]`. Absent variants (per the
 * `modes` already applied to `result`) are omitted — light is always present
 * and is the modifier `default`. Only the resolver-specific options are read;
 * `modes` / `colorSpace` were already consumed by the `buildDtcgMap` call that
 * produced `result`.
 */
export function buildDtcgResolver(
  result: GlazeDtcgResult,
  options?: GlazeDtcgResolverOptions,
): GlazeDtcgResolverDocument {
  const setName = options?.setName ?? 'base';
  const modifierName = options?.modifierName ?? 'scheme';
  const ctx = {
    ...DEFAULT_DTCG_CONTEXT_NAMES,
    ...options?.contextNames,
  };
  const contexts: Record<string, DtcgTokenTree[]> = {
    [ctx.light]: [],
  };
  if (result.dark) contexts[ctx.dark] = [result.dark];
  if (result.lightContrast) {
    contexts[ctx.lightContrast] = [result.lightContrast];
  }
  if (result.darkContrast) contexts[ctx.darkContrast] = [result.darkContrast];

  return {
    version: options?.version ?? '2025.10',
    sets: {
      [setName]: { sources: [result.light] },
    },
    modifiers: {
      [modifierName]: {
        default: ctx.light,
        contexts,
      },
    },
    resolutionOrder: [
      { $ref: `#/sets/${setName}` },
      { $ref: `#/modifiers/${modifierName}` },
    ],
  };
}

// ============================================================================
// Tailwind CSS v4 (@theme)
// ============================================================================

/** Default `hdrSelector` for `tailwind()`. */
export const DEFAULT_TAILWIND_HDR_SELECTOR = '@media (dynamic-range: high)';

/**
 * Per-scheme declaration lines (`--prop: value;`) accumulated for emission,
 * plus the dense HDR lines (`lightHdr`, …), filled only with `modes.hdr`.
 */
export type GlazeTailwindLines = Record<Scheme | HdrScheme, string[]>;

/** Fresh, empty Tailwind line buckets. */
export function emptyTailwindLines(): GlazeTailwindLines {
  return {
    light: [],
    dark: [],
    lightContrast: [],
    darkContrast: [],
    lightHdr: [],
    darkHdr: [],
    lightContrastHdr: [],
    darkContrastHdr: [],
  };
}

/** Append every bucket of `part` to `acc` (palette accumulation). */
export function mergeTailwindLines(
  acc: GlazeTailwindLines,
  part: GlazeTailwindLines,
): void {
  for (const key of Object.keys(acc) as (keyof GlazeTailwindLines)[]) {
    acc[key].push(...part[key]);
  }
}

function tailwindLinesFor(
  resolved: Map<string, ResolvedColor>,
  themePrefix: string,
  cssPrefix: string,
  format: GlazeColorFormat,
  pastel: boolean,
  modes: Required<GlazeOutputModes>,
): GlazeTailwindLines {
  const lines = emptyTailwindLines();
  const schemes = emittedSchemes(modes);
  for (const [name, color] of resolved) {
    const prop = `--${cssPrefix}${themePrefix}${name}`;
    const dense = modes.hdr && hasHdrIn(color, schemes);
    for (const scheme of SCHEMES) {
      const v = color[scheme];
      const decl = `${prop}: ${formatVariant(v, format, pastel)};`;
      lines[scheme].push(decl);
      if (dense) {
        lines[hdrKey(scheme)].push(
          v.hdr !== undefined ? `${prop}: ${formatHdrVariant(v)};` : decl,
        );
      }
    }
  }
  return lines;
}

function indentBlock(text: string, pad: string): string {
  return text
    .split('\n')
    .map((line) => (line.length === 0 ? line : pad + line))
    .join('\n');
}

function emitRule(selector: string, body: string): string {
  return `${selector} {\n${indentBlock(body, '  ')}\n}`;
}

/**
 * Emit a CSS block for a set of declarations scoped by one or more selectors
 * / at-rules. Class-like selectors concatenate (`.dark.high-contrast`);
 * at-rules (`@media …`) nest `:root` (or the chained selector) inside.
 */
function emitScoped(
  scopes: string[],
  declarations: string[],
): string | undefined {
  if (declarations.length === 0) return undefined;

  const atRules: string[] = [];
  let selectorChain = '';
  for (const scope of scopes) {
    if (scope.startsWith('@')) atRules.push(scope);
    else selectorChain += scope;
  }
  const selector = selectorChain || ':root';

  let css = emitRule(selector, declarations.join('\n'));
  for (const rule of atRules) {
    css = emitRule(rule, css);
  }
  return css;
}

/**
 * Render accumulated per-scheme declaration lines as a Tailwind v4 CSS string:
 * an `@theme` block (light baseline) plus dark / high-contrast overrides under
 * the configured selectors. Empty blocks are skipped.
 *
 * With `modes.hdr`, the dense HDR blocks follow every SDR block, in scheme
 * order: light under `hdrSelector`, dark under `darkSelector` + `hdrSelector`,
 * and so on. Each re-declares the same set of colors, so whichever scheme
 * block wins the cascade in an HDR context carries that scheme's values.
 */
export function emitTailwindCss(
  lines: GlazeTailwindLines,
  modes: Required<GlazeOutputModes>,
  darkSelector: string,
  highContrastSelector: string,
  hdrSelector: string = DEFAULT_TAILWIND_HDR_SELECTOR,
): string {
  const blocks: string[] = [];
  const push = (block: string | undefined): void => {
    if (block) blocks.push(block);
  };

  if (lines.light.length > 0) {
    blocks.push(emitRule('@theme', lines.light.join('\n')));
  }

  if (modes.dark) {
    push(emitScoped([darkSelector], lines.dark));
  }
  if (modes.highContrast) {
    push(emitScoped([highContrastSelector], lines.lightContrast));
  }
  if (modes.dark && modes.highContrast) {
    push(emitScoped([darkSelector, highContrastSelector], lines.darkContrast));
  }

  if (modes.hdr) {
    push(emitScoped([hdrSelector], lines.lightHdr));
    if (modes.dark) {
      push(emitScoped([darkSelector, hdrSelector], lines.darkHdr));
    }
    if (modes.highContrast) {
      push(
        emitScoped([highContrastSelector, hdrSelector], lines.lightContrastHdr),
      );
    }
    if (modes.dark && modes.highContrast) {
      push(
        emitScoped(
          [darkSelector, highContrastSelector, hdrSelector],
          lines.darkContrastHdr,
        ),
      );
    }
  }

  return blocks.join('\n\n');
}

/**
 * Build per-scheme declaration lines for a single theme (used by
 * `theme.tailwind()` and as the palette `buildOne` step). `modes` decides
 * whether the HDR lines are filled and which schemes count toward the dense
 * set.
 */
export function buildTailwindLines(
  resolved: Map<string, ResolvedColor>,
  themePrefix: string,
  cssPrefix: string,
  format: GlazeColorFormat,
  pastel: boolean,
  modes: Required<GlazeOutputModes>,
): GlazeTailwindLines {
  return tailwindLinesFor(
    resolved,
    themePrefix,
    cssPrefix,
    format,
    pastel,
    modes,
  );
}

/**
 * Build a complete Tailwind v4 CSS string for a single theme.
 */
export function buildTailwindMap(
  resolved: Map<string, ResolvedColor>,
  themePrefix: string,
  cssPrefix: string,
  modes: Required<GlazeOutputModes>,
  format: GlazeColorFormat,
  darkSelector: string,
  highContrastSelector: string,
  pastel = false,
  hdrSelector: string = DEFAULT_TAILWIND_HDR_SELECTOR,
): string {
  const lines = tailwindLinesFor(
    resolved,
    themePrefix,
    cssPrefix,
    format,
    pastel,
    modes,
  );
  return emitTailwindCss(
    lines,
    modes,
    darkSelector,
    highContrastSelector,
    hdrSelector,
  );
}
