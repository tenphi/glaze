/**
 * Types for `@tenphi/glaze/harness/measure`: what the `glaze:inspect`,
 * `glaze:color` and `glaze:contrast` tools measure, for other harnesses that
 * build tools on it.
 *
 * Every function that resolves or measures takes the Glaze module as its
 * first argument. Pass the same instance your themes come from:
 *
 * ```js
 * import * as g from '@tenphi/glaze';
 * import { inspectTheme } from '@tenphi/glaze/harness/measure';
 *
 * const result = inspectTheme(g, theme, 'default');
 * ```
 */
import type * as Glaze from '@tenphi/glaze';
import type {
  ColorDef,
  ContrastSpec,
  GlazeColorFormat,
  GlazeColorInput,
  GlazeColorToken,
  GlazeColorValue,
  GlazeFromInput,
  GlazePalette,
  GlazeTheme,
  HCPair,
  ResolvedColorVariant,
  Role,
} from '@tenphi/glaze';

/** The `@tenphi/glaze` module, as `import * as g from '@tenphi/glaze'` gives it. */
export type GlazeModule = typeof Glaze;

/** A scheme key of a resolved color. */
export type SchemeKey = 'light' | 'dark' | 'lightContrast' | 'darkContrast';

/** How the tools print a color: hex, or a `glaze.format()` format. */
export type MeasureFormat = 'hex' | GlazeColorFormat;

/** Anything `glaze.color()` takes. */
export type ColorInput = GlazeColorValue | GlazeFromInput | GlazeColorInput;

/** One scheme of a measured pair. `pass` is set only when there is a floor. */
export interface SchemeResult {
  value?: number;
  target?: number;
  pass?: boolean;
  translucent?: true;
}

/** A theme color measured against its `base`. */
export interface ContrastPair {
  base: string;
  role: Role;
  metric: 'wcag' | 'apca';
  schemes: Record<SchemeKey, SchemeResult>;
}

/** A theme color in every scheme, and its contrast against its base. */
export interface InspectedColor {
  name: string;
  values: Record<SchemeKey, string>;
  contrast?: ContrastPair;
}

/** A theme: every color in every scheme. */
export interface InspectedTheme {
  name: string;
  hue: number;
  saturation: number;
  colors: InspectedColor[];
}

/** A floor missed in one scheme. */
export interface Miss {
  theme: string;
  color: string;
  /** The scheme's label, such as `light HC`. */
  scheme: string;
  metric: 'wcag' | 'apca';
  value: number;
  target: number;
}

/**
 * One scheme of a standalone color. `hue` is in degrees; `saturation` and
 * `tone` are 0–100. `base`, `wcag` and `apca` are set when there is a base;
 * `target` and `pass` when there is also a floor.
 */
export interface ColorScheme {
  value: string;
  hue: number;
  saturation: number;
  tone: number;
  alpha: number;
  base?: string;
  wcag?: number;
  apca?: number;
  target?: number;
  pass?: boolean;
  translucent?: true;
}

/** A standalone color in every scheme. `metric` is set when it has a floor and a base. */
export interface InspectedColorToken {
  role: Role;
  metric?: 'wcag' | 'apca';
  schemes: Record<SchemeKey, ColorScheme>;
}

/** WCAG and APCA of a text color on a background, with the presets the pair passes. */
export interface MeasuredPair {
  text: GlazeColorValue;
  background: GlazeColorValue;
  wcag: number;
  /** Signed APCA Lc: negative for light text on a dark background. */
  apca: number;
  passes: {
    wcag: Record<'AA' | 'AAA' | 'AA-large' | 'AAA-large', boolean>;
    apca: Record<Glaze.ApcaPreset, boolean>;
  };
}

/** The four schemes, in display order. */
export declare const SCHEMES: ReadonlyArray<{
  key: SchemeKey;
  label: string;
  highContrast: boolean;
}>;

/** WCAG 2 presets, as Glaze names them in `contrast`. */
export declare const WCAG_PRESETS: Readonly<
  Record<'AA' | 'AAA' | 'AA-large' | 'AAA-large', number>
>;

/** Every format the tools print. */
export declare const FORMATS: readonly MeasureFormat[];

/** A variant as hex (with an alpha byte when translucent) or in a Glaze format. */
export declare function formatVariant(
  g: GlazeModule,
  variant: ResolvedColorVariant,
  format?: MeasureFormat,
  pastel?: boolean,
): string;

/** The role Glaze gives a theme color: explicit, else by name, else the opposite of its base's. */
export declare function roleOf(
  g: GlazeModule,
  name: string,
  defs: Readonly<Record<string, ColorDef>>,
  inferRole: boolean,
  cache?: Map<string, Role>,
): Role;

/** Every color of a theme in every scheme, and each color with a `base` measured against it. */
export declare function inspectTheme(
  g: GlazeModule,
  theme: GlazeTheme,
  name: string,
  format?: MeasureFormat,
): InspectedTheme;

/**
 * Keeps the named themes and, in each, the colors whose name contains any of
 * the parts, plus the base each kept color is measured against. Throws when a
 * theme name is unknown or no color matches.
 */
export declare function filterThemes(
  inspected: InspectedTheme[],
  filters?: { themes?: string[]; colors?: string[] },
): InspectedTheme[];

/** Every missed floor in a list of inspected themes. */
export declare function missesOf(themes: InspectedTheme[]): Miss[];

/** Whether a value is a Glaze theme or palette, by duck type. */
export declare function kindOf(value: unknown): 'theme' | 'palette' | undefined;

/** `[name, theme]` pairs from a theme or palette snapshot, or `{ hue, saturation, colors }`. */
export declare function themesFromSnapshot(
  g: GlazeModule,
  data: unknown,
  fallbackName?: string,
): Array<[string, GlazeTheme]>;

/** `[name, theme]` pairs from a theme or palette object. */
export declare function themesFromObject(
  value: GlazeTheme | GlazePalette,
  fallbackName?: string,
): Array<[string, GlazeTheme]>;

/**
 * One standalone color as `glaze.color()` resolves it, in every scheme. With
 * a base, each scheme is measured against the base with WCAG and APCA, and a
 * `contrast` floor gets a verdict. For an input that is not a token, `base`
 * and `contrast` replace the input's own; a token throws with either.
 */
export declare function inspectColor(
  g: GlazeModule,
  input: ColorInput | GlazeColorToken,
  options?: {
    base?: ColorInput | GlazeColorToken;
    contrast?: HCPair<ContrastSpec>;
    format?: MeasureFormat;
  },
): InspectedColorToken;

/** The exact light variant of any color Glaze accepts. */
export declare function parseColor(
  g: GlazeModule,
  value: GlazeColorValue,
): ResolvedColorVariant;

/** WCAG ratio and APCA Lc of text on a background, with the presets each passes. */
export declare function measurePair(
  g: GlazeModule,
  text: GlazeColorValue,
  background: GlazeColorValue,
): MeasuredPair;
