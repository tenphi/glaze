/**
 * OKHST playground — app wiring.
 *
 * Owns the tiny bit of UI state (hue, saturation), binds the two range
 * inputs, and re-renders the swatch ramp on change. All the color math lives
 * in `palette.js`; this file is pure DOM plumbing, kept deliberately small so
 * it is easy to extend (add a third slider, a dark-mode preview, etc.).
 */

import { buildPalette, DEFAULT_STEPS } from './palette.js';
import { glaze } from '../src/index.ts';

let nextBlockId = 1;

/** Mutable UI state. */
const state = {
  steps: 11,
  pastel: false,
  lo: 0,
  hi: 100,
  blocks: [
    { id: 0, hue: 240, saturation: 80 }
  ]
};

let saveTimeout;
function scheduleSave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveStateToHash, 250);
}

async function saveStateToHash() {
  const compactState = {
    s: state.steps,
    p: state.pastel,
    l: state.lo,
    h: state.hi,
    b: state.blocks.map(b => [b.hue, b.saturation])
  };
  const json = JSON.stringify(compactState);
  
  try {
    const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const buffer = await new Response(stream).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binString = '';
    for (let i = 0; i < bytes.length; i++) {
      binString += String.fromCharCode(bytes[i]);
    }
    const b64 = btoa(binString).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    window.history.replaceState(null, '', '#' + b64);
  } catch (e) {
    const b64 = btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    window.history.replaceState(null, '', '#u' + b64);
  }
}

async function loadStateFromHash() {
  const hash = window.location.hash.slice(1);
  if (!hash) return false;
  
  try {
    let json;
    if (hash.startsWith('u')) {
      let b64 = hash.slice(1).replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      json = atob(b64);
    } else {
      let b64 = hash.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      const binString = atob(b64);
      const bytes = new Uint8Array(binString.length);
      for (let i = 0; i < binString.length; i++) {
        bytes[i] = binString.charCodeAt(i);
      }
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      json = await new Response(stream).text();
    }
    
    const parsed = JSON.parse(json);
    if (typeof parsed.s === 'number') state.steps = parsed.s;
    if (typeof parsed.p === 'boolean') state.pastel = parsed.p;
    if (typeof parsed.l === 'number') state.lo = parsed.l;
    if (typeof parsed.h === 'number') state.hi = parsed.h;
    if (Array.isArray(parsed.b) && parsed.b.length > 0) {
      state.blocks = parsed.b.map((b, i) => ({
        id: i,
        hue: b[0],
        saturation: b[1]
      }));
      nextBlockId = state.blocks.length;
    }
    return true;
  } catch (e) {
    console.error('Failed to restore state from hash', e);
    return false;
  }
}

const els = {
  steps: document.querySelector('#steps'),
  stepsValue: document.querySelector('#steps-value'),
  lo: document.querySelector('#lo'),
  loValue: document.querySelector('#lo-value'),
  hi: document.querySelector('#hi'),
  hiValue: document.querySelector('#hi-value'),
  pastel: document.querySelector('#pastel'),
  footerSteps: document.querySelector('#footer-steps'),
  blocksContainer: document.querySelector('#blocks-container'),
  addBtn: document.querySelector('#add-palette-btn'),
  template: document.querySelector('#block-template'),
};

const blockElements = new Map(); // id -> { container, hueInput, hueValue, satInput, satValue, palette, removeBtn }

function formatTone(tone) {
  return String(Math.round(tone));
}

// Global scroll sync flag
let isSyncingScroll = false;

