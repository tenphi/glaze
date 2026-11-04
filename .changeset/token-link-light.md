---
'@tenphi/glaze': major
---

A value-form `glaze.color()` token linked to a structured base (`glaze.color({ from, base })` with `base` made by `glaze.color({ hue, saturation, tone })`) now resolves against what the base paints in light too. The base used to be re-resolved at full range for the link, so in light the link measured against the base's raw input tone instead of its rendered one: a `'+0'` link sat 2.5 tones below `glaze.color({ hue: 280, saturation: 80, tone: 50 })`, and an `'AA'` link measured 4.16:1 against it with no warning. A `'+0'` link now lands on its base and a `contrast` floor holds against it in every scheme, whatever config the base carries. Light variants of such links move; links on value-form bases are unchanged. See "3.0 — other changes to resolved colors" in `docs/migration.md`.
