/**
 * Output formatting for resolved color maps.
 *
 * Owns the CSS-string formatter dispatch table (`okhsl` / `rgb` / `hsl` /
 * `oklch`) and the token-map shapes Glaze emits:
 * - `buildTokenMap` — Tasty style-to-state bindings (`#name` keys, state aliases).
 * - `buildFlatTokenMap` — `{ light, dark, ... }` per-variant maps.
 * - `buildJsonMap` — `{ name: { light, dark, ... } }` per-color JSON.
 * - `buildCssMap` — CSS custom property declaration strings per variant.
 * - `buildDtcgMap` — W3C DTCG (2025.10) token documents, one per scheme.
 * - `buildDtcgResolver` — W3C DTCG Resolver-Module document (one modifier, a context per scheme).
 * - `buildTailwindMap` — Tailwind v4 `@theme` block + dark/HC overrides.
 */

import {
  buildHuePlans,
  collectHueDeclarations,
  type ChannelCtx,
  type HuePlan,
} from './channels';
import {
  formatHsl,
  formatOkhsl,
  formatOkhst,
  formatOklch,
  formatRgb,
  okhslToOklch,
  okhslToSrgb,
  srgbToHex,
} from './okhsl-color-math';
import { variantToOkhsl } from './okhst';
import { getConfig } from './config';
import type {
  DtcgColorSpace,
  DtcgColorToken,
  DtcgColorValue,
  DtcgDocument,
  DtcgTokenTree,
  GlazeColorFormat,
  GlazeCssResult,
  GlazeDtcgResolverDocument,
  GlazeDtcgResolverOptions,
  GlazeDtcgResult,
  GlazeOutputModes,
  ResolvedColor,
  ResolvedColorVariant,
} from './types';

