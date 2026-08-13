---
'@tenphi/glaze': minor
---

Add `from` on theme color definitions. A color can now be seeded from a literal
value — the same forms `glaze.color()` accepts — instead of from the theme:

```ts
theme.colors({
  surface: { tone: 100, saturation: 0.12 },
  brand: { from: '#2f5bff', base: 'surface', contrast: 3 },
});
```

Most of Glaze answers "design me a palette". This answers the other question,
"honor this color" — white-label products, multi-tenant branding and imported
design tokens all arrive with a value already chosen, and it is a contract
rather than a starting point.

`from` supplies `hue`, `tone`, and — uniquely among theme colors — an
**absolute saturation**. That last part is what makes the feature worth having.
Every other color's `saturation` is a 0–1 factor of the theme seed, so the seed
is a ceiling: the only way to place a color more saturated than its theme was to
re-seed the theme, which drags every sibling along. A palette whose accent seed
is shared with its status themes could not honor one brand color without
re-chromatizing `danger`, `success` and the rest as a side effect. A `from`
color carries its own chroma and is unaffected by the seed.

The **light, normal-contrast** variant reproduces the value exactly (a local
`lightTone: false`, matching the value-shorthand form of `glaze.color()`). Dark
and high contrast adapt as usual — those are the variants a reader reaches for
when the normal one does not work for them, so readability outranks fidelity
there, and a color pinned across all four would just be a worse
`mode: 'static'`. A `contrast` floor still applies everywhere and is still a
floor rather than a target: a value that already clears it is emitted untouched.

Sibling fields override what the value supplied, so
`{ from: '#2f5bff', hue: 300 }` keeps the saturation and tone and rotates the
hue. A `from` color needs neither `base` nor `tone` — it is placed absolutely,
so it stands as a root on its own.

An unparseable `from` is rejected by `validateColorDefs` with the color's name in
the message, rather than surfacing the parser's own error from inside the
resolver — the string alone does not tell you which of fifty tokens carries it.

Two smaller consequences. Under `splitHue`, a `from` color now gets its own
`--{name}-hue` custom property in both schemes rather than referencing the
theme's: it authors a hue that is not the theme's, so tracking the theme var
would re-skin it on the next re-seed — the same failure mode fixed for
`darkHue`-only colors in 1.3.1. And the value parsing / validation for
`GlazeColorValue` moved from `color-token.ts` to a new internal `color-value.ts`
so the resolver can reach it without an import cycle; no public export changed.
