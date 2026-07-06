/**
 * Glaze global configuration singleton.
 *
 * `configure()` mutates the singleton; every other module reads it via
 * `getConfig()` at call time so changes take effect for subsequent
 * resolves. Standalone color tokens snapshot the relevant fields at
 * create time (see `color-token.ts`), so already-created tokens keep
 * their original behavior across later `configure()` calls.
 */

import type {
  GlazeConfig,
  GlazeConfigOverride,
  GlazeConfigResolved,
} from './types';

/**
 * Build a fresh defaults object. Called from module init and from
 * `resetConfig()` so the two paths can't drift.
 */
export function defaultConfig(): GlazeConfigResolved {
  return {
    lightTone: { lo: 10, hi: 100, eps: 0.05 },
    darkTone: { lo: 15, hi: 95, eps: 0.05 },
    darkDesaturation: 0.1,
    states: {
      dark: '@dark',
      highContrast: '@high-contrast',
    },
    modes: {
      dark: true,
      highContrast: false,
    },
    autoFlip: true,
    pastel: false,
    inferRole: true,
  };
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
 * Public-facing snapshot used by `glaze.getConfig()`. Returns a shallow
 * copy so callers can't mutate the live config.
 */
export function snapshotConfig(): GlazeConfigResolved {
  return { ...globalConfig };
}

export function configure(config: GlazeConfig): void {
  configVersion++;
  globalConfig = {
    lightTone: config.lightTone ?? globalConfig.lightTone,
    darkTone: config.darkTone ?? globalConfig.darkTone,
    darkDesaturation: config.darkDesaturation ?? globalConfig.darkDesaturation,
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
    shadowTuning: config.shadowTuning ?? globalConfig.shadowTuning,
    autoFlip: config.autoFlip ?? globalConfig.autoFlip,
    pastel: config.pastel ?? globalConfig.pastel,
    inferRole: config.inferRole ?? globalConfig.inferRole,
  };
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
 */
export function mergeConfig(
  base: GlazeConfigResolved,
  override?: GlazeConfigOverride,
): GlazeConfigResolved {
  if (!override) return base;
  return {
    lightTone:
      override.lightTone !== undefined ? override.lightTone : base.lightTone,
    darkTone:
      override.darkTone !== undefined ? override.darkTone : base.darkTone,
    darkDesaturation: override.darkDesaturation ?? base.darkDesaturation,
    states: base.states,
    modes: base.modes,
    shadowTuning: override.shadowTuning ?? base.shadowTuning,
    autoFlip: override.autoFlip ?? base.autoFlip,
    pastel: override.pastel ?? base.pastel,
    inferRole: override.inferRole ?? base.inferRole,
  };
}
