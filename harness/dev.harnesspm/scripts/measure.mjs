/**
 * Measures what Glaze resolves, for the `glaze:inspect`, `glaze:color` and
 * `glaze:contrast` tools. Public as `@tenphi/glaze/harness/measure` (types in
 * `measure.d.mts`), so other harnesses can build tools on it.
 *
 * Every function that resolves or measures takes the Glaze module (`g`): the
 * tools pass the installed build, the tests pass the source, and a caller
 * passes the same `@tenphi/glaze` instance its themes come from (Glaze's
 * config is per instance).
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
 * @typedef {{ value: string, hue: number, saturation: number, tone: number, alpha: number, base?: string, wcag?: number, apca?: number, target?: number, pass?: boolean, translucent?: true }} ColorScheme
 *   `hue` in degrees, `saturation` and `tone` 0–100. `wcag` and `apca` are set when there is a base; `pass` when there is also a floor.
 * @typedef {{ role: string, metric?: 'wcag' | 'apca', schemes: Record<string, ColorScheme> }} InspectedColorToken
 *   `metric` is the floor's metric, set when the color has a `contrast` floor and a base.
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

/**
 * Keeps the themes named in `themes` and, in each, the colors whose name
 * contains any of the `colors` parts, plus the base each kept color is
 * measured against. Empty or missing lists keep everything.
 *
 * @param {InspectedTheme[]} inspected
 * @param {{ themes?: string[], colors?: string[] }} filters
 * @returns {InspectedTheme[]}
 */
export function filterThemes(inspected, { themes = [], colors = [] } = {}) {
  let kept = inspected;
  if (themes.length > 0) {
    const unknown = themes.filter((t) => !inspected.some((i) => i.name === t));
    if (unknown.length > 0) {
      throw new Error(
        `no theme named ${unknown.map((t) => `"${t}"`).join(', ')}. Themes: ${inspected.map((i) => i.name).join(', ')}`,
      );
    }
    kept = inspected.filter((i) => themes.includes(i.name));
  }
  if (colors.length === 0) return kept;
  const parts = colors.map((c) => c.replace(/^#/, '').toLowerCase());
  const matches = (name) =>
    parts.some((part) => name.toLowerCase().includes(part));
  if (!kept.some((theme) => theme.colors.some((c) => matches(c.name)))) {
    throw new Error(
      `no color name contains ${parts.map((p) => `"${p}"`).join(' or ')}`,
    );
  }
  return kept.map((theme) => {
    const matched = new Set(
      theme.colors.filter((c) => matches(c.name)).map((c) => c.name),
    );
    const bases = new Set(
      theme.colors
        .filter((c) => matched.has(c.name) && c.contrast)
        .map((c) => c.contrast.base),
    );
    return {
      ...theme,
      colors: theme.colors.filter(
        (c) => matched.has(c.name) || bases.has(c.name),
      ),
    };
  });
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

const isToken = (value) =>
  !!value &&
  typeof value === 'object' &&
  typeof value.resolve === 'function' &&
  typeof value.export === 'function';

/** A `glaze.color()` input with `overrides` added (a value becomes `{ from }`). */
function withOverrides(input, overrides) {
  const set = Object.fromEntries(
    Object.entries(overrides).filter(([, v]) => v !== undefined),
  );
  if (Object.keys(set).length === 0) return input;
  const isInput =
    input && typeof input === 'object' && ('from' in input || 'hue' in input);
  return isInput ? { ...input, ...set } : { from: input, ...set };
}

/**
 * One standalone color, resolved by `glaze.color()` in every scheme, with its
 * hue, saturation and tone. With a base, each scheme is measured against the
 * base in that scheme, with WCAG and APCA (APCA polarity from the color's
 * role, `'text'` unless the input sets one). A `contrast` floor gets a verdict
 * in its own metric.
 *
 * `input` is a token or anything `glaze.color()` takes. For an input that is
 * not a token, `base` (a token, or anything `glaze.color()` takes) and
 * `contrast` replace the input's own.
 *
 * @returns {InspectedColorToken}
 */
export function inspectColor(
  g,
  input,
  { base, contrast, format = 'hex' } = {},
) {
  if (isToken(input) && (base !== undefined || contrast !== undefined)) {
    throw new Error(
      'a glaze.color() token already has its base and contrast: pass its input instead',
    );
  }
  const given =
    base === undefined || isToken(base) ? base : g.glaze.color(base);
  const token = isToken(input)
    ? input
    : g.glaze.color(withOverrides(input, { base: given, contrast }));
  const exported = token.export();
  const fields =
    exported.form === 'value' ? (exported.overrides ?? {}) : exported.input;
  // A base the input brought along is measured as its snapshot rehydrates.
  const baseToken =
    given ??
    (fields.base === undefined ? undefined : g.glaze.colorFrom(fields.base));
  const resolved = token.resolve();
  const baseResolved = baseToken?.resolve();
  const role = g.normalizeRole(fields.role) ?? 'text';
  const polarity = g.roleToPolarity(role);
  const config = exported.config ?? {};
  const pastel = config.pastel ?? false;
  const level =
    typeof config.contrastLevel === 'number' ? config.contrastLevel : 0;
  const specAt = (lvl) =>
    fields.contrast === undefined || !baseResolved
      ? undefined
      : g.resolveContrastForLevel(fields.contrast, lvl, polarity);

  /** @type {InspectedColorToken} */
  const result = { role, schemes: {} };
  const metric = specAt(level)?.metric;
  if (metric) result.metric = metric;
  for (const scheme of SCHEMES) {
    const v = resolved[scheme.key];
    /** @type {ColorScheme} */
    const entry = {
      value: formatVariant(g, v, format, pastel),
      hue: v.h,
      saturation: v.s * 100,
      tone: v.t * 100,
      alpha: v.alpha,
    };
    const b = baseResolved?.[scheme.key];
    if (b) {
      entry.base = formatVariant(g, b, format, pastel);
      const spec = specAt(scheme.highContrast ? 100 : level);
      if (v.alpha < 1 || b.alpha < 1) {
        entry.translucent = true;
        if (spec) entry.target = spec.target;
      } else {
        const c = linearOf(g, v, pastel);
        const bl = linearOf(g, b, pastel);
        entry.wcag = score(
          g,
          'wcag',
          luminance(g, 'wcag', c),
          luminance(g, 'wcag', bl),
        );
        entry.apca = score(
          g,
          'apca',
          luminance(g, 'apca', c),
          luminance(g, 'apca', bl),
          polarity,
        );
        if (spec) {
          entry.target = spec.target;
          entry.pass = entry[spec.metric] >= spec.target - 1e-9;
        }
      }
    }
    result.schemes[scheme.key] = entry;
  }
  return result;
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
