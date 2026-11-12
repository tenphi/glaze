/**
 * glaze:color — resolves one color the way `glaze.color()` does, without a
 * theme file: its value, hue, saturation and tone in light, dark and both
 * high-contrast schemes, and, with a base, its contrast in each scheme.
 */
import {
  fail,
  loadGlaze,
  parseArgs,
  parseColorArg,
  parseContrast,
  table,
} from './cli.mjs';
import { FORMATS, SCHEMES, inspectColor } from './measure.mjs';

const USAGE = `Usage: npx harnesspm run glaze:color <color> [--base <color>] [--contrast <floor>] [--format <format>] [--json]

<color> is anything glaze.color() takes:
  a value: hex, rgb(), hsl(), okhsl(), okhst() or oklch()
  inline JSON: a value with overrides, such as '{"from":"#2563eb","tone":40}',
  or a structured color, such as '{"hue":250,"saturation":80,"tone":45}'

--base      the color it sits on. It adapts like glaze.color(<base>), and the
            color is measured against it in each scheme (WCAG and APCA).
--contrast  a floor: AA, AAA, AA-large, AAA-large or a ratio such as 4.5
            (WCAG); apca:content or apca:75 (APCA); or inline JSON. Glaze moves
            the color's tone until the floor is met, and raises the floor in
            high contrast by itself.
--format    how to print colors: ${FORMATS.join(', ')} (default hex)
--json      print the result as JSON

APCA polarity comes from the color's role: text, unless the JSON sets "role".
Exits with 1 when a floor is missed in any scheme.`;

const { options, positional } = parseArgs(
  process.argv.slice(2),
  ['base', 'contrast', 'format'],
  ['json', 'help'],
);
if (options.help || positional.length !== 1) {
  console.log(USAGE);
  process.exit(options.help ? 0 : 2);
}
const format = options.format ?? 'hex';
if (!FORMATS.includes(format))
  fail(`--format must be one of ${FORMATS.join(', ')}`);

const warnings = [];
const warn = console.warn;
console.warn = (...args) => warnings.push(args.map(String).join(' '));

const g = await loadGlaze();
let result;
try {
  result = inspectColor(g, parseColorArg(positional[0]), {
    base: options.base === undefined ? undefined : parseColorArg(options.base),
    contrast:
      options.contrast === undefined
        ? undefined
        : parseContrast(options.contrast),
    format,
  });
} catch (error) {
  console.warn = warn;
  fail(error instanceof Error ? error.message : String(error));
}
console.warn = warn;

const missed = SCHEMES.filter((s) => result.schemes[s.key].pass === false);
const unique = [...new Set(warnings)];
if (options.json) {
  console.log(JSON.stringify({ ...result, warnings: unique }, null, 2));
} else {
  console.log(render(result, missed, unique));
}
process.exit(missed.length > 0 ? 1 : 0);

function render(result, missed, warnings) {
  const at = (pick) => SCHEMES.map((s) => pick(result.schemes[s.key]));
  const fixed = (n, digits = 1) => Number(n.toFixed(digits)).toString();
  const hasBase = result.schemes.light.base !== undefined;
  const rows = [
    ['', ...SCHEMES.map((s) => s.label)],
    ['color', ...at((s) => s.value)],
    ['  hue', ...at((s) => fixed(s.hue))],
    ['  saturation', ...at((s) => fixed(s.saturation))],
    ['  tone', ...at((s) => fixed(s.tone))],
  ];
  if (hasBase) {
    const cell = (metric, digits) => (s) => {
      if (s.translucent) return 'translucent';
      const value = s[metric].toFixed(digits);
      if (result.metric !== metric || s.pass === undefined) return value;
      return `${s.pass ? '✓' : '✗'} ${value}`;
    };
    rows.push(
      ['base', ...at((s) => s.base)],
      ['  WCAG', ...at(cell('wcag', 2))],
      ['  APCA Lc', ...at(cell('apca', 1))],
    );
  }
  const out = [`role ${result.role}${floorText(result)}`, '', table(rows), ''];
  if (!hasBase) {
    out.push('No base: pass --base <color> to measure contrast.');
  } else if (result.metric) {
    out.push(
      missed.length === 0
        ? 'The floor is met in all four schemes.'
        : `The floor is missed in ${missed.map((s) => s.label).join(', ')}.`,
    );
  }
  if (warnings.length > 0) {
    out.push('', 'Glaze warnings:', ...warnings.map((w) => `- ${w}`));
  }
  return out.join('\n').trimEnd();
}

function floorText(result) {
  if (!result.metric) return '';
  const normal = result.schemes.light.target;
  const high = result.schemes.lightContrast.target;
  const short = (target) => String(Number(target.toFixed(2)));
  const targets =
    normal === high ? short(normal) : `${short(normal)}, ${short(high)} in HC`;
  return `, floor ${result.metric.toUpperCase()} ≥ ${targets}`;
}
