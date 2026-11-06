/**
 * Build-time helpers shared by the documentation's live examples.
 *
 * Every example resolves real Glaze themes from `src/` while the site builds,
 * so the colors on the page are exactly what the library produces. Colors are
 * handed to Tasty as state maps (`follow`) so an example tracks the reader's
 * Appearance menu, or as a single value (`fixed`) for an example that renders
 * its own static background.
 *
 * Cookbook ships only Tasty-generated CSS — no `style` attributes and no
 * `<style>` tags — so components pass colors through Tasty `styles`.
 */

import {
  apcaContrast,
  contrastRatioFromLuminance,
  gamutClampedLuminance,
  glaze,
  okhslToLinearSrgb,
  variantToOkhsl,
} from '../../src/index.ts';
import { apcaLuminanceFromLinearRgb } from '../../src/okhsl-color-math.ts';
import type {
  ColorMap,
  GlazeConfigOverride,
  GlazeTheme,
  ResolvedColor,
  ResolvedColorVariant,
} from '../../src/index.ts';

export { glaze };

/** The four scheme variants Glaze resolves for every color. */
export type Scheme = 'light' | 'dark' | 'lightContrast' | 'darkContrast';

/** A scheme, or `'auto'` to follow the reader's Appearance menu. */
export type SchemeChoice = Scheme | 'auto';

export const SCHEMES: Scheme[] = [
  'light',
  'dark',
  'lightContrast',
  'darkContrast',
];

export const SCHEME_LABELS: Record<Scheme, string> = {
  light: 'Light',
  dark: 'Dark',
  lightContrast: 'Light · high contrast',
  darkContrast: 'Dark · high contrast',
};

/**
 * Tasty conditions that select each scheme from the site's appearance.
 * `@dark` is Cookbook's own state; `@hc` is registered in `docs.config.ts`
 * (an explicit "High" contrast choice, or the system preference when the
 * reader left it on Auto).
 */
export const SCHEME_STATES: Record<Scheme, string> = {
  light: '!@dark & !@hc',
  dark: '@dark & !@hc',
  lightContrast: '!@dark & @hc',
  darkContrast: '@dark & @hc',
};

/** One color as CSS strings, per scheme. */
export type SchemeColors = Record<Scheme, string>;

/** A Cookbook `Preview`'s source, as a generator builds it for a page. */
export interface PreviewSource {
  html: string;
  css: string;
  javascript: string;
}

/** The seed + color map of a demo theme, as an MDX page passes it in props. */
export interface DemoTheme {
  hue: number;
  saturation?: number;
  darkHue?: number;
  darkSaturation?: number;
  /** Per-theme config override (`glaze(seed, config)`). */
  config?: GlazeConfigOverride;
  colors: ColorMap;
}

export interface ResolvedDemo {
  theme: GlazeTheme;
  /** CSS `rgb()` strings for every color in every scheme (alpha included). */
  colors: Record<string, SchemeColors>;
  /** Raw resolved variants, for measuring contrast and tone. */
  resolved: Map<string, ResolvedColor>;
}

/** Resolve a demo theme with every scheme variant emitted. */
export function resolveDemo(demo: DemoTheme): ResolvedDemo {
  const theme = glaze(
    {
      hue: demo.hue,
      saturation: demo.saturation ?? 0,
      darkHue: demo.darkHue,
      darkSaturation: demo.darkSaturation,
    },
    demo.config,
  );
  theme.colors(demo.colors);
  const json = theme.json({
    format: 'rgb',
    modes: { dark: true, highContrast: true },
  }) as Record<string, SchemeColors>;
  return { theme, colors: json, resolved: theme.resolve() };
}

/** Tasty state map that follows the site's scheme and contrast. */
export function follow(c: SchemeColors): Record<string, string> {
  return {
    '': c.light,
    '@dark': c.dark,
    '@hc': c.lightContrast,
    '@dark & @hc': c.darkContrast,
  };
}

/** A single color value for a statically rendered scheme. */
export function fixed(c: SchemeColors, scheme: Scheme): string {
  return c[scheme];
}

/** `follow` for `'auto'`, `fixed` for a pinned scheme. */
export function paint(
  c: SchemeColors,
  scheme: SchemeChoice,
): string | Record<string, string> {
  return scheme === 'auto' ? follow(c) : fixed(c, scheme);
}

/**
 * Tasty `hide` map that shows an element only in `scheme` — for captions and
 * measured values that differ per scheme.
 */
export function onlyIn(scheme: Scheme): Record<string, boolean> {
  return { '': true, [SCHEME_STATES[scheme]]: false };
}

/** The resolved variant of a color in one scheme. */
export function variantOf(
  resolved: Map<string, ResolvedColor>,
  name: string,
  scheme: Scheme,
): ResolvedColorVariant {
  const color = resolved.get(name);
  if (!color) throw new Error(`docs: unknown demo color "${name}".`);
  return color[scheme];
}

