/**
 * Glaze global configuration singleton.
 *
 * `configure()` mutates the singleton; every other module reads it via
 * `getConfig()` at call time so changes take effect for subsequent
 * resolves. Per-instance overrides (themes / color tokens) stay sparse —
 * omitted fields fall through to the live global at resolve time.
 * Authoring exports freeze the effective merge at export call time.
 *
 * `pastel` is instance-only (theme / token override or per-color def),
 * never set via `configure()`.
 *
 * Numeric fields are validated where they enter — `configure()` for the
 * global, `mergeConfig()` (i.e. at resolve) for per-instance overrides:
 * `contrastLevel` clamps to 0–100, `darkDesaturation` to 0–1, and tone windows
 * are checked and clamped by `normalizeToneWindow`; a non-finite value throws.
 * Both entry points treat only `undefined` as "keep" for a tone window, so a
 * `null` throws in either. A glow's HDR `headroom` (`normalizeLightingTuning`,
 * shared with the per-color and standalone validators) must be a finite number
 * ≥ 0 and clamps to `MAX_HEADROOM` stops with a one-time warning; a `headroom`
 * on shadow tuning throws.
 *
 * No config object is shared with a caller, in either direction. Going in,
 * `configure()` copies what it keeps and a theme or token copies its override
 * once where it stores it (`copyConfigOverride`, which reads each known field
 * by property access, so getters and proxies work). Coming out,
 * `snapshotConfig()` (`glaze.getConfig()`) and `theme.getConfig()`
 * (`copyResolvedConfig`) hand out deep copies, and `mergeConfig()` /
 * `freezeConfigForExport()` build fresh objects. So mutating a value passed in
 * or handed out can't change a resolve or an export.
 */

import { MAX_HEADROOM } from './lighting';
import type { LightingKind } from './lighting';
import { normalizeToneWindow } from './okhst';
import { warnHeadroomClamped } from './warnings';
import type {
  GlazeConfig,
  GlazeConfigOverride,
  GlazeConfigResolved,
  GlowTuning,
  ToneWindow,
} from './types';

/**
 * Build a fresh defaults object. Called from module init and from
 * `resetConfig()` so the two paths can't drift.
 *
 * `pastel: false` is a fixed instance default — not globally configurable.
 */
export function defaultConfig(): GlazeConfigResolved {
  return {
    lightTone: { lo: 10, hi: 100, eps: 0.05 },
    darkTone: { lo: 15, hi: 95, eps: 0.05 },
    darkDesaturation: 0.1,
    states: {
      dark: '@media(prefers-color-scheme: dark)',
      highContrast: '@media(prefers-contrast: more)',
    },
    modes: {
      dark: true,
      highContrast: false,
    },
    autoFlip: true,
    pastel: false,
    inferRole: true,
    contrastLevel: 'auto',
  };
}

/**
 * Validate an authored `contrastLevel`. Numbers clamp to 0–100 so a slider
 * can't produce an out-of-range level; a non-finite number throws rather than
 * silently reading as `'auto'`, which would turn a `NaN` slider value into an
 * invisible no-op.
 */
export function normalizeContrastLevel(
  value: number | 'auto' | undefined,
): number | 'auto' {
  if (value === undefined || value === 'auto') return 'auto';
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(
      `glaze: contrastLevel must be a finite number 0–100 or 'auto' (got ${String(value)}).`,
    );
  }
  return Math.max(0, Math.min(100, value));
}

/**
 * Validate an authored `darkDesaturation`, the way `normalizeContrastLevel`
 * treats a level. Numbers clamp to 0–1 — above 1 would zero every dark
 * saturation and a negative value would raise it — and a non-finite or
 * non-number value throws instead of producing `NaN` saturations.
 */
export function normalizeDarkDesaturation(value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(
      `glaze: darkDesaturation must be a finite number 0–1 (got ${typeof value === 'string' ? JSON.stringify(value) : String(value)}).`,
    );
  }
  return Math.max(0, Math.min(1, value));
}

/**
 * Validate an authored tone window (see `normalizeToneWindow`) and return it in
 * the form it was written — `false`, `[lo, hi]`, or `{ lo, hi, eps }` — with
 * the endpoints clamped to 0–100. Always a fresh value, so mutating the
 * caller's array or object later can't reach the config.
 */
