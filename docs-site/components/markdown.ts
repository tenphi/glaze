/**
 * The Markdown form of every component the docs pages use. The package ships
 * the pages as plain Markdown for coding agents (`scripts/build-docs.mjs`),
 * so each component the site renders live becomes something an agent can
 * read and copy:
 *
 * - An example prints the code the site prints for it, then a table of what
 *   its theme resolves to in all four schemes: each color's tone (or its
 *   opacity and the step it paints), and its contrast against its base,
 *   measured as `glaze:inspect` measures it.
 * - A figure built from a theme adds a table of the colors it shows, and
 *   prints the theme's code too when the page hasn't yet. A figure of
 *   measurements gets a table of them. Every figure keeps its caption.
 * - Cookbook's components become their Markdown equivalents.
 *
 * Figures reuse what the site's components build (`figures.ts`,
 * `glaze-docs.ts` and the other `.ts` modules), so both print the same values.
 * The build fails on a component missing from `MARKDOWN`: give a new
 * component its form here.
 */

import * as g from '../../src/index.ts';
import type {
  ColorDef,
  GlowColorDef,
  MixColorDef,
  Role,
  ShadowColorDef,
} from '../../src/index.ts';
import {
  inspectColor,
  inspectTheme,
} from '../../harness/dev.harnesspm/scripts/measure.mjs';
import type {
  ColorScheme,
  ContrastPair,
} from '../../harness/dev.harnesspm/scripts/measure.mjs';
import {
  SCHEMES,
  apcaLc,
  cssOutput,
  exampleSource,
  fmt,
  literal,
  resolveDemo,
  themeSource,
  toneOf,
  toneText,
  variantOf,
  wcagContrast,
  windowEdges,
} from './glaze-docs.ts';
import type {
  DemoTheme,
  ExampleSourceProps,
  ResolvedDemo,
  Scheme,
} from './glaze-docs.ts';
import { UI_DEMO } from './demo-themes.ts';
import {
  DEFAULT_LIGHTING_TUNING,
  askedStep,
  compositeRatio,
  stepOf,
} from './shadows-and-glows/lighting-docs.ts';
import {
  stepCompare,
  tintedPigmentTheme,
  unreachableTheme,
} from './shadows-and-glows/figures.ts';
import type {
  StepCompareSpec,
  TintedPigmentSpec,
  UnreachableSpec,
} from './shadows-and-glows/figures.ts';
import { mixRamp, solvedValue } from './mixes/figures.ts';
import type { MixRampSpec } from './mixes/figures.ts';
import {
  driftRange,
  driftSummary,
  driftTones,
  edgeLabel,
  floorCompare,
  measuredTone,
  schemeRamp,
  toneRampCells,
} from './okhst/figures.ts';
import type {
  FloorCompareSpec,
  SchemeRampSpec,
  ToneRampSpec,
} from './okhst/figures.ts';
import { toneLabel, windowMap } from './schemes/figures.ts';
import type { WindowMapSpec } from './schemes/figures.ts';
import { tokenPairSource } from './contrast/token-pair.ts';
import type { TokenPairProps } from './contrast/token-pair.ts';
import {
  buildPalette,
  callText,
  paletteSource,
} from './exporting/palette-demo.ts';
import type { PaletteDemoProps } from './exporting/palette-demo.ts';
import { paletteOutput } from './methodology/palette-output.ts';
import {
  PURPLE_HUE,
  SEED_SATURATION,
  STEPS,
  paletteThemes,
  stepColors,
} from './methodology/palette.ts';
import type { STEP_EXTRAS, StepId } from './methodology/palette.ts';

/** What a component's Markdown form gets besides its props. */
export interface MarkdownContext {
  /** The Markdown between its tags, with nested components converted. */
  children: string;
  /** Themes and tables the page already printed: a repeat is left out. */
  printed: Set<string>;
}

/**
 * A component's Markdown form: its props and context in, Markdown out. The
 * props are whatever the page passes; each form reads its own.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MarkdownForm = (props: any, context: MarkdownContext) => string;

// ============================================================================
// Blocks
// ============================================================================

/** Parts that are not empty, one blank line apart. */
function blocks(...parts: string[]): string {
  return parts.filter(Boolean).join('\n\n');
}

