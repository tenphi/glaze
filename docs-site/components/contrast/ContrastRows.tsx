/**
 * Contrast-solved colors drawn against their base, one row per color, with
 * the measured WCAG ratio and APCA Lc for the scheme the reader is viewing.
 *
 * Each row paints a sample the way the color's role says it is used: a `text`
 * or `border` color is drawn as text on its base, a `surface` color as a fill
 * with the base drawn on top as text. APCA is measured in that same direction,
 * so the numbers match what the solver optimized.
 *
 * `compare` adds a second cell per row:
 * - `'unsolved'` — the same theme with the row's `contrast` removed: where the
 *   authored tone would have landed without the floor.
 * - `'hc'` — the normal and high-contrast variants side by side, both following
 *   the reader's light / dark choice.
 *
 * Every number is measured from the resolved theme while the site builds.
 */

import type { ReactNode } from 'react';
import { tasty } from '@tenphi/cookbook/styling';
import { Eyebrow, Figure, Mono } from '../primitives';
import {
  SCHEMES,
  apcaLc,
  fmt,
  literal,
  onlyIn,
  paint,
  resolveDemo,
  toneOf,
  variantOf,
  wcagContrast,
} from '../glaze-docs';
import type {
  DemoTheme,
  ResolvedDemo,
  Scheme,
  SchemeChoice,
  SchemeColors,
} from '../glaze-docs';
import {
  inferRoleFromName,
  normalizeRole,
  oppositeRole,
  resolveContrastForLevel,
  roleToPolarity,
} from '../../../src/index.ts';
import type {
  ColorDef,
  ColorMap,
  ContrastSpec,
  HCPair,
  ResolvedColorVariant,
  Role,
} from '../../../src/index.ts';

// ============================================================================
// Measuring
// ============================================================================

/**
 * Resolve a demo without printing the library's contrast warnings: several
 * examples on the contrast page miss their floor on purpose, and the figure
 * itself reports it.
 */
export function quietly<T>(fn: () => T): T {
  const warn = console.warn;
  console.warn = () => {};
  try {
    return fn();
  } finally {
    console.warn = warn;
  }
}

/** The role chain the resolver uses: explicit → name → opposite of base → text. */
export function roleOf(
  name: string,
  colors: ColorMap,
  inferRole: boolean,
): { role: Role; from: 'role' | 'name' | 'base' | 'default' } {
  const def = colors[name] as
    | (ColorDef & { role?: string; base?: string })
    | undefined;
  if (!def) return { role: 'text', from: 'default' };
  if ('type' in def && (def.type === 'shadow' || def.type === 'glow')) {
    return { role: 'surface', from: 'default' };
  }
  const explicit = normalizeRole(def.role as never);
  if (explicit) return { role: explicit, from: 'role' };
  const inferred = inferRole ? inferRoleFromName(name) : undefined;
  if (inferred) return { role: inferred, from: 'name' };
  if (def.base) {
    if (!colors[def.base]) return { role: 'text', from: 'base' };
    return {
      role: oppositeRole(roleOf(def.base, colors, inferRole).role),
      from: 'base',
    };
  }
  return { role: 'text', from: 'default' };
}

function isHighContrast(s: Scheme): boolean {
  return s === 'lightContrast' || s === 'darkContrast';
}

function isDark(s: Scheme): boolean {
  return s === 'dark' || s === 'darkContrast';
}

/** One measured pair in one scheme. */
interface Measured {
  ratio: number;
  /** APCA Lc in the direction the role implies. */
  lc: number;
  /** APCA Lc with text and background swapped. */
  lcReversed: number;
  tone: number;
  /** The floor in force for this scheme, if the color has one. */
  floor?: { metric: 'wcag' | 'apca'; target: number; met: boolean };
}

export function measurePair(
  v: ResolvedColorVariant,
  b: ResolvedColorVariant,
  polarity: 'fg' | 'bg',
  spec: HCPair<ContrastSpec> | undefined,
  scheme: Scheme,
): Measured {
  const ratio = wcagContrast(v, b);
  const lc = polarity === 'bg' ? apcaLc(b, v) : apcaLc(v, b);
  const lcReversed = polarity === 'bg' ? apcaLc(v, b) : apcaLc(b, v);
  const out: Measured = { ratio, lc, lcReversed, tone: toneOf(v) };
  if (spec !== undefined) {
    // `'auto'` resolution is the level-0 / level-100 endpoint of the same
    // function, so this is exactly the target the solver aimed for.
    const r = resolveContrastForLevel(
      spec,
      isHighContrast(scheme) ? 100 : 0,
      polarity,
    );
    const value = r.metric === 'apca' ? lc : ratio;
    out.floor = {
      metric: r.metric,
      target: r.target,
      met: value + 1e-3 >= r.target,
    };
  }
  return out;
}