export function normalizeToneWindowInput(
  win: ToneWindow,
  field: 'lightTone' | 'darkTone',
): ToneWindow {
  if (win === false) return false;
  const { lo, hi, eps } = normalizeToneWindow(win, field);
  return Array.isArray(win) ? [lo, hi] : { lo, hi, eps };
}

/**
 * Validate a glow's HDR `headroom` (stops above SDR white). A non-number,
 * non-finite, or negative value throws; one above `MAX_HEADROOM` clamps to it
 * with a one-time warning, since a ratio typed where stops were meant (`4` for
 * "4× white") is the likely cause. `where` names the tuning in messages
 * (`glowTuning`, `glow "x" tuning`, `glaze.glow() tuning`).
 */
export function normalizeHeadroom(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(
      `glaze: ${where}.headroom must be a finite number ≥ 0 — stops above ` +
        `SDR white (got ${typeof value === 'string' ? JSON.stringify(value) : String(value)}).`,
    );
  }
  if (value > MAX_HEADROOM) {
    warnHeadroomClamped(where, value);
    return MAX_HEADROOM;
  }
  return value;
}

/**
 * Validate and copy a lighting tuning: a detached copy (or `undefined`) with a
 * glow's `headroom` checked and clamped by `normalizeHeadroom`. A shadow has no
 * headroom — it darkens toward black, and nothing goes below black — so a
 * `headroom` on shadow tuning throws. Only `undefined` counts as unset.
 */
export function normalizeLightingTuning(
  kind: LightingKind,
  tuning: GlowTuning | undefined,
  where: string,
): GlowTuning | undefined {
  if (tuning === undefined) return undefined;
  const out: GlowTuning = { ...tuning };
  const headroom = (tuning as { headroom?: unknown } | null)?.headroom;
  if (headroom === undefined) return out;
  if (kind === 'shadow') {
    throw new Error(
      `glaze: ${where}.headroom is not supported — a shadow darkens toward ` +
        `black, and nothing goes below black. Headroom is for glows ` +
        `(glowTuning or a glow's tuning).`,
    );
  }
  out.headroom = normalizeHeadroom(headroom, where);
  return out;
}

/**
 * Detached copy of a resolved config: windows, `states`, `modes` and tunings
 * included, with the same keys present. Hand-written rather than
 * `structuredClone` because `theme.getConfig()` uses it, and palettes call
 * that once per theme on every output; this is ~30× cheaper.
 */
export function copyResolvedConfig(
  config: GlazeConfigResolved,
): GlazeConfigResolved {
  const copyWindow = (win: ToneWindow): ToneWindow =>
    win === false ? false : Array.isArray(win) ? [win[0], win[1]] : { ...win };
  const out: GlazeConfigResolved = {
    ...config,
    lightTone: copyWindow(config.lightTone),
    darkTone: copyWindow(config.darkTone),
    states: { ...config.states },
    modes: { ...config.modes },
  };
  if (config.shadowTuning) out.shadowTuning = { ...config.shadowTuning };
  if (config.glowTuning) out.glowTuning = { ...config.glowTuning };
  return out;
}

/**
 * Override window copy, unvalidated: an array is spread, an object is rebuilt
 * from `lo` / `hi` / `eps` read by property access (as `normalizeToneWindow`
 * reads it, so a getter-backed window still works), and anything else
 * (`false`, `null`, a bad scalar) passes through for `mergeConfig()` to judge.
 */
function copyWindowField(win: unknown): unknown {
  if (Array.isArray(win)) return [...(win as unknown[])];
  if (typeof win === 'object' && win !== null) {
    const { lo, hi, eps } = win as Record<string, unknown>;
    return { lo, hi, eps };
  }
  return win;
}

/**
 * Override tuning copy, unvalidated: an object is spread (as `mergeConfig()`
 * copies it); anything else passes through.
 */
function copyTuningField(tuning: unknown): unknown {
  return typeof tuning === 'object' && tuning !== null ? { ...tuning } : tuning;
}

const keepField = (value: unknown): unknown => value;

