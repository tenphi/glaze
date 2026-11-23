/**
 * What "Designing a palette" exports: the generated `palette.tasty()` and
 * `palette.css()` output for a few tokens of the composed palette, so the
 * prefix map's effect is visible on real values. `PaletteOutput.astro` shows
 * the blocks on the site; the docs build (`scripts/build-docs.mjs`) prints
 * the same ones.
 *
 * The page configures `states` / `modes` globally with `glaze.configure()`.
 * The docs build shares one Glaze config between pages, so this passes the
 * same `states` / `modes` to the export call instead — the output is
 * identical.
 */

import { glaze, literal } from '../glaze-docs';
import { paletteThemes } from './palette';

const SHOWN = [
  'surface',
  'surface-text',
  'success-surface',
  'success-accent-surface',
  'danger-accent-text',
];

/** One code block: its tab label, language and code. */
export interface OutputBlock {
  label: string;
  language: string;
  code: string;
}

/** The `palette.tasty()` and `palette.css()` blocks, each cut to `SHOWN`. */
export function paletteOutput(): OutputBlock[] {
  const entries = paletteThemes();
  const palette = glaze.palette(Object.fromEntries(entries));
  const prefix = Object.fromEntries(
    entries.map(([name]) => [name, name === 'default' ? '' : `${name}-`]),
  );

  const tasty = palette.tasty({
    prefix,
    states: { dark: '@dark', highContrast: '@hc' },
    modes: { dark: true, highContrast: true },
  });
  const total = Object.keys(tasty).length;
  const tastyShown = Object.fromEntries(
    SHOWN.map((name) => [`#${name}`, tasty[`#${name}`]]),
  );

  const css = palette.css({ prefix });
  const cssLines = css.light.split('\n').filter(Boolean);
  const cssShown = cssLines.filter((line) =>
    SHOWN.some((name) => line.trim().startsWith(`--${name}-color:`)),
  );

  return [
    {
      label: 'palette.tasty({ prefix })',
      language: 'ts',
      code: `// ${total} tokens in all; ${SHOWN.length} shown\n${literal(tastyShown)}`,
    },
    {
      label: 'palette.css({ prefix }).light',
      language: 'css',
      code: `/* ${cssShown.length} of ${cssLines.length} declarations */\n${cssShown.join('\n')}`,
    },
  ];
}
