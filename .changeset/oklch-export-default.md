---
'@tenphi/glaze': patch
---

Default export format is now `oklch` for all exporters (`tasty()`, `token()`, `css()`, and internal formatter defaults). Use `{ format: 'okhsl' }` or `{ format: 'rgb' }` to opt into other formats.