/**
 * How `copyConfigOverride` copies each field. A record over every
 * `GlazeConfigOverride` key, so a field added to the type doesn't compile
 * until it's listed here.
 */
const OVERRIDE_FIELD_COPY: Record<
  keyof GlazeConfigOverride,
  (value: unknown) => unknown
> = {
  lightTone: copyWindowField,
  darkTone: copyWindowField,
  darkDesaturation: keepField,
  autoFlip: keepField,
  contrastLevel: keepField,
  pastel: keepField,
  inferRole: keepField,
  shadowTuning: copyTuningField,
  glowTuning: copyTuningField,
};

/**
 * Detached copy of a per-instance override, taken once where a theme or token
 * stores it so that resolve, `getConfig()`, `export()` and `extend()` all read
 * one object the caller can no longer reach. Every nested field
 * (`lightTone` / `darkTone` / `shadowTuning` / `glowTuning`) is copied one
 * level deep, which is all the nesting the type has. Nothing is validated
 * here — that still happens in `mergeConfig()` at resolve, as documented.
 *
 * Each known field is read by property access (`key in override`, then
 * `override[key]`) rather than spread, so a field `mergeConfig()` would see —
 * a class getter, an inherited field, a reactive proxy's trap — is copied too,
 * and a non-cloneable wrapper still works as an override. A non-object passes
 * through unchanged.
 */
export function copyConfigOverride(
  override: GlazeConfigOverride | undefined,
): GlazeConfigOverride | undefined {
  if (typeof override !== 'object' || override === null) return override;
  const source = override as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, copy] of Object.entries(OVERRIDE_FIELD_COPY)) {
    if (key in source) out[key] = copy(source[key]);
  }
  return out as GlazeConfigOverride;
}

let globalConfig: GlazeConfigResolved = defaultConfig();

/**
 * Monotonic counter incremented on every `configure()` / `resetConfig()`
 * call. Theme / palette caches read this to invalidate stale resolve
 * results when the config changes between exports.
 */
let configVersion = 0;

/** Live reference to the current config. Mutated by `configure()` / `resetConfig()`. */
export function getConfig(): GlazeConfigResolved {
  return globalConfig;
}

export function getConfigVersion(): number {
  return configVersion;
}

/**
 * Public-facing snapshot used by `glaze.getConfig()`. A deep copy — nested
 * `states`, `modes`, object windows, and tunings included — so mutating it
 * can't change the live config behind `configure()`'s back (which would skip
 * the version bump and leave every cache stale).
 */
export function snapshotConfig(): GlazeConfigResolved {
  return structuredClone(globalConfig);
}

/**
 * Merge a `GlazeConfig` into the global config. Fields are validated before
 * anything changes, so a call that throws leaves the config (and its version)
 * untouched. A tone window is kept only when it's `undefined`, as in
 * `mergeConfig()`: a `null` (say, from a JSON config) throws the same error an
 * instance override with it does.
 */
export function configure(config: GlazeConfig): void {
  const next: GlazeConfigResolved = {
    lightTone: normalizeToneWindowInput(
      config.lightTone !== undefined
        ? config.lightTone
        : globalConfig.lightTone,
      'lightTone',
    ),
    darkTone: normalizeToneWindowInput(
      config.darkTone !== undefined ? config.darkTone : globalConfig.darkTone,
      'darkTone',
    ),
    darkDesaturation: normalizeDarkDesaturation(
      config.darkDesaturation ?? globalConfig.darkDesaturation,
    ),
    states: {
      dark: config.states?.dark ?? globalConfig.states.dark,
      highContrast:
        config.states?.highContrast ?? globalConfig.states.highContrast,
    },
    modes: {
      dark: config.modes?.dark ?? globalConfig.modes.dark,
      highContrast:
        config.modes?.highContrast ?? globalConfig.modes.highContrast,
    },
    shadowTuning: normalizeLightingTuning(
      'shadow',
      config.shadowTuning ?? globalConfig.shadowTuning,
      'shadowTuning',
    ),
    glowTuning: normalizeLightingTuning(
      'glow',
      config.glowTuning ?? globalConfig.glowTuning,
      'glowTuning',
    ),
    autoFlip: config.autoFlip ?? globalConfig.autoFlip,
    // Instance-only; never configurable globally.
    pastel: false,
    inferRole: config.inferRole ?? globalConfig.inferRole,
    contrastLevel: normalizeContrastLevel(
      config.contrastLevel ?? globalConfig.contrastLevel,
    ),
  };
  configVersion++;
  globalConfig = next;
}