export type { ChannelCtx } from './channels';

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
  format: GlazeColorFormat = 'okhsl',
  pastel = false,
): string {
  // Variants store canonical tone; convert to OKHSL lightness at the edge.
  // Per-variant `pastel` (set by the resolver from def or config fallback)
  // wins over the format-time fallback, so output matches resolution.
  const effectivePastel = v.pastel ?? pastel;

  let base: string;
  if (format === 'okhst') {
    base = formatOkhst(v.h, v.s * 100, v.t * 100, effectivePastel);
  } else {
    const { l } = variantToOkhsl(v);
    base = formatters[format](v.h, v.s * 100, l * 100, effectivePastel);
  }

  if (v.alpha >= 1) return base;
  const closing = base.lastIndexOf(')');
  return `${base.slice(0, closing)} / ${fmt(v.alpha, 4)})`;
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
      base = formatOklch(v.h, v.s * 100, l * 100, effectivePastel);
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

export function resolveModes(
  override?: GlazeOutputModes,
): Required<GlazeOutputModes> {
  const cfg = getConfig();
  return {
    dark: override?.dark ?? cfg.modes.dark,
    highContrast: override?.highContrast ?? cfg.modes.highContrast,
  };
}

export function buildTokenMap(
  resolved: Map<string, ResolvedColor>,
  prefix: string,
  states: { dark: string; highContrast: string },
  modes: Required<GlazeOutputModes>,
  format: GlazeColorFormat = 'okhsl',
  pastel = false,
  channelCtx?: ChannelCtx,
): Record<string, Record<string, string>> {
  const tokens: Record<string, Record<string, string>> = {};
  const huePlans =
    channelCtx !== undefined && format === 'oklch'
      ? buildHuePlans(resolved, channelCtx)
      : undefined;

  if (huePlans !== undefined && channelCtx !== undefined) {
    const emitDecls = channelCtx.emitDeclarations !== false;
    if (emitDecls && channelCtx.mode === 'theme') {
      tokens[`$${channelCtx.baseName}-hue`] = {
        '': String(channelCtx.seedHue),
      };
    }
    for (const [name, color] of resolved) {
      const plan = huePlans.get(name)!;
      if (emitDecls) {
        for (const decl of plan.declarations) {
          const key = `$${decl.prop.slice(2)}`;
          if (!(key in tokens)) {
            tokens[key] = { '': decl.value };
          }
        }
      }
      const colorKey = `#${prefix}${name}`;
      const planForColor = huePlans.get(name);
      tokens[colorKey] = buildTokenEntry(
        color,
        states,
        modes,
        format,
        pastel,
        planForColor,
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

function buildTokenEntry(
  color: ResolvedColor,
  states: { dark: string; highContrast: string },
  modes: Required<GlazeOutputModes>,
  format: GlazeColorFormat,
  pastel: boolean,
  huePlan?: HuePlan,
): Record<string, string> {
  const entry: Record<string, string> = {
    '': formatColorValue(color.light, format, pastel, huePlan),
  };

  if (modes.dark) {
    entry[states.dark] = formatColorValue(color.dark, format, pastel, huePlan);
  }
  if (modes.highContrast) {
    entry[states.highContrast] = formatColorValue(
      color.lightContrast,
      format,
      pastel,
      huePlan,
    );
  }
  if (modes.dark && modes.highContrast) {
    entry[`${states.dark} & ${states.highContrast}`] = formatColorValue(
      color.darkContrast,
      format,
      pastel,
      huePlan,
    );
  }

  return entry;
}

export function buildFlatTokenMap(
  resolved: Map<string, ResolvedColor>,
  prefix: string,
  modes: Required<GlazeOutputModes>,
  format: GlazeColorFormat = 'okhsl',
  pastel = false,
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

    result.light[key] = formatVariant(color.light, format, pastel);

    if (modes.dark) {
      result.dark[key] = formatVariant(color.dark, format, pastel);
    }
    if (modes.highContrast) {
      result.lightContrast[key] = formatVariant(
        color.lightContrast,
        format,
        pastel,
      );
    }
    if (modes.dark && modes.highContrast) {
      result.darkContrast[key] = formatVariant(
        color.darkContrast,
        format,
        pastel,
      );
    }
  }

  return result;
}

export function buildJsonMap(
  resolved: Map<string, ResolvedColor>,
  modes: Required<GlazeOutputModes>,
  format: GlazeColorFormat = 'okhsl',
  pastel = false,
): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};

  for (const [name, color] of resolved) {
    const entry: Record<string, string> = {
      light: formatVariant(color.light, format, pastel),
    };

    if (modes.dark) {
      entry.dark = formatVariant(color.dark, format, pastel);
    }
    if (modes.highContrast) {
      entry.lightContrast = formatVariant(color.lightContrast, format, pastel);
    }
    if (modes.dark && modes.highContrast) {
      entry.darkContrast = formatVariant(color.darkContrast, format, pastel);
    }

    result[name] = entry;
  }

  return result;
}

export function buildCssMap(
  resolved: Map<string, ResolvedColor>,
  prefix: string,
  suffix: string,
  format: GlazeColorFormat,
  pastel = false,
  channelCtx?: ChannelCtx,
): GlazeCssResult {
  const lines: Record<keyof GlazeCssResult, string[]> = {
    light: [],
    dark: [],
    lightContrast: [],
    darkContrast: [],
  };

  const huePlans =
    channelCtx !== undefined && format === 'oklch'
      ? buildHuePlans(resolved, channelCtx)
      : undefined;

  if (huePlans !== undefined && channelCtx !== undefined) {
    for (const decl of collectHueDeclarations(resolved, channelCtx)) {
      lines.light.push(`${decl.prop}: ${decl.value};`);
    }
  }

  for (const [name, color] of resolved) {
    const prop = `--${prefix}${name}${suffix}`;
    const plan = huePlans?.get(name);
    lines.light.push(
      `${prop}: ${formatColorValue(color.light, format, pastel, plan)};`,
    );
    lines.dark.push(
      `${prop}: ${formatColorValue(color.dark, format, pastel, plan)};`,
    );
    lines.lightContrast.push(
      `${prop}: ${formatColorValue(color.lightContrast, format, pastel, plan)};`,
    );
    lines.darkContrast.push(
      `${prop}: ${formatColorValue(color.darkContrast, format, pastel, plan)};`,
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

  const [r, g, b] = okhslToSrgb(v.h, v.s, l, effectivePastel);
  const value: DtcgColorValue = {
    colorSpace: 'srgb',
    components: [roundTo(r, 6), roundTo(g, 6), roundTo(b, 6)],
    hex: srgbToHex([r, g, b]),
  };
  if (alpha !== undefined) value.alpha = alpha;
  return value;
}

function dtcgToken(
  v: ResolvedColorVariant,
  colorSpace: DtcgColorSpace,
  pastel: boolean,
): DtcgColorToken {
  return { $type: 'color', $value: dtcgColorValue(v, colorSpace, pastel) };
}

/**
 * Build a `GlazeDtcgResult`: one spec-conformant DTCG token document per
 * scheme variant, gated by `modes`. Light is always present.
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

  for (const [name, color] of resolved) {
    const key = `${prefix}${name}`;
    light[key] = dtcgToken(color.light, colorSpace, pastel);
    if (dark) dark[key] = dtcgToken(color.dark, colorSpace, pastel);
    if (lightContrast) {
      lightContrast[key] = dtcgToken(color.lightContrast, colorSpace, pastel);
    }
    if (darkContrast) {
      darkContrast[key] = dtcgToken(color.darkContrast, colorSpace, pastel);
    }
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

/** Per-scheme declaration lines (`--prop: value;`) accumulated for emission. */
export interface GlazeTailwindLines {
  light: string[];
  dark: string[];
  lightContrast: string[];
  darkContrast: string[];
}

function tailwindLinesFor(
  resolved: Map<string, ResolvedColor>,
  themePrefix: string,
  cssPrefix: string,
  format: GlazeColorFormat,
  pastel: boolean,
): GlazeTailwindLines {
  const lines: GlazeTailwindLines = {
    light: [],
    dark: [],
    lightContrast: [],
    darkContrast: [],
  };
  for (const [name, color] of resolved) {
    const prop = `--${cssPrefix}${themePrefix}${name}`;
    lines.light.push(`${prop}: ${formatVariant(color.light, format, pastel)};`);
    lines.dark.push(`${prop}: ${formatVariant(color.dark, format, pastel)};`);
    lines.lightContrast.push(
      `${prop}: ${formatVariant(color.lightContrast, format, pastel)};`,
    );
    lines.darkContrast.push(
      `${prop}: ${formatVariant(color.darkContrast, format, pastel)};`,
    );
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
 */
export function emitTailwindCss(
  lines: GlazeTailwindLines,
  modes: Required<GlazeOutputModes>,
  darkSelector: string,
  highContrastSelector: string,
): string {
  const blocks: string[] = [];

  if (lines.light.length > 0) {
    blocks.push(emitRule('@theme', lines.light.join('\n')));
  }

  if (modes.dark) {
    const dark = emitScoped([darkSelector], lines.dark);
    if (dark) blocks.push(dark);
  }
  if (modes.highContrast) {
    const hc = emitScoped([highContrastSelector], lines.lightContrast);
    if (hc) blocks.push(hc);
  }
  if (modes.dark && modes.highContrast) {
    const dhc = emitScoped(
      [darkSelector, highContrastSelector],
      lines.darkContrast,
    );
    if (dhc) blocks.push(dhc);
  }

  return blocks.join('\n\n');
}

/**
 * Build per-scheme declaration lines for a single theme (used by
 * `theme.tailwind()` and as the palette `buildOne` step).
 */
export function buildTailwindLines(
  resolved: Map<string, ResolvedColor>,
  themePrefix: string,
  cssPrefix: string,
  format: GlazeColorFormat,
  pastel: boolean,
): GlazeTailwindLines {
  return tailwindLinesFor(resolved, themePrefix, cssPrefix, format, pastel);
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
): string {
  const lines = tailwindLinesFor(
    resolved,
    themePrefix,
    cssPrefix,
    format,
    pastel,
  );
  return emitTailwindCss(lines, modes, darkSelector, highContrastSelector);
}
