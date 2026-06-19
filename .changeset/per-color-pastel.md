---
'@tenphi/glaze': patch
---

Allow `pastel` to be set per color, not just globally.

Every color definition (`RegularColorDef`, `ShadowColorDef`, `MixColorDef`) and
`glaze.color()` token now accepts an optional `pastel?: boolean` that overrides
the global / per-theme `pastel` config for that color only. Omit it to keep
inheriting the config default.
