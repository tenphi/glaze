---
'@tenphi/glaze': minor
---

A manual `contrastLevel` no longer suppresses high-contrast output.

The level now does one thing: it positions the **normal** `light` / `dark`
variants on the 0–100 slider. The high-contrast tier stays the true
high-contrast resolution — bit-identical to what `'auto'` resolves — at every
level, and `modes.highContrast` alone decides whether it is emitted. The two
compose: a slider raises the baseline while a `prefers-contrast: more` block
still escalates on top of it.

Most visible in `css()`, which has no `modes` option and always returns four
strings: at a mid level its `lightContrast` / `darkContrast` blocks now carry
genuinely escalated values where they previously repeated the normal
declarations.

Two consequences of the corrected model:

- `contrastLevel: 0` now reproduces `'auto'` output exactly, high-contrast tier
  included. It no longer implies "no high-contrast tier" — that is
  `modes.highContrast: false`, still the default.
- At a global `contrastLevel: 100` the normal variants already *are* the
  high-contrast ones, so a separate tier would duplicate them: a single
  light/dark set is emitted, even against an explicit `modes.highContrast: true`.

Also fixes the side-stability probe leaking into the high-contrast passes, which
made a mid-level high-contrast variant diverge from its `'auto'` counterpart.
