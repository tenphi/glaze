/**
 * Measures what Glaze resolves, for the `glaze:inspect` and `glaze:contrast`
 * tools. Every function takes the Glaze module (`g`) so the tools run against
 * the installed build and the tests against the source.
 *
 * Contrast is measured the way Glaze's solver measures it: in the metric's own
 * luminance basis, with each variant's `pastel` flag, and with APCA polarity
 * from the color's role.
 */

/**
 * @typedef {{ value?: number, target?: number, pass?: boolean, translucent?: true }} SchemeResult
 *   `pass` is set only when the color has a `contrast` floor.
 * @typedef {{ base: string, role: string, metric: 'wcag' | 'apca', schemes: Record<string, SchemeResult> }} ContrastPair
 * @typedef {{ name: string, values: Record<string, string>, contrast?: ContrastPair }} InspectedColor
 * @typedef {{ name: string, hue: number, saturation: number, colors: InspectedColor[] }} InspectedTheme
 */

/** The four scheme variants of a resolved color, in display order. */
export const SCHEMES = [
  { key: 'light', label: 'light', highContrast: false },
  { key: 'dark', label: 'dark', highContrast: false },
  { key: 'lightContrast', label: 'light HC', highContrast: true },
  { key: 'darkContrast', label: 'dark HC', highContrast: true },
];

/** WCAG 2 presets, as Glaze names them in `contrast`. */
export const WCAG_PRESETS = {
  AA: 4.5,
  AAA: 7,
  'AA-large': 3,
  'AAA-large': 4.5,
};

/** Output formats besides hex, as `glaze.format()` names them. */
export const FORMATS = ['hex', 'okhsl', 'okhst', 'rgb', 'hsl', 'oklch'];

const isLighting = (def) => def?.type === 'shadow' || def?.type === 'glow';

function linearOf(g, variant, pastel) {
  const { h, s, l } = g.variantToOkhsl(variant);
  return g.okhslToLinearSrgb(h, s, l, variant.pastel ?? pastel);
}

function luminance(g, metric, linear) {
  return metric === 'apca'
    ? g.apcaLuminanceFromLinearRgb(linear)
    : g.gamutClampedLuminance(linear);
}

/** WCAG ratio, or APCA Lc magnitude with the color as text (`fg`) or background (`bg`). */
function score(g, metric, yColor, yBase, polarity) {
  if (metric === 'wcag') return g.contrastRatioFromLuminance(yColor, yBase);
  return Math.abs(
    polarity === 'bg'
      ? g.apcaContrast(yBase, yColor)
      : g.apcaContrast(yColor, yBase),
  );
}

/** A variant as hex (with an alpha byte when translucent) or in a Glaze format. */
export function formatVariant(g, variant, format = 'hex', pastel = false) {
  if (format !== 'hex')
    return g.glaze.format(variant, format, variant.pastel ?? pastel);
  const { h, s, l } = g.variantToOkhsl(variant);
  const hex = g.srgbToHex(g.okhslToSrgb(h, s, l, variant.pastel ?? pastel));
  if (variant.alpha >= 1) return hex;
  return (
    hex +
    Math.round(variant.alpha * 255)
      .toString(16)
      .padStart(2, '0')
  );
}

/**
 * The role Glaze gives a color (see `resolveRoleInMap` in src/resolver.ts):
 * explicit `role`, else the name, else the opposite of its base's role, else
 * text. Shadows and glows are surfaces.
 */
export function roleOf(g, name, defs, inferRole, cache = new Map()) {
  if (cache.has(name)) return cache.get(name);
  const def = defs[name];
  let role;
  if (!def) role = 'surface';
  else if (isLighting(def)) role = 'surface';
  else {
    const fromBase = def.base
      ? defs[def.base]
        ? g.oppositeRole(roleOf(g, def.base, defs, inferRole, cache))
        : 'text'
      : undefined;
    role =
      g.normalizeRole(def.role) ??
      (inferRole ? g.inferRoleFromName(name) : undefined) ??
      fromBase ??
      'text';
  }
  cache.set(name, role);
  return role;
}

/**
 * One theme: every color in every scheme, and every color with a `base`
 * measured against it. A color with a `contrast` floor gets a verdict.
 *
 * @returns {InspectedTheme}
 */
