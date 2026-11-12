/**
 * glaze:inspect — resolves a Glaze theme or palette in all four schemes and
 * measures every color that has a `base` against it. Exits with 1 when a
 * `contrast` floor is missed, so it also works as a check.
 */
import { readFileSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fail, listOf, loadGlaze, parseArgs, table } from './cli.mjs';
import {
  FORMATS,
  SCHEMES,
  filterThemes,
  inspectTheme,
  kindOf,
  missesOf,
  themesFromObject,
  themesFromSnapshot,
} from './measure.mjs';

const USAGE = `Usage: npx harnesspm run glaze:inspect <theme> [--color <part>] [--theme <name>] [--format <format>] [--json]

<theme> is one of:
  a JSON file with a theme.export() or palette.export() snapshot
  inline JSON, such as '{"hue":250,"saturation":20,"colors":{...}}'
  a JS or TS module, optionally with #exportName. Without a name: its default
  export, else every palette it exports, else every theme. TS needs Node 22.18+.

--color   show only colors whose name contains this part, plus the base each
          is measured against. A comma list matches any part: text,border
--theme   show only these themes of a palette, by name: danger,success
--format  how to print colors: ${FORMATS.join(', ')} (default hex)
--json    print the result as JSON

Exits with 1 when a contrast floor is missed in any scheme, among the colors
shown.`;

const { options, positional } = parseArgs(
  process.argv.slice(2),
  ['color', 'theme', 'format'],
  ['json', 'help'],
);
if (options.help || positional.length !== 1) {
  console.log(USAGE);
  process.exit(options.help ? 0 : 2);
}
const format = options.format ?? 'hex';
if (!FORMATS.includes(format))
  fail(`--format must be one of ${FORMATS.join(', ')}`);

// Glaze reports unmet floors and drift with console.warn, also while a module
// is imported, so collect them from the start.
const warnings = [];
const warn = console.warn;
console.warn = (...args) => warnings.push(args.map(String).join(' '));

const g = await loadGlaze();
let themes;
let total = 0;
try {
  const subjects = await load(positional[0]);
  const all = subjects.map(([name, theme]) =>
    inspectTheme(g, theme, name, format),
  );
  total = all.reduce((sum, theme) => sum + theme.colors.length, 0);
  themes = filterThemes(all, {
    themes: listOf(options.theme),
    colors: listOf(options.color),
  });
} catch (error) {
  console.warn = warn;
  fail(error instanceof Error ? error.message : String(error));
}
console.warn = warn;

const misses = missesOf(themes);
const shownNames = new Set(themes.flatMap((t) => t.colors.map((c) => c.name)));
const filtered = options.color !== undefined || options.theme !== undefined;
// A filtered run keeps the warnings that name a color it shows.
const unique = [...new Set(warnings)].filter(
  (w) =>
    !filtered ||
    [...w.matchAll(/"([^"]+)"/g)].some((m) => shownNames.has(m[1])),
);
const hidden = new Set(warnings).size - unique.length;
if (options.json) {
  console.log(JSON.stringify({ themes, misses, warnings: unique }, null, 2));
} else {
  console.log(render(themes, misses, unique, total, hidden));
}
process.exit(misses.length > 0 ? 1 : 0);

async function load(arg) {
  if (arg.trim().startsWith('{')) return themesFromSnapshot(g, JSON.parse(arg));
  const hash = arg.lastIndexOf('#');
  const file = hash > 0 ? arg.slice(0, hash) : arg;
  const exportName = hash > 0 ? arg.slice(hash + 1) : undefined;
  const path = resolve(file);
  if (extname(path) === '.json') {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    return themesFromSnapshot(g, data, basename(path, '.json'));
  }
  const mod = await import(pathToFileURL(path).href);
  if (exportName !== undefined) {
    if (!kindOf(mod[exportName])) {
      throw new Error(`${file} has no theme or palette export "${exportName}"`);
    }
    return themesFromObject(mod[exportName], exportName);
  }
  if (kindOf(mod.default)) return themesFromObject(mod.default, 'default');
  const found = Object.entries(mod).filter(([, value]) => kindOf(value));
  const palettes = found.filter(([, value]) => kindOf(value) === 'palette');
  const chosen = palettes.length > 0 ? palettes : found;
  if (chosen.length === 0) {
    throw new Error(
      `${file} exports no Glaze theme or palette. Name one with ${file}#name.`,
    );
  }
  return chosen.flatMap(([name, value]) => themesFromObject(value, name));
}

function number(metric, value) {
  return metric === 'apca' ? value.toFixed(1) : value.toFixed(2);
}

function floorLabel(pair) {
  const normal = pair.schemes.light?.target;
  const high = pair.schemes.lightContrast?.target;
  const metric = pair.metric.toUpperCase();
  if (normal === undefined && high === undefined) return `${metric}, no floor`;
  const short = (target) => String(Number(target.toFixed(2)));
  const targets =
    normal === high ? short(normal) : `${short(normal)}/${short(high)}`;
  return `${metric} ≥ ${targets}`;
}

function cell(pair, result) {
  if (result.translucent) return 'translucent';
  const value = number(pair.metric, result.value);
  if (result.pass === undefined) return value;
  return `${result.pass ? '✓' : '✗'} ${value}`;
}

function render(themes, misses, warnings, total, hidden) {
  const out = [];
  let floors = 0;
  const shown = themes.reduce((sum, theme) => sum + theme.colors.length, 0);
  if (shown < total) {
    out.push(`Showing ${shown} of ${total} colors.`, '');
  }
  for (const theme of themes) {
    if (theme.colors.length === 0) continue;
    out.push(
      `${theme.name} (hue ${theme.hue}, saturation ${theme.saturation})`,
      '',
    );
    const rows = [['color', '', ...SCHEMES.map((s) => s.label)]];
    for (const color of theme.colors) {
      rows.push([color.name, '', ...SCHEMES.map((s) => color.values[s.key])]);
      const pair = color.contrast;
      if (!pair) continue;
      floors += SCHEMES.filter(
        (s) => pair.schemes[s.key].pass !== undefined,
      ).length;
      rows.push([
        `  vs ${pair.base}`,
        floorLabel(pair),
        ...SCHEMES.map((s) => cell(pair, pair.schemes[s.key])),
      ]);
    }
    out.push(table(rows), '');
  }
  if (floors === 0) {
    out.push('No contrast floors among these colors.');
  } else if (misses.length === 0) {
    out.push(`All ${floors} contrast floors are met.`);
  } else {
    out.push(`${misses.length} of ${floors} contrast floors are missed:`);
    for (const m of misses) {
      out.push(
        `- ${m.theme} ${m.color}, ${m.scheme}: ${m.metric.toUpperCase()} ${number(m.metric, m.value)} < ${number(m.metric, m.target)}`,
      );
    }
  }
  if (warnings.length > 0) {
    out.push('', 'Glaze warnings:', ...warnings.map((w) => `- ${w}`));
  }
  if (hidden > 0) {
    out.push('', `${hidden} more Glaze warnings are about colors not shown.`);
  }
  return out.join('\n');
}
