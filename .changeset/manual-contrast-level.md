---
'@tenphi/glaze': minor
---

Add `contrastLevel` — a manual contrast level that turns the two-tier
high-contrast model into a `0–100` slider. Set it globally via
`glaze.configure()`, or per theme / per token / through `extend()`:

```ts
glaze.configure({ contrastLevel: 60 });
const theme = glaze(280, 80, { contrastLevel: 60 });
glaze.color('#26fcb2', { contrastLevel: 60 });
```

Level `0` reproduces the normal `light` / `dark` output and level `100` the
`lightContrast` / `darkContrast` output, **bit for bit**. Levels in between are
resolved at that level, not interpolated after the fact: Glaze interpolates the
three things that make high contrast differ — authored `[normal, highContrast]`
pairs, the tone-window widening (light `[10,100] → [0,100]`, dark
`[15,95] → [0,100]`), and the `AA → AAA` / APCA `+15 Lc` escalation — and feeds
those through the ordinary resolve. A contrast floor is therefore genuinely
solved at every level (`contrast: 'AA'` at level 50 solves for 5.75), and the
floor is met at every level.

While a level is set there is no separate high-contrast tier: `lightContrast` /
`darkContrast` mirror their normal counterparts, and a global level turns
high-contrast output off outright so no exporter emits the tier.
`modes.highContrast` goes inert rather than fighting it — it reads as "emit a
separate high-contrast set *when* contrast is automatic" — so a build config that
leaves `highContrast: true` set keeps working, silently, when a user switches
their preference from auto to manual. `css()` keeps its four-string shape with
the high-contrast strings repeating the normal declarations, so existing
`@media (prefers-contrast: more)` wiring keeps working untouched. A level set on
one theme of a palette leaves its siblings' high-contrast tier alone.

**A color never swaps sides of its base mid-slider.** `autoFlip`'s tie-break —
when both directions meet the floor, take the one nearer the authored tone —
depends on the target, so along a ramp it would let a color leap across its
base. The side is now decided once from the nearer endpoint and preferred
throughout that half of the ramp: a color whose two ends agree never changes
side, and one whose ends genuinely disagree changes exactly once, at level 50.
Flipping is only re-ordered, never disabled, so a side that cannot physically
reach the target still falls back. This is exposed as a new `preferInitial`
option on `findToneForContrast`.

Un-interpolable tone pairs (`[50, 'max']`, `[50, '+20']`, `['max', 'min']`)
switch at level 50 rather than blending across kinds.

Also exports `resolveContrastForLevel(spec, level, polarity?)`.

**A `contrast` pair may no longer switch metric.** `[4.5, { apca: 75 }]` now
throws a validation error: a WCAG ratio and an APCA Lc are different scales, so
no target exists between them and the two variants are incomparable even without
a manual level. Pair values inside one metric instead — `{ wcag: [4.5, 7] }` or
`{ apca: [60, 90] }`. Previously such a pair resolved silently.

Nothing else changes by default: `contrastLevel` defaults to `'auto'`, which is
today's behavior exactly, and no existing type, signature, or output shape moved.
As a bonus, a manual resolve runs two passes instead of four.
