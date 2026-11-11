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