export function inspectTheme(g, theme, name, format = 'hex') {
  const snapshot = theme.export();
  const defs = snapshot.colors ?? {};
  const config = snapshot.config ?? {};
  const inferRole = config.inferRole ?? true;
  const pastel = config.pastel ?? false;
  const level =
    typeof config.contrastLevel === 'number' ? config.contrastLevel : 0;
  const resolved = theme.resolve();
  const roles = new Map();
  /** @type {InspectedColor[]} */
  const colors = [];

  for (const [colorName, color] of resolved) {
    const def = defs[colorName];
    /** @type {Record<string, string>} */
    const values = {};
    for (const scheme of SCHEMES) {
      values[scheme.key] = formatVariant(g, color[scheme.key], format, pastel);
    }
    /** @type {InspectedColor} */
    const entry = { name: colorName, values };
    const base = def?.base ? resolved.get(def.base) : undefined;
    if (def && base && !isLighting(def)) {
      const role = roleOf(g, colorName, defs, inferRole, roles);
      const polarity = g.roleToPolarity(role);
      const specAt = (lvl) =>
        def.contrast === undefined
          ? undefined
          : g.resolveContrastForLevel(def.contrast, lvl, polarity);
      const metric = specAt(level)?.metric ?? 'wcag';
      /** @type {ContrastPair} */
      const pair = { base: def.base, role, metric, schemes: {} };
      for (const scheme of SCHEMES) {
        const spec = specAt(scheme.highContrast ? 100 : level);
        const c = color[scheme.key];
        const b = base[scheme.key];
        if (c.alpha < 1 || b.alpha < 1) {
          pair.schemes[scheme.key] = spec
            ? { translucent: true, target: spec.target }
            : { translucent: true };
          continue;
        }
        const value = score(
          g,
          metric,
          luminance(g, metric, linearOf(g, c, pastel)),
          luminance(g, metric, linearOf(g, b, pastel)),
          polarity,
        );
        pair.schemes[scheme.key] = spec
          ? { value, target: spec.target, pass: value >= spec.target - 1e-9 }
          : { value };
      }
      entry.contrast = pair;
    }
    colors.push(entry);
  }

  return {
    name,
    hue: snapshot.hue,
    saturation: snapshot.saturation,
    colors,
  };
}

/** Misses of every floor in a list of inspected themes. */
export function missesOf(themes) {
  const misses = [];
  for (const theme of themes) {
    for (const color of theme.colors) {
      for (const scheme of SCHEMES) {
        const result = color.contrast?.schemes[scheme.key];
        if (result?.pass === false) {
          misses.push({
            theme: theme.name,
            color: color.name,
            scheme: scheme.label,
            metric: color.contrast.metric,
            value: result.value,
            target: result.target,
          });
        }
      }
    }
  }
  return misses;
}

/** A Glaze theme or palette object, by duck type. */
export function kindOf(value) {
  if (!value || typeof value !== 'object' || typeof value.export !== 'function')
    return undefined;
  if (typeof value.themes === 'function') return 'palette';
  if (typeof value.resolve === 'function' && typeof value.colors === 'function')
    return 'theme';
  return undefined;
}

/** Themes to inspect from a snapshot: a theme or palette export, or `{ hue, saturation, colors }`. */
export function themesFromSnapshot(g, data, fallbackName = 'theme') {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('expected a theme or palette snapshot (a JSON object)');
  }
  if (data.kind === 'palette' || (data.kind === undefined && data.themes)) {
    return Object.entries(g.glaze.paletteFrom(data).themes());
  }
  return [[fallbackName, g.glaze.themeFrom(data)]];
}

/** Themes to inspect from a theme or palette object. */
export function themesFromObject(value, fallbackName = 'theme') {
  return kindOf(value) === 'palette'
    ? Object.entries(value.themes())
    : [[fallbackName, value]];
}

/** Parses any color Glaze accepts and returns its exact light variant. */
export function parseColor(g, value) {
  return g.glaze.color(value).resolve().light;
}

/** WCAG ratio and APCA Lc of text on a background, with the presets each passes. */
export function measurePair(g, text, background) {
  const t = linearOf(g, parseColor(g, text), false);
  const b = linearOf(g, parseColor(g, background), false);
  const wcag = g.contrastRatioFromLuminance(
    g.gamutClampedLuminance(t),
    g.gamutClampedLuminance(b),
  );
  const apca = g.apcaContrast(
    g.apcaLuminanceFromLinearRgb(t),
    g.apcaLuminanceFromLinearRgb(b),
  );
  return {
    text,
    background,
    wcag,
    apca,
    passes: {
      wcag: Object.fromEntries(
        Object.entries(WCAG_PRESETS).map(([preset, target]) => [
          preset,
          wcag >= target,
        ]),
      ),
      apca: Object.fromEntries(
        Object.entries(g.APCA_PRESETS).map(([preset, target]) => [
          preset,
          Math.abs(apca) >= target,
        ]),
      ),
    },
  };
}
