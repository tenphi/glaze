---
'@tenphi/glaze': patch
---

`glaze:inspect` takes a theme module inside an installed package, such as `@acme/ui/harness/theme.mjs`, as `tasty:styles --setup` does, so a library that ships its users' theme no longer has to give them a `node_modules/...` path that depends on the install layout. `#exportName` still works after a package path. The text output also rounds a theme's seed hue and saturation to one decimal in its header; `--json` and the measuring module are unchanged.