export function ratioLabel(r: number): string {
  return `${fmt(r, 2)}:1`;
}

/** Non-breaking space: a label never wraps away from its number. */
const NBSP = '\u00a0';

export function lcLabel(lc: number): string {
  return `Lc${NBSP}${fmt(lc, 1)}`;
}

function floorLabel(f: NonNullable<Measured['floor']>): string {
  return f.metric === 'apca' ? lcLabel(f.target) : ratioLabel(f.target);
}

// ============================================================================
// Drawing
// ============================================================================

const Rows = tasty({ styles: { display: 'grid', gap: '2.5x' } });

const Row = tasty({ styles: { display: 'grid', gap: '1x' } });

/** Row heading: the color's name, its floor, and (optionally) its role. */
const Label = tasty({
  styles: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5x 1.5x',
    alignItems: 'baseline',
    preset: 'small',
    color: '#text-soft',
    Name: { preset: 'code', fontWeight: 600, color: '#text' },
  },
  elements: { Name: 'span' },
});

/** The row's cells: stacked on narrow screens, side by side from `@sm`. */
const Cells = tasty({ styles: { display: 'grid', gap: '1.5x' } });

const Cell = tasty({
  styles: {
    display: 'grid',
    gap: '0.75x 2x',
    alignContent: 'start',
    alignItems: 'center',
  },
});

/** A lone cell puts its numbers beside the sample once there is room. */
const LONE_CELL = { '': '1fr', '@sm': 'minmax(0, 3fr) minmax(0, 2fr)' };

/** The colored sample: a block painted with the pair. */
export const Sample = tasty({
  styles: {
    display: 'grid',
    gap: '0.25x',
    padding: '1.5x 2x',
    radius: '1r',
    border: '1bw solid #border',
    preset: 'body',
    Big: { preset: 'h5', margin: '0' },
  },
  elements: { Big: 'span' },
});

const Metrics = tasty({
  styles: {
    display: 'grid',
    gap: '0.25x',
    preset: 'small',
    color: '#text-soft',
    Main: { preset: 'code', color: '#text', fontWeight: 600 },
  },
  elements: { Main: 'span' },
});

/** Wrapper that shows its children only in one scheme. */
const Only = tasty({ styles: {} });

/** Render per-scheme content: one block per scheme, Tasty shows the active one. */
export function PerScheme(props: {
  scheme: SchemeChoice;
  render: (s: Scheme) => ReactNode;
}) {
  if (props.scheme !== 'auto') return <>{props.render(props.scheme)}</>;
  return (
    <>
      {SCHEMES.map((s) => (
        <Only key={s} styles={{ hide: onlyIn(s) }}>
          {props.render(s)}
        </Only>
      ))}
    </>
  );
}

export function MetricsBlock(props: {
  scheme: SchemeChoice;
  measure: (s: Scheme) => Measured;
  /** Also print the Lc with text and background swapped. */
  reversed?: boolean;
}) {
  return (
    <PerScheme
      scheme={props.scheme}
      render={(s) => {
        const m = props.measure(s);
        const apcaFirst = m.floor?.metric === 'apca';
        const main = apcaFirst
          ? `${lcLabel(m.lc)} · ${ratioLabel(m.ratio)}`
          : `${ratioLabel(m.ratio)} · ${lcLabel(m.lc)}`;
        return (
          <Metrics>
            <Metrics.Main>{main}</Metrics.Main>
            <span>
              {m.floor
                ? `floor${NBSP}${floorLabel(m.floor)} · ${m.floor.met ? 'met' : `not${NBSP}met`} · `
                : ''}
              {`tone${NBSP}${fmt(m.tone, 1)}`}
            </span>
            {props.reversed ? (
              <span>roles swapped: {lcLabel(m.lcReversed)}</span>
            ) : null}
          </Metrics>
        );
      }}
    />
  );
}

/** Remap a color's per-scheme CSS through a scheme → scheme function. */
function remap(c: SchemeColors, at: (s: Scheme) => Scheme): SchemeColors {
  const out = {} as SchemeColors;
  for (const s of SCHEMES) out[s] = c[at(s)];
  return out;
}

interface CellSpec {
  label?: string;
  demo: ResolvedDemo;
  /** Which resolved scheme this cell shows when the reader views `s`. */
  at: (s: Scheme) => Scheme;
}

