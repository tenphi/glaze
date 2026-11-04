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
 * The config never shares an object with a caller: `configure()` and
 * `mergeConfig()` copy what they keep, and `snapshotConfig()` hands out a deep
 * copy, so no outside mutation can change a resolve without bumping the version.
 */

import { normalizeToneWindow } from './okhst';
import type {
  GlazeConfig,
  GlazeConfigOverride,
  GlazeConfigResolved,
  LightingTuning,
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

/** Detached copy of a (flat) lighting tuning, or `undefined`. */
function copyTuning(
  tuning: LightingTuning | undefined,
): LightingTuning | undefined {
  return tuning === undefined ? undefined : { ...tuning };
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
 * untouched.
 */
export function configure(config: GlazeConfig): void {
  const next: GlazeConfigResolved = {
    lightTone: normalizeToneWindowInput(
      config.lightTone ?? globalConfig.lightTone,
      'lightTone',
    ),
    darkTone: normalizeToneWindowInput(
      config.darkTone ?? globalConfig.darkTone,
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
    shadowTuning: copyTuning(config.shadowTuning ?? globalConfig.shadowTuning),
    glowTuning: copyTuning(config.glowTuning ?? globalConfig.glowTuning),
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
 * object that shares nothing with `base` or `override`, so the config a theme
 * hands out from `theme.getConfig()` can't alias the live global.
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
    shadowTuning: copyTuning(override.shadowTuning ?? base.shadowTuning),
    glowTuning: copyTuning(override.glowTuning ?? base.glowTuning),
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
 * `mergeConfig` already validates and copies every field; the final
 * `structuredClone` keeps the snapshot detached even if that ever changes.
 */
export function freezeConfigForExport(
  instanceLocal?: GlazeConfigOverride,
  exportArg?: GlazeConfigOverride,
): GlazeConfigOverride {
  const effective = mergeConfig(getConfig(), {
    ...instanceLocal,
    ...exportArg,
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
