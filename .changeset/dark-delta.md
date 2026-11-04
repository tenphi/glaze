---
'@tenphi/glaze': major
---

Dark variants of `mode: 'auto'` tone-delta colors (`tone: '+N'` / `'-N'`) now step evenly. The dark step used to start from the base's light tone, which already carries the light window's lift, so the lift landed in the step: on a tone-50 base `'+4'` came out −5.6 in dark and `'-4'` +1.3. It now starts from the base's authored tone, so every dark step is the dark window's scale times the delta (about 0.87× at the default windows: `'+4'` → −3.5, `'-4'` → +3.5) on every base, along chains of deltas, and for `from` colors, the same as `glaze.color()` tokens already behaved. Dark variants of these colors shift (up to about 4 tones on the lowest bases, a fraction of a tone on a light surface), along with anything solved, mixed, or lit from them in dark. Light and high-contrast variants are unchanged, and `contrastLevel: 100` still equals the high-contrast tier.