export function resetConfig(): void {
  configVersion++;
  globalConfig = defaultConfig();
}

/**
 * Merge a per-instance config override over a base resolved config.
 * Only fields present in `override` are replaced; others fall through
 * from `base`. `false` for tone windows passes through as-is
 * (treated as the full range by `activeWindow()` in okhst.ts).
 *
 * This is where an instance's override is validated (at resolve), with the
 * same rules `configure()` applies to the global. The result is always a fresh
 * object that shares nothing with `base` or `override`, so an instance's
 * cached config can't alias the live global.
 *
 * `pastel` is instance-only: `override.pastel ?? false`, never inherited
 * from the global base.
 */
export function mergeConfig(
  base: GlazeConfigResolved,
  override: GlazeConfigOverride = {},
): GlazeConfigResolved {
  return {
    lightTone: normalizeToneWindowInput(
      override.lightTone !== undefined ? override.lightTone : base.lightTone,
      'lightTone',
    ),
    darkTone: normalizeToneWindowInput(
      override.darkTone !== undefined ? override.darkTone : base.darkTone,
      'darkTone',
    ),
    darkDesaturation: normalizeDarkDesaturation(
      override.darkDesaturation ?? base.darkDesaturation,
    ),
    states: { ...base.states },
    modes: { ...base.modes },
    shadowTuning: normalizeLightingTuning(
      'shadow',
      override.shadowTuning ?? base.shadowTuning,
      'shadowTuning',
    ),
    glowTuning: normalizeLightingTuning(
      'glow',
      override.glowTuning ?? base.glowTuning,
      'glowTuning',
    ),
    autoFlip: override.autoFlip ?? base.autoFlip,
    pastel: override.pastel ?? false,
    inferRole: override.inferRole ?? base.inferRole,
    contrastLevel: normalizeContrastLevel(
      override.contrastLevel ?? base.contrastLevel,
    ),
  };
}

/**
 * Freeze `getConfig() ∪ instanceLocal ∪ exportArg` as a plain, resolve-relevant
 * override for authoring export, so restored snapshots pin these fields. Later
 * wins; nested objects (`shadowTuning` / `glowTuning`) replace wholesale.
 * `exportArg` is read through `copyConfigOverride`, like a stored override, so
 * its getters count too. `mergeConfig` already validates and copies every
 * field; the final `structuredClone` keeps the snapshot detached even if that
 * ever changes.
 */
export function freezeConfigForExport(
  instanceLocal?: GlazeConfigOverride,
  exportArg?: GlazeConfigOverride,
): GlazeConfigOverride {
  const effective = mergeConfig(getConfig(), {
    ...instanceLocal,
    ...copyConfigOverride(exportArg),
  });
  const out: GlazeConfigOverride = {
    lightTone: effective.lightTone,
    darkTone: effective.darkTone,
    darkDesaturation: effective.darkDesaturation,
    autoFlip: effective.autoFlip,
    pastel: effective.pastel,
    inferRole: effective.inferRole,
  };
  if (effective.shadowTuning !== undefined) {
    out.shadowTuning = effective.shadowTuning;
  }
  if (effective.glowTuning !== undefined) {
    out.glowTuning = effective.glowTuning;
  }
  // `contrastLevel` is deliberately NOT taken from the effective merge. A
  // global level is a live user preference (an accessibility slider), not
  // authored theme data — freezing it would pin a transient slider position
  // into the snapshot and make restored themes ignore the slider forever.
  // Only an instance-local or explicitly-passed level is authored intent.
  // Same reasoning excludes `modes` and `states` from the freeze.
  const authoredLevel =
    exportArg?.contrastLevel ?? instanceLocal?.contrastLevel;
  if (authoredLevel !== undefined) {
    out.contrastLevel = normalizeContrastLevel(authoredLevel);
  }
  return structuredClone(out);
}
