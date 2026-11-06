/**
 * Source for the home page's theme playground: a Cookbook `Preview` (a
 * sandboxed frame that runs its own HTML, CSS, and JavaScript) holding the
 * `UiPreview` product card with sliders for the seed hue, saturation, and
 * manual contrast level, and the measured WCAG contrast of the card's text,
 * link, and button.
 *
 * The frame runs Glaze itself (see `glaze-preview.ts`) and solves the card's
 * theme again on every input. The color definitions are `UI_COLORS`, written
 * into the source here, so the frame and the static previews share one theme.
 * The card is also painted at build time, in light and dark, so the frame
 * shows it before the script runs (and without it).
 */

import { UI_COLORS, UI_DEMO, UI_ROLES } from '../demo-themes';
import { GLAZE_SCRIPT, previewBaseCss, roleVars } from '../glaze-preview';
import type { GlazePreviewSource } from '../glaze-preview';

/** A measured pair: text on its background, and the floor one of them holds. */
function readout(fg: string, bg: string) {
  for (const name of [fg, bg]) {
    const def = UI_COLORS[name];
    if ('contrast' in def && def.contrast) {
      return { fg, bg, contrast: def.contrast };
    }
  }
  throw new Error(`themePlayground: neither ${fg} nor ${bg} has a floor.`);
}

