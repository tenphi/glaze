---
'@tenphi/glaze': patch
---

Fix the APCA role of a standalone `glaze.color()` token with `contrast` (or a relative `tone`) and no `base`. It resolved as a `'surface'`, so an `{ apca }` floor was measured with the token as the background, the opposite of the same token paired with a `base`. Both now default to `'text'`: the token is the foreground and its anchor (the base, or its own input color) the background, unless you set `role`. `glaze.color({ from: '#ffffff', contrast: { apca: 60 } })` now lands on `rgb(141 141 141)` (text on white) instead of `rgb(152 152 152)`. WCAG floors are unaffected.

A token's `name` is now a debug label only, as documented: it no longer drives role inference, so `name: 'card-bg'` no longer turns a token into a surface. Set `role` explicitly instead. `inferRole` has no effect on standalone tokens.
