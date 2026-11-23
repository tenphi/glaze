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
 * - A figure built from a theme gets the same code and table, for the colors
 *   it shows. Every figure keeps its caption.
 * - Cookbook's components become their Markdown equivalents.
 *
 * A page prints a code block or a table once: a figure that repeats the
 * example before it adds only what is new.
 *
 * The build fails on a component missing from `MARKDOWN`: give a new
 * component its form here.
 */

import * as g from '../../src/index.ts';
import type {
  ColorDef,
  GlowColorDef,
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
  resolveDemo,
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
  askedStep,
  compositeRatio,
  stepOf,
} from './shadows-and-glows/lighting-docs.ts';
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
  stepColors,
} from './methodology/palette.ts';
import type { STEP_EXTRAS, StepId } from './methodology/palette.ts';

/** What a component's Markdown form gets besides its props. */
export interface MarkdownContext {
  /** The Markdown between its tags, with nested components converted. */
  children: string;
  /** Blocks the page already printed: a repeat is left out. */
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

/** The color a translucent def composites over, if any. */
function underlayOf(def: ColorDef | undefined): string | undefined {
  if (isLighting(def)) return def.bg;
  if (def && 'type' in def && def.type === 'mix') {
    return def.blend === 'transparent' ? def.base : undefined;
  }
  return undefined;
}

/** The color a def is measured against: its `base`. */
function baseOf(def: ColorDef | undefined): string | undefined {
  if (!def || isLighting(def)) return undefined;
  return def.base;
}

interface Measured {
  demo: ResolvedDemo;
  /** Each color's contrast against its base, as `glaze:inspect` measures it. */
  pairs: Map<string, ContrastPair | undefined>;
  edges: Record<Scheme, number[]>;
}

function measure(theme: DemoTheme): Measured {
  const demo = resolveDemo(theme);
  const inspected = inspectTheme(g, demo.theme, 'theme');
  return {
    demo,
    pairs: new Map(inspected.colors.map((c) => [c.name, c.contrast])),
    edges: windowEdges(theme),
  };
}

interface TableOptions {
  /** Measure every other color against this one: tone step and WCAG ratio. */
  against?: string;
  /** For a color with a `base`: its tone step from the base (`Δ`). */
  delta?: boolean;
  /** For a color with a `base` and no floor: its contrast all the same. */
  ratio?: boolean;
  /** For a foreground with a `base` and no floor: its APCA Lc on the base. */
  lc?: boolean;
  /** Hue and saturation instead of tone, for dark-seed demos. */
  channels?: boolean;
  /** Under each color with a floor: the same color without it. */
  unsolved?: boolean;
  /** Name each measured color's role, which sets APCA's polarity. */
  roles?: boolean;
}

function contrastText(
  metric: 'wcag' | 'apca',
  value: number,
  target?: number,
  pass?: boolean,
): string {
  const text = metric === 'apca' ? `Lc ${fmt(value, 1)}` : `${fmt(value, 2)}:1`;
  if (pass !== false || target === undefined) return text;
  const floor = Number(target.toFixed(2));
  return `${text} (misses ${metric === 'apca' ? `Lc ${floor}` : `${floor}:1`})`;
}

/** One cell: `name` as `theme` resolves it in `scheme`. */
function cell(
  m: Measured,
  theme: DemoTheme,
  name: string,
  scheme: Scheme,
  options: TableOptions,
): string {
  const def = theme.colors[name];
  const v = variantOf(m.demo.resolved, name, scheme);
  const at = (other: string) => variantOf(m.demo.resolved, other, scheme);
  const parts: string[] = [];
  const under = underlayOf(def);

  const pair = m.pairs.get(name);
  const result = pair?.schemes[scheme];

  if (options.channels) {
    parts.push(`h ${fmt(v.h, 1)}`, `s ${fmt(v.s, 2)}`);
  } else if (under) {
    // An overlay: its opacity and the step it paints over its underlay, and
    // the step it asked for when it falls short.
    const got = stepOf(v, at(under));
    let step = signed(got);
    if (isLighting(def)) {
      const asked = askedStep(
        def,
        scheme,
        at(under),
        def.fg === undefined ? undefined : at(def.fg),
      );
      if (Math.abs(got - asked) >= 0.05) step += ` of ${signed(asked)}`;
    }
    parts.push(`α ${fmt(v.alpha, 3)}`, `step ${step}`);
    // A transparent mix's WCAG floor holds for what the browser composites.
    if (
      pair?.metric === 'wcag' &&
      (result?.target !== undefined || options.ratio)
    ) {
      const ratio = compositeRatio(v, at(under));
      const target = result?.target;
      parts.push(
        contrastText(
          'wcag',
          ratio,
          target,
          target === undefined ? undefined : ratio >= target - 1e-9,
        ),
      );
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
  if (base && options.delta && v.alpha === 1) {
    parts.push(`Δ ${signed(toneOf(v) - toneOf(at(base)))}`);
  }
  if (pair && result?.value !== undefined) {
    if (result.target !== undefined || options.ratio) {
      parts.push(
        contrastText(pair.metric, result.value, result.target, result.pass),
      );
    } else if (options.lc && base && pair.role !== 'surface') {
      parts.push(contrastText('apca', apcaLc(v, at(base))));
    }
  }
  return parts.join(' · ');
}

function rowLabel(
  m: Measured,
  theme: DemoTheme,
  name: string,
  options: TableOptions,
): string {
  const def = theme.colors[name];
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

/** What `theme` resolves `names` to in all four schemes, as a table. */
function themeTable(
  theme: DemoTheme,
  names: string[],
  options: TableOptions = {},
): string {
  const m = measure(theme);
  const rows: string[][] = [];
  for (const name of names) {
    if (!(name in theme.colors)) {
      throw new Error(`no color "${name}" in the example's theme`);
    }
    rows.push([
      rowLabel(m, theme, name, options),
      ...SCHEMES.map((s) => cell(m, theme, name, s, options)),
    ]);
    const def = theme.colors[name] as ColorDef & { contrast?: unknown };
    if (options.unsolved && def.contrast !== undefined) {
      const bare = withoutFloor(theme, name);
      const mb = measure(bare);
      rows.push([
        `${code(name)} without its floor`,
        ...SCHEMES.map((s) => cell(mb, bare, name, s, { ratio: true })),
      ]);
    }
  }
  return table(HEAD, rows);
}

/** The colors an example shows: `show`, else every color it defines. */
function shown(theme: DemoTheme, show?: string[]): string[] {
  return show ?? Object.keys(theme.colors);
}

/** The demo theme a UI figure paints: its own props over `UI_DEMO`. */
function uiTheme(props: Partial<DemoTheme>): DemoTheme {
  return { ...UI_DEMO, ...props, colors: props.colors ?? UI_DEMO.colors };
}

/** The theme's code (once per page) and the table of the colors it shows. */
function themeExample(
  theme: ExampleSourceProps,
  context: MarkdownContext,
  names: string[],
  options?: TableOptions,
): string {
  return blocks(
    once(context, fence('ts', exampleSource(theme), 'theme.ts')),
    once(context, themeTable(theme, names, options)),
  );
}

// ============================================================================
// Forms
// ============================================================================

/** A figure that shows the color space, not an example: its caption. */
const figure: MarkdownForm = (p) => caption(p.caption);

const CALLOUTS: Record<string, string> = {
  note: 'NOTE',
  tip: 'TIP',
  caution: 'CAUTION',
  danger: 'WARNING',
};

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
  Card: (p, c) =>
    `- [${p.title}](${p.href})${c.children ? `: ${c.children.replace(/\s+/g, ' ').trim()}` : ''}`,
  Steps: (_p, c) =>
    [...c.children.matchAll(/<li>([\s\S]*?)<\/li>/g)]
      .map((m, i) => `${i + 1}. ${m[1].replace(/\s+/g, ' ').trim()}`)
      .join('\n'),
  Preview: (p) => caption(`${p.title}. Interactive on the site.`),

  // Examples ------------------------------------------------------------------

  Example: (p, c) =>
    blocks(
      once(c, fence('ts', exampleSource(p), p.label ?? 'theme.ts')),
      p.output === 'css' ? fence('css', cssOutput(p), 'Output (CSS)') : '',
      p.visual === 'none' ? '' : once(c, themeTable(p, shown(p, p.show))),
      caption(p.caption),
    ),
  ContrastExample: (p, c) =>
    blocks(
      once(c, fence('ts', exampleSource(p), p.label ?? 'theme.ts')),
      once(
        c,
        themeTable(p, p.rows, {
          unsolved: p.compare === 'unsolved',
          roles: p.showRole,
        }),
      ),
      caption(p.caption),
    ),
  SchemeExample: (p, c) =>
    blocks(
      once(c, fence('ts', exampleSource(p), p.label ?? 'theme.ts')),
      p.visual === 'levels'
        ? ''
        : once(
            c,
            themeTable(
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
      once(c, fence('ts', exampleSource(p), 'theme.ts')),
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
      const own = (metric: 'wcag' | 'apca') =>
        text.metric === metric ? [r.target, r.pass] : [undefined, undefined];
      if (r.wcag !== undefined) {
        const [target, pass] = own('wcag');
        parts.push(
          contrastText('wcag', r.wcag, target as number, pass as boolean),
        );
      }
      if (r.apca !== undefined) {
        const [target, pass] = own('apca');
        parts.push(
          contrastText(
            'apca',
            Math.abs(r.apca),
            target as number,
            pass as boolean,
          ),
        );
      }
      return parts.join(' · ');
    };
    return blocks(
      once(c, fence('ts', tokenPairSource(p), 'tokens.ts')),
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
  PrefixDemo: (p: PaletteDemoProps & { label?: string; caption?: string }, c) =>
    blocks(
      once(c, fence('ts', paletteSource(p), p.label ?? 'palette.ts')),
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

  Swatches: (p, c) =>
    blocks(themeExample(p, c, shown(p, p.show)), caption(p.caption)),
  UiPreview: (p, c) => {
    const theme = uiTheme(p);
    return blocks(themeExample(theme, c, shown(theme)), caption(p.caption));
  },
  SchemeGrid: (p, c) => {
    const theme = uiTheme(p);
    return blocks(
      themeExample(theme, c, shown(theme, p.show)),
      caption(p.caption),
    );
  },
  ContrastSamples: (
    p: DemoTheme & {
      samples: {
        fg: string;
        bg: string;
        note?: string;
        metric?: 'wcag' | 'apca';
      }[];
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
    return blocks(
      once(c, fence('ts', exampleSource(p), 'theme.ts')),
      table(HEAD, rows),
      caption(p.caption),
    );
  },
  ToneLadder: (p, c) =>
    blocks(
      themeExample(p, c, shown(p, p.show), { against: p.base }),
      caption(p.caption),
    ),
  TransparentMix: (p, c) =>
    blocks(themeExample(p, c, p.show), caption(p.caption)),
  ContrastMix: (p, c) =>
    blocks(themeExample(p, c, p.show, { unsolved: true }), caption(p.caption)),
  StateLayers: (p, c) =>
    blocks(
      themeExample(
        p,
        c,
        p.rows.flatMap((row: { layers: { name: string }[] }) =>
          row.layers.map((layer) => layer.name),
        ),
      ),
      caption(p.caption),
    ),
  CardShadows: (p, c) =>
    blocks(
      themeExample(
        p,
        c,
        p.cards.map((card: { shadow: string }) => card.shadow),
      ),
      caption(p.caption),
    ),
  ElevationLadder: (p, c) =>
    blocks(themeExample(p, c, p.levels), caption(p.caption)),
  GlowsPastWhite: (p, c) =>
    blocks(themeExample(p, c, p.glows), caption(p.caption)),
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

  // Figures of the color space, or of a whole UI: the caption ------------------

  FloorCompare: figure,
  MixRamp: figure,
  ObjectInfluence: figure,
  PalettePreview: figure,
  SchemeRamp: figure,
  StatusThemes: figure,
  StepCompare: figure,
  TintedPigment: figure,
  ToneDrift: figure,
  ToneRamp: figure,
  Unreachable: figure,
  WindowMap: figure,
};