export function themePlayground(): GlazePreviewSource {
  const vars = roleVars();
  const readouts = {
    body: readout(UI_ROLES.textSoft, UI_ROLES.card),
    link: readout(UI_ROLES.link, UI_ROLES.card),
    button: readout(UI_ROLES.accentLabel, UI_ROLES.accent),
  };
  const hue = UI_DEMO.hue;
  const saturation = UI_DEMO.saturation ?? 0;

  const html = `<div class="demo">
  <div class="result">
    <div class="card">
      <span class="small soft">Quarterly report</span>
      <span class="title">Revenue is up 12%</span>
      <span class="soft">Every color on this card is solved from the seed and the contrast level you set.</span>
      <span class="row">
        <span class="button">Publish</span>
        <span class="small link">View details</span>
      </span>
    </div>
    <dl class="readouts" hidden>
      <div><dt>Body text</dt><dd><output id="body-ratio" aria-live="off"></output><small id="body-floor"></small></dd></div>
      <div><dt>Link</dt><dd><output id="link-ratio" aria-live="off"></output><small id="link-floor"></small></dd></div>
      <div><dt>Button</dt><dd><output id="button-ratio" aria-live="off"></output><small id="button-floor"></small></dd></div>
    </dl>
    <code id="call" hidden></code>
  </div>
  <div class="controls" role="group" aria-label="Theme" hidden>
    <div class="field">
      <label for="hue">Hue</label>
      <output for="hue" id="hue-value" aria-live="off">${hue}°</output>
      <input type="range" id="hue" min="0" max="359" value="${hue}">
    </div>
    <div class="field">
      <label for="saturation">Saturation</label>
      <output for="saturation" id="saturation-value" aria-live="off">${saturation}</output>
      <input type="range" id="saturation" min="0" max="100" value="${saturation}">
    </div>
    <div class="field">
      <label for="level">Contrast level</label>
      <output for="level" id="level-value" aria-live="off">0</output>
      <input type="range" id="level" min="0" max="100" value="0" aria-describedby="level-hint">
      <small id="level-hint">0 is the palette as authored; 100 is its high-contrast tier.</small>
    </div>
    <div class="actions">
      <fieldset class="segmented">
        <legend class="visually-hidden">Scheme</legend>
        <label><input type="radio" name="scheme" value="light">Light</label>
        <label><input type="radio" name="scheme" value="dark">Dark</label>
      </fieldset>
      <button type="button" id="reset">Reset</button>
    </div>
  </div>
  <p class="visually-hidden" aria-live="polite" id="announce"></p>
</div>`;

  const css = `${previewBaseCss()}
.demo {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 17rem;
  align-items: start;
  gap: 24px 32px;
  padding: 24px;
}
@media (max-width: 40rem) {
  .demo { grid-template-columns: minmax(0, 1fr); gap: 20px; padding: 16px; }
}
.result { display: grid; gap: 16px; }
.card {
  display: grid;
  gap: 8px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--card);
  box-shadow: 0 12px 28px -4px var(--shadow);
}
.small { font-size: 13px; }
.soft { color: var(--text-soft); }
.title { font-size: 18px; font-weight: 600; line-height: 1.3; }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 8px; }
.button {
  padding: 6px 12px;
  border-radius: 6px;
  background: var(--accent);
  color: var(--accent-label);
  font-size: 13px;
  font-weight: 600;
}
.link { color: var(--link); font-weight: 600; text-decoration: underline; }
.readouts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
}
.readouts dt { font-size: 13px; color: var(--text-soft); }
.readouts dd { display: grid; margin: 0; }
.readouts output {
  font-size: 20px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.readouts small { font-size: 12px; color: var(--text-soft); }
.controls { display: grid; gap: 16px; }
.actions { display: flex; align-items: center; gap: 8px; }
.actions .segmented { flex: 1; }`;

  const javascript = `// The card's color definitions (UI_COLORS), and which color paints each part.
const COLORS = ${JSON.stringify(UI_COLORS)};
const PARTS = ${JSON.stringify(vars)};
// Each readout: the text and its background, and the contrast floor the
// solved one of the two carries.
const READOUTS = ${JSON.stringify(readouts)};
const DEFAULTS = {
  hue: ${hue},
  saturation: ${saturation},
  // Start at the high-contrast tier when the system asks for more contrast.
  level: matchMedia('(prefers-contrast: more)').matches ? 100 : 0,
};

const {
  glaze,
  variantToOkhsl,
  okhslToLinearSrgb,
  gamutClampedLuminance,
  contrastRatioFromLuminance,
  resolveContrastForLevel,
} = Glaze;

const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const inputs = { hue: $('hue'), saturation: $('saturation'), level: $('level') };
const radios = [...document.querySelectorAll('input[name="scheme"]')];
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
// 'light' or 'dark' once the reader picks one; until then, follow the page.
let pinned = null;
let solved;

const scheme = () => pinned ?? (darkQuery.matches ? 'dark' : 'light');
const seed = () => ({
  hue: +inputs.hue.value,
  saturation: +inputs.saturation.value,
  level: +inputs.level.value,
});

function luminance(v) {
  const { h, s, l } = variantToOkhsl(v);
  return gamutClampedLuminance(okhslToLinearSrgb(h, s, l, v.pastel ?? false));
}

function solve() {
  const { hue, saturation, level } = seed();
  const theme = glaze(hue, saturation, level ? { contrastLevel: level } : undefined);
  theme.colors(COLORS);
  solved = {
    css: theme.json({ format: 'rgb', modes: { dark: true, highContrast: false } }),
    variants: theme.resolve(),
  };
  $('hue-value').textContent = hue + '°';
  $('saturation-value').textContent = saturation;
  $('level-value').textContent = level;
  inputs.hue.setAttribute('aria-valuetext', hue + ' degrees');
  inputs.level.setAttribute('aria-valuetext', level + ' of 100');
  $('call').textContent =
    'glaze(' + hue + ', ' + saturation + (level ? ', { contrastLevel: ' + level + ' }' : '') + ')';
  paint();
}

function paint() {
  const s = scheme();
  for (const [part, name] of Object.entries(PARTS)) {
    root.style.setProperty('--' + part, solved.css[name][s]);
  }
  root.style.colorScheme = s;
  for (const radio of radios) radio.checked = radio.value === s;

  const { level } = seed();
  for (const [id, { fg, bg, contrast }] of Object.entries(READOUTS)) {
    const ratio = contrastRatioFromLuminance(
      luminance(solved.variants.get(fg)[s]),
      luminance(solved.variants.get(bg)[s]),
    );
    const floor = resolveContrastForLevel(contrast, level).target;
    const tier = floor === 4.5 ? 'AA ' : floor === 7 ? 'AAA ' : '';
    $(id + '-ratio').textContent = ratio.toFixed(2) + ':1';
    $(id + '-floor').textContent = tier + 'floor ' + floor.toFixed(2);
  }
}

function announce() {
  const read = (id) => $(id + '-ratio').textContent.replace(':1', ' to 1');
  $('announce').textContent =
    'Body text ' + read('body') + ', link ' + read('link') + ', button ' + read('button') + '.';
}

for (const input of Object.values(inputs)) {
  input.addEventListener('input', solve);
  input.addEventListener('change', announce);
}
for (const radio of radios) {
  radio.addEventListener('change', () => {
    pinned = radio.value;
    paint();
    announce();
  });
}
darkQuery.addEventListener('change', () => {
  if (!pinned) paint();
});
$('reset').addEventListener('click', () => {
  inputs.hue.value = DEFAULTS.hue;
  inputs.saturation.value = DEFAULTS.saturation;
  inputs.level.value = DEFAULTS.level;
  pinned = null;
  solve();
  announce();
});

inputs.level.value = DEFAULTS.level;
solve();
for (const hidden of document.querySelectorAll('[hidden]')) hidden.hidden = false;`;

  return {
    html,
    css,
    javascript,
    scripts: [GLAZE_SCRIPT],
    height: '21.5rem',
  };
}