/** A fenced code block, titled with the tab label the site shows. */
function fence(language: string, code: string, title?: string): string {
  const runs = [...code.matchAll(/`+/g)].map((m) => m[0].length);
  const ticks = '`'.repeat(Math.max(2, ...runs) + 1);
  const meta = title ? ` title="${title}"` : '';
  return `${ticks}${language}${meta}\n${code}\n${ticks}`;
}

/** `block`, unless the page already printed it. */
function once(context: MarkdownContext, block: string): string {
  if (!block || context.printed.has(block)) return '';
  context.printed.add(block);
  return block;
}

const themeKey = (theme: DemoTheme) => `theme:${themeSource(theme)}`;

/**
 * The code an example prints, as the site prints it. It always prints, and
 * marks its theme printed, so a figure after it doesn't repeat the theme.
 */
function exampleCode(
  context: MarkdownContext,
  props: ExampleSourceProps & { label?: string },
  label = 'theme.ts',
): string {
  if (props.code === undefined) context.printed.add(themeKey(props));
  return fence('ts', exampleSource(props), props.label ?? label);
}

/** A figure's theme, unless the page printed that theme already. */
function figureCode(context: MarkdownContext, theme: DemoTheme): string {
  const key = themeKey(theme);
  if (context.printed.has(key)) return '';
  context.printed.add(key);
  return fence('ts', exampleSource(theme), 'theme.ts');
}

/** A figure's caption, which the site prints under the figure. */
function caption(text: unknown): string {
  if (typeof text !== 'string' || text.trim() === '') return '';
  return `> **Figure:** ${text.replace(/\s+/g, ' ').trim()}`;
}

/** A Markdown table. */
function table(head: string[], rows: string[][]): string {
  const line = (cells: string[]) => `| ${cells.join(' | ')} |`;
  return [line(head), line(head.map(() => '---')), ...rows.map(line)].join(
    '\n',
  );
}

const code = (name: string) => `\`${name}\``;

/** `+8.0` / `-7.0`, with ASCII signs so a value can be copied. */
function signed(n: number): string {
  const s = fmt(Math.abs(n), 1);
  if (Number(s) === 0) return s;
  return `${n < 0 ? '-' : '+'}${s}`;
}

/** Column headings — the four scheme variants. */
const COLUMNS: Record<Scheme, string> = {
  light: 'Light',
  dark: 'Dark',
  lightContrast: 'Light HC',
  darkContrast: 'Dark HC',
};

const HEAD = ['Color', ...SCHEMES.map((s) => COLUMNS[s])];

/** `0`, `10`, … for column headings. */
const whole = (n: number) => fmt(n, 0);

// ============================================================================
// What a theme resolves to
// ============================================================================

function isLighting(
  def: ColorDef | undefined,
): def is ShadowColorDef | GlowColorDef {
  return (
    def !== undefined &&
    'type' in def &&
    (def.type === 'shadow' || def.type === 'glow')
  );
}

function isMix(def: ColorDef | undefined): def is MixColorDef {
  return def !== undefined && 'type' in def && def.type === 'mix';
}

/** The color a translucent def composites over, if any. */
function underlayOf(def: ColorDef | undefined): string | undefined {
  if (isLighting(def)) return def.bg;
  if (isMix(def) && def.blend === 'transparent') return def.base;
  return undefined;
}

/** The color a def is measured against: its `base`. */
function baseOf(def: ColorDef | undefined): string | undefined {
  if (!def || isLighting(def)) return undefined;
  return def.base;
}

interface Measured {
  theme: DemoTheme;
  demo: ResolvedDemo;
  /** Each color's role and floor against its base, as `glaze:inspect` reads them. */
  pairs: Map<string, ContrastPair | undefined>;
  edges: Record<Scheme, number[]>;
}

function measure(theme: DemoTheme): Measured {
  const demo = resolveDemo(theme);
  const inspected = inspectTheme(g, demo.theme, 'theme');
  return {
    theme,
    demo,
    pairs: new Map(inspected.colors.map((c) => [c.name, c.contrast])),
    edges: windowEdges(theme),
  };
}

type Metric = 'wcag' | 'apca';

interface TableOptions {
  /** Measure every other color against this one: tone step and WCAG ratio. */
  against?: string;
  /** For a color with a `base`: its tone step from the base (`Δ`). */
  delta?: boolean;
  /** For a color with a `base`: its WCAG ratio, whatever its floor. */
  ratio?: boolean;
  /** For a foreground with a `base` and no floor: its APCA Lc on the base. */
  lc?: boolean;
  /** Both metrics, the floor's first, then the tone. */
  both?: boolean;
  /** Hue and saturation instead of tone, for dark-seed demos. */
  channels?: boolean;
  /** Under each color with a floor: the same color without it. */
  unsolved?: boolean;
  /** Name each measured color's role, and with `both` the Lc swapped. */
  roles?: boolean;
  /** For a mix: the `value` (or opacity) it ended up with. */
  mixValue?: boolean;
  /** The metric to show for a color with a base and no floor. */
  metric?: Metric;
}

/** `4.55:1` or `Lc 60.5`, and the floor when it is missed. */
function contrastText(metric: Metric, value: number, target?: number): string {
  const text = metric === 'apca' ? `Lc ${fmt(value, 1)}` : `${fmt(value, 2)}:1`;
  if (target === undefined || value >= target - 1e-9) return text;
  const floor = Number(target.toFixed(2));
  return `${text} (misses ${metric === 'apca' ? `Lc ${floor}` : `${floor}:1`})`;
}

/** WCAG and APCA of a color on its base, APCA in the direction its role sets. */
function pairValues(
  v: ReturnType<typeof variantOf>,
  b: ReturnType<typeof variantOf>,
  role: Role,
) {
  const fg = role !== 'surface';
  return {
    wcag: wcagContrast(v, b),
    apca: fg ? apcaLc(v, b) : apcaLc(b, v),
    swapped: fg ? apcaLc(b, v) : apcaLc(v, b),
  };
}

/**
 * The step a shadow / glow asks for, with the theme's tuning, or `undefined`
 * under a manual contrast level, which moves the intensity in between.
 */
function askedFor(
  def: ShadowColorDef | GlowColorDef,
  theme: DemoTheme,
  scheme: Scheme,
  bg: ReturnType<typeof variantOf>,
  fg?: ReturnType<typeof variantOf>,
): number | undefined {
  if (typeof theme.config?.contrastLevel === 'number') return undefined;
  const themeTuning =
    def.type === 'shadow'
      ? theme.config?.shadowTuning
      : theme.config?.glowTuning;
  const objectInfluence =
    def.tuning?.objectInfluence ??
    themeTuning?.objectInfluence ??
    DEFAULT_LIGHTING_TUNING.objectInfluence;
  return askedStep(
    { ...def, tuning: { ...def.tuning, objectInfluence } },
    scheme,
    bg,
    fg,
  );
}

/** One cell: `name` as `m` resolves it in `scheme`. */
function cell(
  m: Measured,
  name: string,
  scheme: Scheme,
  options: TableOptions,
): string {
  const def = m.theme.colors[name];
  const v = variantOf(m.demo.resolved, name, scheme);
  const at = (other: string) => variantOf(m.demo.resolved, other, scheme);
  const pair = m.pairs.get(name);
  const result = pair?.schemes[scheme];
  const target = result?.target;
  const parts: string[] = [];
  const under = underlayOf(def);

  if (options.channels) {
    parts.push(`h ${fmt(v.h, 1)}`, `s ${fmt(v.s, 2)}`);
  } else if (under) {
    // An overlay: its opacity and the step it paints over its underlay, and
    // the step it asked for when it falls short.
    const got = stepOf(v, at(under));
    let step = signed(got);
    if (isLighting(def)) {
      const fg = def.fg === undefined ? undefined : at(def.fg);
      const asked = askedFor(def, m.theme, scheme, at(under), fg);
      if (asked !== undefined && Math.abs(got - asked) >= 0.05) {
        step += ` of ${signed(asked)}`;
      }
    }
    parts.push(`α ${fmt(v.alpha, 3)}`, `step ${step}`);
    // A transparent mix's WCAG floor holds for what the browser composites.
    // An APCA floor on one is not measured here.
    const metric = target !== undefined ? pair?.metric : options.metric;
    if (metric === 'wcag' || (pair && options.ratio)) {
      parts.push(contrastText('wcag', compositeRatio(v, at(under)), target));
    }
    return parts.join(' · ');
  } else if (v.alpha < 1) {
    parts.push(`tone ${fmt(toneOf(v), 1)}`, `α ${fmt(v.alpha, 3)}`);
  } else {
    parts.push(`tone ${toneText(toneOf(v), m.edges[scheme])}`);
  }

  if (options.against !== undefined) {
    if (options.against !== name && v.alpha === 1) {
      const b = at(options.against);
      parts.push(
        `Δ ${signed(toneOf(v) - toneOf(b))}`,
        `${fmt(wcagContrast(v, b), 2)}:1`,
      );
    }
    return parts.join(' · ');
  }

  const base = baseOf(def);
  if (base && options.mixValue && isMix(def)) {
    const value = solvedValue(def, v, at(base), at(def.target));
    parts.push(`value ${fmt(value, 1)}`);
  }
  if (!base || !pair || v.alpha < 1) return parts.join(' · ');
  if (options.delta) parts.push(`Δ ${signed(toneOf(v) - toneOf(at(base)))}`);

  const values = pairValues(v, at(base), pair.role);
  const floor = target !== undefined ? pair.metric : undefined;
  const text = (metric: Metric) =>
    contrastText(metric, values[metric], metric === floor ? target : undefined);

  if (options.both) {
    const first = floor ?? options.metric ?? 'wcag';
    const measured = [text(first), text(first === 'wcag' ? 'apca' : 'wcag')];
    if (options.roles)
      measured.push(`roles swapped Lc ${fmt(values.swapped, 1)}`);
    return [...measured, ...parts].join(' · ');
  }
  if (options.ratio) parts.push(text('wcag'));
  else if (floor) parts.push(text(floor));
  else if (options.metric) parts.push(text(options.metric));
  else if (options.lc && pair.role !== 'surface') parts.push(text('apca'));
  return parts.join(' · ');
}

function rowLabel(m: Measured, name: string, options: TableOptions): string {
  const def = m.theme.colors[name];
  const under = underlayOf(def);
  const other = options.against ?? under ?? baseOf(def);
  let label = code(name);
  if (other !== undefined && other !== name) {
    label += ` ${under && !options.against ? 'over' : 'on'} ${code(other)}`;
  }
  const pair = m.pairs.get(name);
  if (options.roles && pair) label += ` (${pair.role})`;
  return label;
}

/** The same theme with `name`'s contrast floor removed. */
function withoutFloor(theme: DemoTheme, name: string): DemoTheme {
  const { contrast: _contrast, ...rest } = theme.colors[name] as ColorDef & {
    contrast?: unknown;
  };
  return { ...theme, colors: { ...theme.colors, [name]: rest as ColorDef } };
}

function rowsFor(
  m: Measured,
  names: string[],
  options: TableOptions,
  schemes: Scheme[] = SCHEMES,
): string[][] {
  const rows: string[][] = [];
  for (const name of names) {
    if (!(name in m.theme.colors)) {
      throw new Error(`no color "${name}" in the example's theme`);
    }
    rows.push([
      rowLabel(m, name, options),
      ...schemes.map((s) => cell(m, name, s, options)),
    ]);
    const def = m.theme.colors[name] as ColorDef & { contrast?: unknown };
    if (options.unsolved && def.contrast !== undefined) {
      // Measured like the row above: in the floor's metric.
      const bare = measure(withoutFloor(m.theme, name));
      const metric = m.pairs.get(name)?.metric;
      rows.push([
        `${code(name)} without its floor`,
        ...schemes.map((s) =>
          cell(bare, name, s, { ...options, ratio: false, metric }),
        ),
      ]);
    }
  }
  return rows;
}

/** What `theme` resolves `names` to in all four schemes, as a table. */
function themeTable(
  theme: DemoTheme,
  names: string[],
  options: TableOptions = {},
): string {
  return table(HEAD, rowsFor(measure(theme), names, options));
}

/**
 * The theme at each manual contrast level, in light and in dark, with its
 * high-contrast tier last: each color against its base in its floor's metric
 * (WCAG without one).
 */
function levelTables(theme: DemoTheme, levels: number[]): string {
  const columns = [
    ...levels.map((level) => ({
      title: `Level ${level}`,
      m: measure({
        ...theme,
        config: { ...theme.config, contrastLevel: level },
      }),
      slot: (s: 'light' | 'dark'): Scheme => s,
    })),
    {
      title: 'HC tier',
      m: measure(theme),
      slot: (s: 'light' | 'dark'): Scheme =>
        s === 'light' ? 'lightContrast' : 'darkContrast',
    },
  ];
  const names = Object.keys(theme.colors);
  return blocks(
    ...(['light', 'dark'] as const).map((s) =>
      table(
        [COLUMNS[s], ...columns.map((c) => c.title)],
        names.map((name) => [
          rowLabel(columns[0].m, name, {}),
          ...columns.map((c) => cell(c.m, name, c.slot(s), { metric: 'wcag' })),
        ]),
      ),
    ),
  );
}

/** The colors an example shows: `show`, else every color it defines. */
function shown(theme: DemoTheme, show?: string[]): string[] {
  return show ?? Object.keys(theme.colors);
}

/** The demo theme a UI figure paints: its own props over `UI_DEMO`. */
function uiTheme(props: Partial<DemoTheme>): DemoTheme {
  return { ...UI_DEMO, ...props, colors: props.colors ?? UI_DEMO.colors };
}

/** A figure built from a theme: the theme, the table of what it shows, the caption. */
function themeFigure(
  context: MarkdownContext,
  theme: DemoTheme,
  names: string[],
  figureCaption: unknown,
  options?: TableOptions,
): string {
  return blocks(
    figureCode(context, theme),
    once(context, themeTable(theme, names, options)),
    caption(figureCaption),
  );
}

// ============================================================================
// Forms
// ============================================================================

/** A figure whose numbers the page gives itself, or a whole UI: its caption. */
const figure: MarkdownForm = (p) => caption(p.caption);

/** Cookbook's callout kinds as GitHub alerts, by severity. */
const CALLOUTS: Record<string, string> = {
  note: 'NOTE',
  tip: 'TIP',
  caution: 'WARNING',
  danger: 'CAUTION',
};

/** `text` indented under a list item. */
const indent = (text: string) =>
  text
    .split('\n')
    .map((line) => (line ? `  ${line}` : line))
    .join('\n');

export const MARKDOWN: Record<string, MarkdownForm> = {
  // Cookbook ------------------------------------------------------------------

  /** A GitHub alert: `> [!NOTE]`, the title in bold, then the body. */
  Callout: (p, c) => {
    const kind = CALLOUTS[p.kind ?? 'note'];
    if (!kind) throw new Error(`a Callout kind with no alert: "${p.kind}"`);
    const body = blocks(p.title ? `**${p.title}**` : '', c.children);
    return [`[!${kind}]`, ...body.split('\n')]
      .map((line) => (line ? `> ${line}` : '>'))
      .join('\n');
  },
  CodeGroup: (p: {
    items: { label: string; language: string; code: string }[];
  }) => blocks(...p.items.map((i) => fence(i.language, i.code, i.label))),
  CardGrid: (_p, c) => c.children,
  /** A list item; a body of one paragraph follows the link on its line. */
  Card: (p, c) => {
    const link = `- [${p.title}](${p.href})`;
    if (!c.children) return link;
    if (/\n\s*\n|^\s*([-*+] |\d+\. |```|~~~|>)/m.test(c.children)) {
      return `${link}\n\n${indent(c.children)}`;
    }
    return `${link}: ${c.children.replace(/\s+/g, ' ').trim()}`;
  },
  /** An ordered list of its `<li>` items; anything else as it is. */
  Steps: (_p, c) => {
    const items = [...c.children.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)];
    if (items.length === 0) return c.children;
    return items
      .map((m, i) => `${i + 1}. ${m[1].replace(/\s+/g, ' ').trim()}`)
      .join('\n');
  },
  Preview: (p) => caption(`${p.title}. Interactive on the site.`),

  // Examples ------------------------------------------------------------------

  Example: (p, c) =>
    blocks(
      exampleCode(c, p),
      p.output === 'css' ? fence('css', cssOutput(p), 'Output (CSS)') : '',
      p.visual === 'none' ? '' : once(c, themeTable(p, shown(p, p.show))),
      caption(p.caption),
    ),
  /** The floor's metric first, then the other one and the tone. */
  ContrastExample: (p, c) =>
    blocks(
      exampleCode(c, p),
      once(
        c,
        themeTable(p, p.rows, {
          both: true,
          unsolved: p.compare === 'unsolved',
          roles: p.showRole,
        }),
      ),
      caption(p.caption),
    ),
  SchemeExample: (p, c) =>
    blocks(
      exampleCode(c, p),
      once(
        c,
        p.visual === 'levels'
          ? levelTables(p, p.levels ?? [0, 25, 50, 75, 100])
          : themeTable(
              p,
              p.rows?.flatMap((row: { show: string[] }) => row.show) ??
                shown(p, p.show),
              {
                delta: p.delta,
                ratio: p.ratio,
                channels: p.value === 'channels',
              },
            ),
      ),
      caption(p.caption),
    ),
  CssExample: (p, c) =>
    blocks(
      exampleCode(c, p),
      fence('css', cssOutput(p), 'Output (CSS)'),
      caption(p.caption),
    ),
  TokenExample: (p: TokenPairProps, c) => {
    const bg = inspectColor(g, p.base);
    const text = inspectColor(g, p.color, { base: p.base });
    // Tone, then WCAG and APCA against the base; the floor's own metric
    // names its target when the color misses it.
    const cellOf = (r: ColorScheme) => {
      const parts = [`tone ${fmt(r.tone, 1)}`];
      const own = (metric: Metric) =>
        text.metric === metric ? r.target : undefined;
      if (r.wcag !== undefined) {
        parts.push(contrastText('wcag', r.wcag, own('wcag')));
      }
      if (r.apca !== undefined) {
        parts.push(contrastText('apca', Math.abs(r.apca), own('apca')));
      }
      return parts.join(' · ');
    };
    return blocks(
      fence('ts', tokenPairSource(p), 'tokens.ts'),
      table(HEAD, [
        [code('bg'), ...SCHEMES.map((s) => cellOf(bg.schemes[s]))],
        [
          `${code('text')} on ${code('bg')}`,
          ...SCHEMES.map((s) => cellOf(text.schemes[s])),
        ],
      ]),
      caption(p.caption),
    );
  },
  PrefixDemo: (p: PaletteDemoProps & { label?: string; caption?: string }) =>
    blocks(
      fence('ts', paletteSource(p), p.label ?? 'palette.ts'),
      // Each call's token names, in the order the exporter returns them.
      p.calls
        .map((call) => {
          const names = Object.keys(buildPalette(p).tokens(call).light);
          const text = callText(call)
            .replace(/\s*\n\s*/g, ' ')
            .replace(/,\s*\}/g, ' }');
          return `- \`palette.${text}\` returns ${names.length} tokens: ${names.map(code).join(', ')}`;
        })
        .join('\n'),
      caption(p.caption),
    ),
  PaletteOutput: () =>
    blocks(...paletteOutput().map((b) => fence(b.language, b.code, b.label))),

  // Figures built from a theme ------------------------------------------------

  Swatches: (p, c) => themeFigure(c, p, shown(p, p.show), p.caption),
  UiPreview: (p, c) => {
    const theme = uiTheme(p);
    return themeFigure(c, theme, shown(theme), p.caption);
  },
  SchemeGrid: (p, c) => {
    const theme = uiTheme(p);
    return themeFigure(c, theme, shown(theme, p.show), p.caption);
  },
  ContrastSamples: (
    p: DemoTheme & {
      samples: { fg: string; bg: string; note?: string; metric?: Metric }[];
      caption?: string;
    },
    c,
  ) => {
    const { resolved } = resolveDemo(p);
    const rows = p.samples.map((sample) => [
      `${code(sample.fg)} on ${code(sample.bg)}${sample.note ? ` (${sample.note})` : ''}`,
      ...SCHEMES.map((s) => {
        const fg = variantOf(resolved, sample.fg, s);
        const bg = variantOf(resolved, sample.bg, s);
        return sample.metric === 'apca'
          ? contrastText('apca', apcaLc(fg, bg))
          : contrastText('wcag', wcagContrast(fg, bg));
      }),
    ]);
    return blocks(figureCode(c, p), table(HEAD, rows), caption(p.caption));
  },
  ToneLadder: (p, c) =>
    themeFigure(c, p, shown(p, p.show), p.caption, { against: p.base }),
  TransparentMix: (p, c) => themeFigure(c, p, p.show, p.caption),
  ContrastMix: (p, c) =>
    themeFigure(c, p, p.show, p.caption, {
      unsolved: true,
      ratio: true,
      mixValue: true,
    }),
  StateLayers: (p, c) =>
    themeFigure(
      c,
      p,
      p.rows.flatMap((row: { layers: { name: string }[] }) =>
        row.layers.map((layer) => layer.name),
      ),
      p.caption,
    ),
  CardShadows: (p, c) =>
    themeFigure(
      c,
      p,
      p.cards.map((card: { shadow: string }) => card.shadow),
      p.caption,
    ),
  ElevationLadder: (p, c) => themeFigure(c, p, p.levels, p.caption),
  /** The tokens the step adds; the page prints the step's code itself. */
  PaletteStep: (
    p: {
      step: StepId;
      show?: string[];
      extra?: keyof typeof STEP_EXTRAS;
      caption?: string;
    },
    c,
  ) => {
    const theme: DemoTheme = {
      hue: PURPLE_HUE,
      saturation: SEED_SATURATION,
      colors: stepColors(p.step, p.extra),
    };
    return blocks(
      once(
        c,
        themeTable(theme, p.show ?? Object.keys(STEPS[p.step]), { lc: true }),
      ),
      caption(p.caption),
    );
  },

  // Figures of measurements ---------------------------------------------------

  /** Per surface: the solved overlay's step and opacity, the fixed layer's step. */
  StepCompare: (p: StepCompareSpec & { caption?: string }) => {
    const { kind, intensity, fixedAlpha, pigment, surfaces, theme } =
      stepCompare(p);
    const { resolved } = resolveDemo(theme);
    const v = (name: string) => variantOf(resolved, name, 'light');
    return blocks(
      table(
        [
          'Surface',
          `${kind}, intensity ${intensity}`,
          `${pigment} at a fixed ${Number((fixedAlpha * 100).toFixed(1))}%`,
        ],
        surfaces.map((s) => {
          const bg = v(s.name);
          const over = v(`${kind}-${s.name}`);
          return [
            s.label,
            `step ${signed(stepOf(over, bg))} · α ${fmt(over.alpha, 3)}`,
            `step ${signed(stepOf(v('fixed'), bg))}`,
          ];
        }),
      ),
      caption(p.caption),
    );
  },
  Unreachable: (p: UnreachableSpec & { caption?: string }) => {
    const { resolved } = resolveDemo(unreachableTheme(p));
    const v = (name: string) => variantOf(resolved, name, 'light');
    return blocks(
      table(
        ['Overlay', 'Step reached', 'Step asked', 'α'],
        p.cases.map((c, i) => {
          const over = v(`overlay-${i}`);
          const sign = c.kind === 'shadow' ? -1 : 1;
          return [
            `${c.kind} ${c.intensity} on tone ${c.tone}`,
            signed(stepOf(over, v(`surface-${i}`))),
            signed(sign * c.intensity),
            fmt(over.alpha, 3),
          ];
        }),
      ),
      caption(p.caption),
    );
  },
  /** Per surface and tuning: the step, the opacity and the pigment. */
  TintedPigment: (p: TintedPigmentSpec & { caption?: string }) => {
    const { resolved } = resolveDemo(tintedPigmentTheme(p));
    const v = (name: string) => variantOf(resolved, name, 'light');
    return blocks(
      table(
        ['Surface', ...p.columns.map((col) => col.label)],
        p.tones.map((tone) => [
          `tone ${tone}`,
          ...p.columns.map((_, j) => {
            const over = v(`shadow-${tone}-${j}`);
            const pigment = `pigment tone ${fmt(toneOf(over), 1)}${over.s > 0 ? ` h ${fmt(over.h, 0)}` : ''}`;
            return `step ${signed(stepOf(over, v(`surface-${tone}`)))} · α ${fmt(over.alpha, 3)} · ${pigment}`;
          }),
        ]),
      ),
      caption(p.caption),
    );
  },
  /** Per value: the tone of the mix in each blend space. */
  MixRamp: (p: MixRampSpec & { caption?: string }) => {
    const { scheme, spaces, values, theme } = mixRamp(p);
    const { resolved } = resolveDemo(theme);
    return blocks(
      table(
        ['value', ...spaces.map((space) => `tone, space '${space}'`)],
        values.map((value) => [
          whole(value),
          ...spaces.map((space) =>
            fmt(
              toneOf(variantOf(resolved, `mix-${space}-${value}`, scheme)),
              1,
            ),
          ),
        ]),
      ),
      caption(p.caption),
    );
  },
  /** Per row: the plain delta and the floor, each with its ratio and tone. */
  FloorCompare: (p: FloorCompareSpec & { caption?: string }) => {
    const { scheme, delta, contrast, rows, theme } = floorCompare(p);
    const { resolved } = resolveDemo(theme);
    const v = (name: string) => variantOf(resolved, name, scheme);
    const sample = (name: string) =>
      `${fmt(wcagContrast(v(name), v('surface')), 2)}:1 · tone ${fmt(toneOf(v(name)), 1)}`;
    return blocks(
      table(
        [
          'Text color',
          `tone: '${delta}'`,
          typeof contrast === 'object'
            ? `with contrast: ${literal(contrast)}`
            : `with contrast: '${contrast}'`,
        ],
        rows.map((row) => [
          row.label,
          sample(`${row.key}-step`),
          sample(`${row.key}-floor`),
        ]),
      ),
      caption(p.caption),
    );
  },
  /** Per scheme: the tone Glaze stores for each authored tone. */
  SchemeRamp: (p: SchemeRampSpec & { caption?: string }) => {
    const { schemes, tones, names, theme } = schemeRamp(p);
    const { resolved } = resolveDemo(theme);
    return blocks(
      table(
        ['Authored tone', ...tones.map(whole)],
        schemes.map((s) => [
          COLUMNS[s],
          ...names.map((name, i) => {
            const t = toneOf(variantOf(resolved, name, s));
            return i === 0 || i === names.length - 1 ? edgeLabel(t) : fmt(t, 1);
          }),
        ]),
      ),
      caption(p.caption),
    );
  },
  /** Per row (scheme and mode): the tone Glaze stores for each authored tone. */
  WindowMap: (p: WindowMapSpec & { caption?: string }) => {
    const { rows, tones, theme } = windowMap(p);
    const { resolved } = resolveDemo(theme);
    return blocks(
      table(
        ['Authored tone', ...tones.map(whole)],
        // The site's first row prints the authored tones (`mode: 'static'`
        // with no note), which the header gives here.
        rows
          .filter((row) => !(row.mode === 'static' && row.note === ''))
          .map((row) => {
            const mode = row.mode ?? 'auto';
            const note =
              row.note === '' ? '' : ` (${row.note ?? `mode: '${mode}'`})`;
            return [
              `${row.label ?? COLUMNS[row.scheme]}${note}`,
              ...tones.map((_, i) =>
                toneLabel(
                  toneOf(variantOf(resolved, `${mode}-${i}`, row.scheme)),
                ),
              ),
            ];
          }),
      ),
      caption(p.caption),
    );
  },
  /** Each step's tone and lightness, and the WCAG ratio to the next one. */
  ToneRamp: (p: ToneRampSpec & { caption?: string }) => {
    const cells = toneRampCells(p);
    const rows = [
      ['Tone', ...cells.map((cell) => fmt(cell.tone, 1))],
      ['OKHSL lightness', ...cells.map((cell) => fmt(cell.l * 100, 1))],
    ];
    if (p.contrast !== false) {
      rows.push([
        'WCAG to the next step',
        ...cells.map((cell, i) =>
          i === cells.length - 1
            ? '—'
            : `${fmt(g.contrastRatioFromLuminance(cell.y, cells[i + 1].y), 2)}:1`,
        ),
      ]);
    }
    return blocks(
      table(['Step', ...cells.map((cell) => whole(cell.value))], rows),
      caption(p.caption),
    );
  },
  /** Per hue and saturation: the measured tone at each authored tone. */
  ToneDrift: (p: {
    rows: { hue: number; saturation: number; label?: string }[];
    steps?: number;
    caption?: string;
  }) => {
    const tones = driftTones(p.steps);
    return blocks(
      table(
        ['Authored tone', ...tones.map(whole), 'Drift'],
        p.rows.map((row) => {
          const s = row.saturation / 100;
          const [lo, hi] = driftRange(row.hue, s);
          return [
            row.label ?? `hue ${row.hue} · saturation ${row.saturation}`,
            ...tones.map((t) => whole(measuredTone(row.hue, s, g.fromTone(t)))),
            driftSummary(lo, hi),
          ];
        }),
      ),
      caption(p.caption),
    );
  },
  /** Each theme's token count and prefix. */
  StatusThemes: (p) =>
    blocks(
      paletteThemes()
        .map(
          ([name, theme]) =>
            `- \`${name}\`: ${theme.list().length} tokens, ${name === 'default' ? 'unprefixed' : `prefixed \`${name}-\``}`,
        )
        .join('\n'),
      caption(p.caption),
    ),

  // Figures the page follows with a table of its own, or with nothing to
  // measure: the caption ----------------------------------------------------

  GlowsPastWhite: figure,
  ObjectInfluence: figure,
  PalettePreview: figure,
};
