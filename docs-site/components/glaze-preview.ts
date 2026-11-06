/**
 * Shared pieces for the Cookbook `Preview` frames that run Glaze in the
 * browser (`home/theme-playground.ts`, `okhst/ramp-explorer.ts`).
 *
 * A frame loads the browser bundle `docs-site/demo-bundle.ts` builds through
 * its `scripts`, and paints its own chrome — page, text, borders, controls —
 * with the `UI_DEMO` theme, resolved here at build time for light and dark.
 * The chrome follows `prefers-color-scheme`, which in Chromium is the site's
 * light or dark appearance.
 */

import { UI_DEMO, UI_ROLES } from './demo-themes';
import { resolveDemo } from './glaze-docs';
import type { PreviewSource } from './glaze-docs';

/** The browser bundle `docs-site/demo-bundle.ts` writes to `public/`. */
export const GLAZE_SCRIPT = '/demo/glaze.iife.js';

/** A preview that runs the bundle, with the frame's height before it fits. */
export interface GlazePreviewSource extends PreviewSource {
  scripts: string[];
  /** The frame's height on a desktop-width page, so it doesn't grow on load. */
  height: string;
}

/**
 * CSS custom property per `UI_ROLES` part, named after the role
 * (`textSoft` → `--text-soft`), and the `UI_DEMO` color it takes.
 */
export function roleVars(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [role, name] of Object.entries(UI_ROLES)) {
    if (name) vars[role.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)] = name;
  }
  return vars;
}

/**
 * The frame's base stylesheet: the `roleVars()` properties in light and in
 * dark, the page they paint, and the controls the frames share (`.field` for a
 * labelled range with its value, `.segmented` for a radio group, buttons,
 * checkboxes, and `code`).
 */
export function previewBaseCss(): string {
  const { colors } = resolveDemo(UI_DEMO);
  const vars = Object.entries(roleVars());
  const declarations = (scheme: 'light' | 'dark') =>
    vars.map(([v, name]) => `--${v}: ${colors[name][scheme]};`).join(' ');

  return `:root {
  color-scheme: light dark;
  ${declarations('light')}
}
@media (prefers-color-scheme: dark) {
  :root { ${declarations('dark')} }
}
html { background: var(--page); color: var(--text); }
body { margin: 0; font: 15px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif; }
[hidden] { display: none !important; }
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.field {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  column-gap: 8px;
}
.field label { font-weight: 600; }
.field output { color: var(--text-soft); font-variant-numeric: tabular-nums; }
.field input, .field small { grid-column: 1 / -1; }
.field small { font-size: 12px; color: var(--text-soft); }
input[type='range'] {
  width: 100%;
  height: 28px;
  margin: 0;
  accent-color: var(--accent);
}
input[type='checkbox'] {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--accent);
}
.segmented {
  display: flex;
  margin: 0;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: 8px;
}
.segmented label {
  flex: 1;
  padding: 6px 12px;
  border-radius: 6px;
  text-align: center;
  white-space: nowrap;
  cursor: pointer;
}
.segmented input { position: absolute; opacity: 0; pointer-events: none; }
.segmented label:has(:checked) { background: var(--accent); color: var(--accent-label); }
@media (forced-colors: active) {
  .segmented label:has(:checked) {
    forced-color-adjust: none;
    background: Highlight;
    color: HighlightText;
  }
}
.segmented label:has(:focus-visible),
button:focus-visible,
input:focus-visible,
summary:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}
button {
  padding: 7px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
code, pre {
  font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
}
code {
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--card);
}`;
}
