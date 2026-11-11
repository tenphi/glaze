/**
 * glaze:contrast — measures a text color on a background with WCAG 2 and
 * APCA, and lists the presets the pair passes.
 */
import { fail, loadGlaze, parseArgs } from './cli.mjs';
import { WCAG_PRESETS, measurePair } from './measure.mjs';

const USAGE = `Usage: npx harnesspm run glaze:contrast <text> <background> [--json]

Colors are anything glaze.color() takes: hex, rgb(), hsl(), okhsl(), okhst()
or oklch(). APCA is not symmetric, so the text color comes first.`;

const { options, positional } = parseArgs(
  process.argv.slice(2),
  [],
  ['json', 'help'],
);
if (options.help || positional.length !== 2) {
  console.log(USAGE);
  process.exit(options.help ? 0 : 2);
}

const g = await loadGlaze();
let result;
try {
  result = measurePair(g, positional[0], positional[1]);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

if (options.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  const list = (passes, targets) =>
    Object.entries(passes)
      .map(
        ([preset, pass]) =>
          `${pass ? '✓' : '✗'} ${preset} (${targets[preset]})`,
      )
      .join('  ');
  console.log(
    [
      `${result.text} on ${result.background}`,
      `WCAG ${result.wcag.toFixed(2)}:1  ${list(result.passes.wcag, WCAG_PRESETS)}`,
      `APCA Lc ${result.apca.toFixed(1)}  ${list(result.passes.apca, g.APCA_PRESETS)}`,
    ].join('\n'),
  );
}
