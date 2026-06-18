/**
 * OKHST playground — app wiring.
 *
 * Owns the tiny bit of UI state (hue, saturation), binds the two range
 * inputs, and re-renders the swatch ramp on change. All the color math lives
 * in `palette.js`; this file is pure DOM plumbing, kept deliberately small so
 * it is easy to extend (add a third slider, a dark-mode preview, etc.).
 */

import { buildPalette, DEFAULT_STEPS } from './palette.js';

/** Initial seed. */
const DEFAULTS = { hue: 240, saturation: 80 };

/** Mutable UI state. */
const state = { ...DEFAULTS };

const els = {
  hue: document.querySelector('#hue'),
  hueValue: document.querySelector('#hue-value'),
  saturation: document.querySelector('#saturation'),
  saturationValue: document.querySelector('#saturation-value'),
  palette: document.querySelector('#palette'),
};

function formatTone(tone) {
  return String(Math.round(tone));
}

/** Reflect the current state back into the slider labels + accent color. */
function renderControls() {
  els.hue.value = String(state.hue);
  els.hueValue.textContent = `${Math.round(state.hue)}°`;
  els.saturation.value = String(state.saturation);
  els.saturationValue.textContent = String(Math.round(state.saturation));
}

/** Build one swatch element from a step descriptor. */
function createSwatch(step) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'swatch';
  el.style.background = step.css;
  el.style.color = step.textColor;
  el.title = `Tone ${formatTone(step.tone)} — click to copy ${step.hex}`;
  el.dataset.hex = step.hex;

  const tone = document.createElement('span');
  tone.className = 'swatch__tone';
  tone.textContent = formatTone(step.tone);

  const hex = document.createElement('span');
  hex.className = 'swatch__hex';
  hex.textContent = step.hex;

  el.append(tone, hex);
  return el;
}

/** Rebuild the palette from the current state. */
function renderPalette() {
  const steps = buildPalette(state.hue, state.saturation, DEFAULT_STEPS);

  // Drive the UI accent from a mid-tone swatch so chrome tracks the seed hue.
  const accent = steps[Math.floor(steps.length / 2)];
  document.documentElement.style.setProperty('--accent', accent.css);

  els.palette.replaceChildren(...steps.map(createSwatch));
}

function render() {
  renderControls();
  renderPalette();
}

async function copyHex(hex, el) {
  try {
    await navigator.clipboard.writeText(hex);
    el.classList.add('swatch--copied');
    setTimeout(() => el.classList.remove('swatch--copied'), 700);
  } catch {
    /* clipboard may be unavailable (insecure context) — ignore */
  }
}

function bindEvents() {
  els.hue.addEventListener('input', () => {
    state.hue = Number(els.hue.value);
    render();
  });

  els.saturation.addEventListener('input', () => {
    state.saturation = Number(els.saturation.value);
    render();
  });

  els.palette.addEventListener('click', (event) => {
    const swatch = event.target.closest('.swatch');
    if (swatch?.dataset.hex) copyHex(swatch.dataset.hex, swatch);
  });
}

bindEvents();
render();
