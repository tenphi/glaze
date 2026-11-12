/** Shared parts of the Glaze tools: loading the build, options and tables. */
import { existsSync } from 'node:fs';

const BUILD = new URL('../../../dist/index.mjs', import.meta.url);

/** The Glaze build of this package. In the Glaze repository, run `pnpm build` first. */
export async function loadGlaze() {
  if (!existsSync(BUILD)) {
    fail(
      `cannot find the Glaze build at ${BUILD.pathname}. In the Glaze repository, run \`pnpm build\` first.`,
    );
  }
  return import(BUILD.href);
}

export function fail(message) {
  console.error(`glaze: ${message.replace(/^glaze: /, '')}`);
  process.exit(2);
}

/** Splits `--name value` and `--flag` options from positional arguments. */
export function parseArgs(argv, valueOptions, flagOptions) {
  const options = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const [key, inline] = arg.slice(2).split(/=(.*)/s);
    if (flagOptions.includes(key)) options[key] = true;
    else if (valueOptions.includes(key)) {
      const value = inline ?? argv[++i];
      if (value === undefined) fail(`--${key} needs a value`);
      options[key] = value;
    } else fail(`unknown option --${key}`);
  }
  return { options, positional };
}

/** Left-aligned columns, two spaces apart. */
export function table(rows) {
  const widths = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, cell.length);
    });
  }
  return rows
    .map((row) =>
      row
        .map((cell, i) =>
          i === row.length - 1 ? cell : cell.padEnd(widths[i]),
        )
        .join('  ')
        .trimEnd(),
    )
    .join('\n');
}

/** A command-line color: inline JSON (an object) as is, anything else as a color string. */
export function parseColorArg(arg) {
  if (!arg.trim().startsWith('{')) return arg;
  try {
    return JSON.parse(arg);
  } catch (error) {
    throw new Error(
      `invalid JSON in "${arg}": ${error instanceof Error ? error.message : error}`,
    );
  }
}

/**
 * A `--contrast` value as a Glaze contrast spec: `AA`, `AAA`, `AA-large`,
 * `AAA-large` or a ratio such as `4.5` for WCAG; `apca:content` or `apca:75`
 * for APCA; or inline JSON, such as `{"apca":["content","body"]}`.
 */
export function parseContrast(arg) {
  const text = arg.trim();
  if (text.startsWith('{') || text.startsWith('[')) return JSON.parse(text);
  const match = /^(wcag|apca):(.+)$/i.exec(text);
  const value = match ? match[2].trim() : text;
  const number = /^\d+(\.\d+)?$/.test(value) ? Number(value) : value;
  return match ? { [match[1].toLowerCase()]: number } : number;
}

/** A comma-separated option as a list, without empty parts. */
export function listOf(value) {
  return value === undefined
    ? []
    : value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
}
