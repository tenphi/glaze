---
'@tenphi/glaze': minor
---

Tasty exports now default to media-query state aliases (`@media(prefers-color-scheme: dark)` and `@media(prefers-contrast: more)`) instead of the custom `@dark` / `@high-contrast` aliases. Tokens now react to the OS preference out of the box without registering custom Tasty states. Override via `glaze.configure({ states })` or per-export `states` to keep the old aliases.
