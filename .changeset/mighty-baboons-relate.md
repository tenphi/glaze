---
'@tenphi/glaze': minor
---

Preserve contrast for `tone: 'max'` / `'min'` on colors with a `base`. The
extreme is no longer re-mapped through the dark tone window (which compressed
the base-to-extreme span and lowered contrast in dark). Glaze now measures the
tone shift the light scheme applied between the base and the extreme and
replays it against the base's resolved dark tone — mirrored under
`mode: 'auto'`, same-signed under `'fixed'`. The result is clamped to
`[0, 100]` only, so it may cross the `darkTone` boundary, and pins at the
extreme when the shift does not fit. Root extremes (no `base`), `mode: 'static'`,
high-contrast variants, and standalone `glaze.color()` tokens are unchanged.
