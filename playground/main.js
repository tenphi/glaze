/**
 * OKHST playground — app wiring.
 *
 * Owns the tiny bit of UI state (hue, saturation), binds the two range
 * inputs, and re-renders the swatch ramp on change. All the color math lives
 * in `palette.js`; this file is pure DOM plumbing, kept deliberately small so
 * it is easy to extend (add a third slider, a dark-mode preview, etc.).
 */

import { buildPalette, DEFAULT_STEPS } from './palette.js';

let nextBlockId = 1;

/** Mutable UI state. */
const state = {
  steps: 11,
  blocks: [
    { id: 0, hue: 240, saturation: 80 }
  ]
};

const els = {
  steps: document.querySelector('#steps'),
  stepsValue: document.querySelector('#steps-value'),
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

function updateAccent() {
  if (state.blocks.length === 0) return;
  const firstBlock = state.blocks[0];
  const steps = buildPalette(firstBlock.hue, firstBlock.saturation, state.steps);
  const accent = steps[Math.floor(steps.length / 2)];
  document.documentElement.style.setProperty('--accent', accent.css);
}

function renderBlock(block) {
  const dom = blockElements.get(block.id);
  if (!dom) return;

  dom.hueInput.value = block.hue;
  dom.hueValue.textContent = `${Math.round(block.hue)}°`;
  dom.satInput.value = block.saturation;
  dom.satValue.textContent = String(Math.round(block.saturation));

  const steps = buildPalette(block.hue, block.saturation, state.steps);
  dom.palette.replaceChildren(...steps.map(createSwatch));
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
    updateAccent();
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
    updateAccent();
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
  updateAccent();
}

// Global render when steps change
function renderGlobal() {
  els.steps.value = String(state.steps);
  els.stepsValue.textContent = String(state.steps);
  if (els.footerSteps) els.footerSteps.textContent = String(state.steps);
  renderAllBlocks();
}

function bindGlobalEvents() {
  els.steps.addEventListener('input', () => {
    state.steps = Number(els.steps.value);
    renderGlobal();
  });

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

bindGlobalEvents();
renderGlobal();