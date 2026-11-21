/** Shared parts of the Glaze tools: loading the build, options and tables. */
import { existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, resolve } from 'node:path';

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

/**
 * A module argument as an absolute file path. A path that starts with `.` or
 * `/`, or names an existing file, resolves from the first folder. Anything
 * else is a path inside an installed package, such as
 * `@acme/ui/harness/theme.mjs`, looked up from each folder in turn: through
 * the package's `exports`, then in the `node_modules` folders above the
 * folder, for a file the `exports` do not list.
 */
export function resolveModule(spec, folders = [process.cwd()]) {
  const asPath = resolve(folders[0], spec);
  if (spec.startsWith('.') || isAbsolute(spec) || isFile(asPath)) {
    if (!isFile(asPath))
      throw new Error(`cannot find ${spec} in ${folders[0]}`);
    return asPath;
  }
  for (const folder of new Set(folders)) {
    try {
      return createRequire(join(folder, 'noop.js')).resolve(spec);
    } catch {
      // A path the package's exports do not list, such as a file in harness/.
    }
    for (let dir = folder; ; dir = dirname(dir)) {
      const candidate = join(dir, 'node_modules', spec);
      if (isFile(candidate)) return candidate;
      if (dirname(dir) === dir) break;
    }
  }
  throw new Error(
    `cannot find ${spec}: it is not a file in ${folders[0]}, nor a module of a package installed in ${[...new Set(folders)].join(' or ')}`,
  );
}

function isFile(path) {
  return existsSync(path) && statSync(path).isFile();
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