function linear(v: ResolvedColorVariant) {
  const { h, s, l } = variantToOkhsl(v);
  return okhslToLinearSrgb(h, s, l, v.pastel ?? false);
}

/** WCAG 2 contrast ratio between two opaque variants. */
export function wcagContrast(
  a: ResolvedColorVariant,
  b: ResolvedColorVariant,
): number {
  return contrastRatioFromLuminance(
    gamutClampedLuminance(linear(a)),
    gamutClampedLuminance(linear(b)),
  );
}

/** APCA Lc magnitude of `text` over `bg`. */
export function apcaLc(
  text: ResolvedColorVariant,
  bg: ResolvedColorVariant,
): number {
  return Math.abs(
    apcaContrast(
      apcaLuminanceFromLinearRgb(linear(text)),
      apcaLuminanceFromLinearRgb(linear(bg)),
    ),
  );
}

/** Tone (0–100) of a resolved variant. */
export function toneOf(v: ResolvedColorVariant): number {
  return v.t * 100;
}

/**
 * Luminance where black and white text reach the same WCAG contrast
 * (`(Y + 0.05) / 0.05 = 1.05 / (Y + 0.05)`).
 */
const INK_CROSSOVER_Y = Math.sqrt(1.05 * 0.05) - 0.05;

/** Black or white, whichever has more contrast on an opaque color. */
export function inkFor(v: ResolvedColorVariant): string {
  return inkForLuminance(gamutClampedLuminance(linear(v)));
}

/** `inkFor` for a color given by its relative luminance. */
export function inkForLuminance(y: number): string {
  return y > INK_CROSSOVER_Y ? 'rgb(0 0 0 / 0.86)' : 'rgb(255 255 255 / 0.94)';
}

/** `inkFor` per scheme. */
export function inkMap(
  resolved: Map<string, ResolvedColor>,
  name: string,
): SchemeColors {
  const out = {} as SchemeColors;
  for (const s of SCHEMES) out[s] = inkFor(variantOf(resolved, name, s));
  return out;
}

/**
 * Format a number the way the docs print measurements: a fixed number of
 * decimals, so values side by side line up (`0.120` next to `0.108`).
 */
export function fmt(n: number, digits = 2): string {
  const s = n.toFixed(digits);
  return Number(s) === 0 ? s.replace('-', '') : s;
}

// ============================================================================
// Source generation — examples print the code that produced their colors.
// ============================================================================

function isIdentifier(key: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(key);
}

/** Widest line the generated example source aims for. */
const LINE_WIDTH = 64;

/**
 * Serialize a plain value as a TypeScript literal (single quotes, 2 spaces).
 * An object stays on one line when that whole line fits in `LINE_WIDTH`:
 * `indent` levels, `lead` characters already on the line (such as its key)
 * and a trailing comma.
 */
export function literal(value: unknown, indent = 0, lead = 0): string {
  const pad = '  '.repeat(indent);
  const inner = '  '.repeat(indent + 1);
  if (typeof value === 'string') return `'${value.replace(/'/g, "\\'")}'`;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value === null || value === undefined) return String(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => literal(v, indent)).join(', ')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([, v]) => v !== undefined,
  );
  if (entries.length === 0) return '{}';
  const key = (k: string) => (isIdentifier(k) ? k : `'${k}'`);
  const flat = `{ ${entries
    .map(([k, v]) => `${key(k)}: ${literal(v)}`)
    .join(', ')} }`;
  if (
    !flat.includes('\n') &&
    indent * 2 + lead + flat.length + 1 <= LINE_WIDTH
  ) {
    return flat;
  }
  return `{\n${entries
    .map(([k, v]) => {
      const head = `${key(k)}: `;
      return `${inner}${head}${literal(v, indent + 1, head.length)},`;
    })
    .join('\n')}\n${pad}}`;
}

/** The `glaze(...)` + `theme.colors(...)` source for a demo theme. */
export function themeSource(demo: DemoTheme, name = 'theme'): string {
  const plainSeed =
    demo.darkHue === undefined && demo.darkSaturation === undefined;
  // A plain seed prints as `hue, saturation`; a dark seed needs the object.
  const seed: unknown[] = plainSeed
    ? [demo.hue, demo.saturation ?? 0]
    : [
        {
          hue: demo.hue,
          saturation: demo.saturation ?? 0,
          darkHue: demo.darkHue,
          darkSaturation: demo.darkSaturation,
        },
      ];
  const args = demo.config ? [...seed, demo.config] : seed;
  const head = `const ${name} = glaze(`;
  const oneLine = `${head}${args.map((a) => literal(a)).join(', ')});`;
  const call =
    oneLine.length <= LINE_WIDTH && !oneLine.includes('\n')
      ? oneLine
      : `${head}\n${args.map((a) => `  ${literal(a, 1)},`).join('\n')}\n);`;
  return [
    call,
    '',
    `${name}.colors(${literal(demo.colors, 0, name.length + 8)});`,
  ].join('\n');
}
