/**
 * Glaze global configuration singleton.
 *
 * `configure()` mutates the singleton; every other module reads it via
 * `getConfig()` at call time so changes take effect for subsequent
 * resolves. Standalone color tokens snapshot the relevant fields at
 * create time (see `color-token.ts`), so already-created tokens keep
 * their original behavior across later `configure()` calls.
 */

import type { GlazeConfig, GlazeConfigResolved } from './types';

/**
 * Build a fresh defaults object. Called from module init and from
 * `resetConfig()` so the two paths can't drift.
 */
export function defaultConfig(): GlazeConfigResolved {
  return {
    lightLightness: [10, 100],
    darkLightness: [15, 95],
    darkDesaturation: 0.1,
    darkCurve: 0.5,
    states: {
      dark: '@dark',
      highContrast: '@high-contrast',
    },
    modes: {
      dark: true,
      highContrast: false,
    },
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
    lightLightness: config.lightLightness ?? globalConfig.lightLightness,
    darkLightness: config.darkLightness ?? globalConfig.darkLightness,
    darkDesaturation: config.darkDesaturation ?? globalConfig.darkDesaturation,
    darkCurve: config.darkCurve ?? globalConfig.darkCurve,
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
  };
}

export function resetConfig(): void {
  configVersion++;
  globalConfig = defaultConfig();
}