const same = (s: Scheme): Scheme => s;
const normalOf = (s: Scheme): Scheme => (isDark(s) ? 'dark' : 'light');
const hcOf = (s: Scheme): Scheme =>
  isDark(s) ? 'darkContrast' : 'lightContrast';

export interface ContrastRowsProps extends DemoTheme {
  /** Colors to draw, in order. Each must have a `base`. */
  rows: string[];
  compare?: 'unsolved' | 'hc';
  scheme?: SchemeChoice;
  /** Show each row's resolved role and where it came from. */
  showRole?: boolean;
  /** Sample text: one for every row, or per row name. */
  sample?: string | Record<string, string>;
  caption?: ReactNode;
}

function sampleFor(sample: ContrastRowsProps['sample'], name: string) {
  const text = typeof sample === 'string' ? sample : sample?.[name];
  return text ?? 'Aa Readable';
}

function withoutContrast(colors: ColorMap, rows: string[]): ColorMap {
  const out: ColorMap = { ...colors };
  for (const name of rows) {
    const { contrast: _contrast, ...rest } = colors[name] as ColorDef & {
      contrast?: unknown;
    };
    out[name] = rest as ColorDef;
  }
  return out;
}

export default function ContrastRows(props: ContrastRowsProps) {
  const scheme = props.scheme ?? 'auto';
  const main = quietly(() => resolveDemo(props));
  const inferRole = props.config?.inferRole ?? true;

  let cells: CellSpec[];
  if (props.compare === 'unsolved') {
    const bare = quietly(() =>
      resolveDemo({
        ...props,
        colors: withoutContrast(props.colors, props.rows),
      }),
    );
    cells = [
      { label: 'Without the floor', demo: bare, at: same },
      { label: 'With the floor', demo: main, at: same },
    ];
  } else if (props.compare === 'hc') {
    cells = [
      { label: 'Normal', demo: main, at: normalOf },
      { label: 'High contrast', demo: main, at: hcOf },
    ];
  } else {
    cells = [{ demo: main, at: same }];
  }

  const columns = `repeat(${cells.length}, minmax(0, 1fr))`;

  return (
    <Figure caption={props.caption}>
      <Rows>
        {props.rows.map((name) => {
          const def = props.colors[name] as ColorDef & {
            base?: string;
            contrast?: HCPair<ContrastSpec>;
          };
          const base = def.base;
          if (!base) throw new Error(`docs: row "${name}" needs a base.`);
          const { role, from } = roleOf(name, props.colors, inferRole);
          const polarity = roleToPolarity(role);

          return (
            <Row key={name}>
              <Label>
                <Label.Name>{name}</Label.Name>
                {def.contrast !== undefined ? (
                  <Mono>contrast: {literal(def.contrast)}</Mono>
                ) : null}
                {props.showRole ? (
                  <span>
                    role {role}
                    {from === 'role'
                      ? ' (explicit)'
                      : from === 'name'
                        ? ' (from the name)'
                        : from === 'base'
                          ? ' (opposite of base)'
                          : ''}
                  </span>
                ) : null}
              </Label>
              <Cells styles={{ gridColumns: { '': '1fr', '@sm': columns } }}>
                {cells.map((cell, i) => {
                  const own = remap(cell.demo.colors[name], cell.at);
                  const under = remap(cell.demo.colors[base], cell.at);
                  const fill = polarity === 'bg' ? own : under;
                  const ink = polarity === 'bg' ? under : own;
                  return (
                    <Cell
                      key={i}
                      styles={
                        cells.length === 1 ? { gridColumns: LONE_CELL } : {}
                      }
                    >
                      {cell.label ? <Eyebrow>{cell.label}</Eyebrow> : null}
                      <Sample
                        styles={{
                          fill: paint(fill, scheme),
                          color: paint(ink, scheme),
                        }}
                      >
                        <Sample.Big>{sampleFor(props.sample, name)}</Sample.Big>
                        <span>The quick brown fox</span>
                      </Sample>
                      <MetricsBlock
                        scheme={scheme}
                        reversed={props.showRole}
                        measure={(s) =>
                          measurePair(
                            variantOf(cell.demo.resolved, name, cell.at(s)),
                            variantOf(cell.demo.resolved, base, cell.at(s)),
                            polarity,
                            def.contrast,
                            cell.at(s),
                          )
                        }
                      />
                    </Cell>
                  );
                })}
              </Cells>
            </Row>
          );
        })}
      </Rows>
    </Figure>
  );
}