function syncScroll(e) {
  if (isSyncingScroll) return;
  isSyncingScroll = true;
  const scrollLeft = e.target.scrollLeft;
  
  document.querySelectorAll('.palette').forEach((p) => {
    if (p !== e.target) {
      p.scrollLeft = scrollLeft;
    }
  });
  
  requestAnimationFrame(() => {
    isSyncingScroll = false;
  });
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

async function copyHex(hex, el) {
  try {
    await navigator.clipboard.writeText(hex);
    el.classList.add('swatch--copied');
    setTimeout(() => el.classList.remove('swatch--copied'), 700);
  } catch {
    /* clipboard may be unavailable (insecure context) — ignore */
  }
}

const handleCopy = (event) => {
  const swatch = event.target.closest('.swatch');
  if (swatch?.dataset.hex) copyHex(swatch.dataset.hex, swatch);
};

let uiThemeStyleEl = document.getElementById('ui-theme');
if (!uiThemeStyleEl) {
  uiThemeStyleEl = document.createElement('style');
  uiThemeStyleEl.id = 'ui-theme';
  document.head.appendChild(uiThemeStyleEl);
}

function updateUITheme() {
  if (state.blocks.length === 0) return;
  const firstBlock = state.blocks[0];
  
  const uiTheme = glaze(firstBlock.hue, 100);
  uiTheme.colors({
    'bg': { tone: 100, saturation: 0.15 },
    'bg-elev': { tone: 96, saturation: 0.15 },
    'bg-elev-2': { tone: 92, saturation: 0.15 },
    'border': { tone: 86, saturation: 0.15 },
    'text': { tone: 5, saturation: 0.15 },
    'text-dim': { tone: 40, saturation: 0.15 },
    'danger': { hue: 10, saturation: 0.8, tone: 50 },
    'accent': { tone: 50, saturation: 0.8 },
  });

  const css = uiTheme.css({ suffix: '', format: 'rgb' });

  uiThemeStyleEl.textContent = `
html[data-theme="light"] { ${css.light} }
html[data-theme="dark"] { ${css.dark} }
@media (prefers-color-scheme: dark) {
  html:not([data-theme="light"]) { ${css.dark} }
}
@media (prefers-color-scheme: light) {
  html:not([data-theme="dark"]) { ${css.light} }
}
  `;
}

function renderBlock(block) {
  const dom = blockElements.get(block.id);
  if (!dom) return;

  dom.hueInput.value = block.hue;
  dom.hueValue.textContent = `${Math.round(block.hue)}°`;
  dom.satInput.value = block.saturation;
  dom.satValue.textContent = String(Math.round(block.saturation));

  const steps = buildPalette(block.hue, block.saturation, state.steps, state.pastel, state.lo, state.hi);
  dom.palette.replaceChildren(...steps.map(createSwatch));
  
  scheduleSave();
}

function createBlockDOM(block) {
  const frag = els.template.content.cloneNode(true);
  const container = frag.querySelector('.block');
  const hueInput = frag.querySelector('.hue-input');
  const hueValue = frag.querySelector('.hue-value');
  const satInput = frag.querySelector('.saturation-input');
  const satValue = frag.querySelector('.saturation-value');
  const palette = frag.querySelector('.palette');
  const removeBtn = frag.querySelector('.btn--remove');

  hueInput.value = block.hue;
  satInput.value = block.saturation;

  hueInput.addEventListener('input', () => {
    block.hue = Number(hueInput.value);
    renderBlock(block);
    updateUITheme();
  });

  satInput.addEventListener('input', () => {
    block.saturation = Number(satInput.value);
    renderBlock(block);
  });

  removeBtn.addEventListener('click', () => {
    state.blocks = state.blocks.filter(b => b.id !== block.id);
    container.remove();
    blockElements.delete(block.id);
    updateRemoveButtons();
    updateUITheme();
    scheduleSave();
  });

  palette.addEventListener('scroll', syncScroll);
  palette.addEventListener('click', handleCopy);

  blockElements.set(block.id, {
    container, hueInput, hueValue, satInput, satValue, palette, removeBtn
  });

  els.blocksContainer.appendChild(container);
  renderBlock(block);
}

function updateRemoveButtons() {
  const canRemove = state.blocks.length > 1;
  state.blocks.forEach(block => {
    const dom = blockElements.get(block.id);
    if (dom) {
      dom.removeBtn.style.display = canRemove ? 'block' : 'none';
    }
  });
}

function renderAllBlocks() {
  state.blocks.forEach(block => {
    if (!blockElements.has(block.id)) {
      createBlockDOM(block);
    }
    renderBlock(block);
  });
  
  updateRemoveButtons();
  updateUITheme();
}

// Global render when steps change
function renderGlobal() {
  els.steps.value = String(state.steps);
  els.stepsValue.textContent = String(state.steps);
  els.lo.value = String(state.lo);
  els.loValue.textContent = String(state.lo);
  els.hi.value = String(state.hi);
  els.hiValue.textContent = String(state.hi);
  if (els.footerSteps) els.footerSteps.textContent = String(state.steps);
  renderAllBlocks();
  scheduleSave();
}

function bindGlobalEvents() {
  els.steps.addEventListener('input', () => {
    state.steps = Number(els.steps.value);
    renderGlobal();
  });

  els.lo.addEventListener('input', () => {
    let val = Number(els.lo.value);
    if (val > state.hi - 50) {
      val = state.hi - 50;
      els.lo.value = String(val);
    }
    state.lo = val;
    renderGlobal();
  });

  els.hi.addEventListener('input', () => {
    let val = Number(els.hi.value);
    if (val < state.lo + 50) {
      val = state.lo + 50;
      els.hi.value = String(val);
    }
    state.hi = val;
    renderGlobal();
  });

  if (els.pastel) {
    els.pastel.addEventListener('change', () => {
      state.pastel = els.pastel.checked;
      renderGlobal();
    });
  }

  els.addBtn.addEventListener('click', () => {
    const lastBlock = state.blocks[state.blocks.length - 1];
    const newBlock = {
      id: nextBlockId++,
      hue: lastBlock ? lastBlock.hue : 240,
      saturation: lastBlock ? lastBlock.saturation : 80
    };
    state.blocks.push(newBlock);
    renderGlobal();
  });
}

function bindThemeSwitcher() {
  const radios = document.querySelectorAll('.theme-switcher__input');
  const savedTheme = localStorage.getItem('playground-theme') || 'system';
  
  function applyTheme(theme) {
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    localStorage.setItem('playground-theme', theme);
  }

  radios.forEach(radio => {
    if (radio.value === savedTheme) radio.checked = true;
    radio.addEventListener('change', (e) => {
      applyTheme(e.target.value);
    });
  });

  applyTheme(savedTheme);
}

async function init() {
  bindGlobalEvents();
  bindThemeSwitcher();
  await loadStateFromHash();
  
  if (els.pastel) els.pastel.checked = state.pastel;
  
  renderGlobal();
}

init();