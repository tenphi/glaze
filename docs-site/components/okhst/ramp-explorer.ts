/**
 * Source for the OKHST page's ramp explorer: a Cookbook `Preview` that draws
 * an evenly spaced ramp for any hue and saturation, along OKHST tone or along
 * OKHSL lightness, with the WCAG contrast between neighbors and each step's
 * value to copy. It is the interactive form of `ToneRamp` and runs the same
 * math in the browser, from the bundle `glaze-preview.ts` describes.
 */

import { GLAZE_SCRIPT, previewBaseCss } from '../glaze-preview';
import type { GlazePreviewSource } from '../glaze-preview';
import { inkForLuminance } from '../glaze-docs';

export function rampExplorer(): GlazePreviewSource {
  const html = `<div class="demo">
  <div class="controls" role="group" aria-label="Ramp" hidden>
    <div class="field">
      <label for="hue">Hue</label>
      <output for="hue" id="hue-value" aria-live="off">280°</output>
      <input type="range" id="hue" min="0" max="359" value="280">
    </div>
    <div class="field">
      <label for="saturation">Saturation</label>
      <output for="saturation" id="saturation-value" aria-live="off">80</output>
      <input type="range" id="saturation" min="0" max="100" value="80">
    </div>
    <div class="field">
      <label for="steps">Steps</label>
      <output for="steps" id="steps-value" aria-live="off">11</output>
      <input type="range" id="steps" min="3" max="21" value="11">
    </div>
    <div class="options">
      <fieldset class="segmented">
        <legend class="visually-hidden">Spacing</legend>
        <label><input type="radio" name="axis" value="tone" checked>Tone</label>
        <label><input type="radio" name="axis" value="lightness">OKHSL lightness</label>
      </fieldset>
      <label class="check"><input type="checkbox" id="pastel">Pastel</label>
    </div>
  </div>
  <div class="result" hidden>
    <div class="ramp" id="ramp" aria-hidden="true"></div>
    <div class="ratios" id="ratios" aria-hidden="true"></div>
    <p class="summary" id="summary"></p>
    <details>
      <summary>Values</summary>
      <pre id="values"></pre>
    </details>
  </div>
  <p class="visually-hidden" aria-live="polite" id="announce"></p>
</div>`;

  const css = `${previewBaseCss()}
.demo { display: grid; gap: 20px; padding: 20px; }
.controls {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px 24px;
}
.options {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 20px;
}
.check { display: flex; align-items: center; gap: 8px; cursor: pointer; }
@media (max-width: 36rem) {
  .demo { padding: 16px; }
  .controls { grid-template-columns: minmax(0, 1fr); }
}
.result { display: grid; gap: 8px; }
.ramp, .ratios {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
}
.ramp {
  overflow: hidden;
  /* The steps touch, so every edge shows its contrast step; the frame keeps
     the black and white ends visible on a page of the same color. */
  border: 1px solid var(--border);
  border-radius: 6px;
}
.step {
  display: grid;
  align-content: end;
  min-height: 64px;
  padding: 4px;
  color: var(--ink);
  font: 600 11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
}
/* A label may run onto the unlabelled steps after it, above their fill. */
.step span { position: relative; white-space: nowrap; }
.ratios {
  color: var(--text-soft);
  font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
  text-align: center;
}
.ratios span { grid-column: span 2; white-space: nowrap; }
.ratios span.offset { grid-column: span 1; }
.step.quiet { color: transparent; }
.summary { margin: 4px 0 0; }
summary { width: fit-content; color: var(--text-soft); cursor: pointer; }
pre {
  overflow-x: auto;
  margin: 8px 0 0;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--card);
  user-select: all;
}`;

  const javascript = `const {
  fromTone,
  okhslToLinearSrgb,
  okhslToSrgb,
  gamutClampedLuminance,
  contrastRatioFromLuminance,
  formatOklch,
} = Glaze;

// Black or white ink, whichever has more contrast on the step: they tie at
// the luminance where (Y + 0.05) / 0.05 = 1.05 / (Y + 0.05).
const INK_CROSSOVER_Y = Math.sqrt(1.05 * 0.05) - 0.05;
const INK = { dark: '${inkForLuminance(1)}', light: '${inkForLuminance(0)}' };
// A step label or a neighbor ratio needs about this many pixels. Narrower
// steps label every other step (or fewer) and leave the ratios to the summary.
const MIN_CELL = 36;

const $ = (id) => document.getElementById(id);
const inputs = { hue: $('hue'), saturation: $('saturation'), steps: $('steps') };
const pastel = $('pastel');
const axes = [...document.querySelectorAll('input[name="axis"]')];

const ratio = (a, b) => contrastRatioFromLuminance(a, b).toFixed(2);
const label = (value) => String(+value.toFixed(1));
const hex = (rgb) =>
  '#' + rgb.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('');

function render() {
  const hue = +inputs.hue.value;
  const saturation = +inputs.saturation.value;
  const steps = +inputs.steps.value;
  const axis = axes.find((a) => a.checked).value;
  const s = saturation / 100;
  const p = pastel.checked;

  const cells = Array.from({ length: steps }, (_, i) => {
    const value = (i * 100) / (steps - 1);
    const l = axis === 'tone' ? fromTone(value) : value / 100;
    const y = gamutClampedLuminance(okhslToLinearSrgb(hue, s, l, p));
    return { value, l, y };
  });

  $('ramp').replaceChildren(
    ...cells.map((cell) => {
      const step = document.createElement('span');
      step.className = 'step';
      step.append(Object.assign(document.createElement('span'), { textContent: label(cell.value) }));
      step.style.background = hex(okhslToSrgb(hue, s, cell.l, p));
      step.style.setProperty('--ink', cell.y > INK_CROSSOVER_Y ? INK.dark : INK.light);
      return step;
    }),
  );

  const ratios = cells.slice(1).map((cell, i) => ratio(cells[i].y, cell.y));
  const offset = () => Object.assign(document.createElement('span'), { className: 'offset' });
  $('ratios').replaceChildren(
    offset(),
    ...ratios.map((r) => Object.assign(document.createElement('span'), { textContent: r })),
    offset(),
  );

  const low = Math.min(...ratios);
  const high = Math.max(...ratios);
  const spacing = axis === 'tone' ? 'tone' : 'OKHSL lightness';
  $('summary').textContent =
    low.toFixed(2) === high.toFixed(2)
      ? 'Evenly spaced in ' + spacing + ': ' + low.toFixed(2) + ':1 between every pair of neighbors.'
      : 'Evenly spaced in ' + spacing + ': ' + low.toFixed(2) + ':1 to ' + high.toFixed(2) + ':1 between neighbors.';

  $('values').textContent = cells
    .map((cell) => {
      const name =
        axis === 'tone' ? 'tone ' + label(cell.value) : 'l ' + label(cell.value) + '%';
      return name.padEnd(10) + hex(okhslToSrgb(hue, s, cell.l, p)) + '  ' + formatOklch(hue, s, cell.l, p);
    })
    .join('\\n');

  $('hue-value').textContent = hue + '°';
  $('saturation-value').textContent = saturation;
  $('steps-value').textContent = steps;
  inputs.hue.setAttribute('aria-valuetext', hue + ' degrees');
  fit();
}

function fit() {
  const ramp = $('ramp');
  const width = ramp.clientWidth / ramp.children.length;
  if (!width) return;
  const every = Math.ceil(MIN_CELL / width);
  [...ramp.children].forEach((step, i) => step.classList.toggle('quiet', i % every !== 0));
  $('ratios').hidden = width < MIN_CELL;
}

for (const input of [...Object.values(inputs), pastel, ...axes]) {
  input.addEventListener('input', render);
  // Read the summary out once a change settles, not on every step of a drag.
  input.addEventListener('change', () => {
    $('announce').textContent = $('summary').textContent;
  });
}

render();
for (const hidden of document.querySelectorAll('.controls, .result')) hidden.hidden = false;
new ResizeObserver(fit).observe($('ramp'));`;

  return {
    html,
    css,
    javascript,
    scripts: [GLAZE_SCRIPT],
    height: '20.5rem',
  };
}
