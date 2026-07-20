/**
 * Authoring-export helpers: schema version, type guards, and restore
 * validation shared by `themeFrom` / `colorFrom` / `paletteFrom`.
 */

import { GLAZE_EXPORT_VERSION } from './types';
import type {
  GlazeColorTokenExport,
  GlazeExportKind,
  GlazePaletteExport,
  GlazeThemeExport,
} from './types';

export { GLAZE_EXPORT_VERSION };

function isPlainObject(data: unknown): data is Record<string, unknown> {
  return typeof data === 'object' && data !== null && !Array.isArray(data);
}

/**
 * Reject unknown / invalid schema versions. Missing `version` is allowed
 * (legacy snapshots). Present versions must be an integer in
 * `1..=GLAZE_EXPORT_VERSION`.
 */
export function assertExportVersion(
  data: { version?: unknown },
  factory: string,
): void {
  if (data.version === undefined) return;
  if (
    typeof data.version !== 'number' ||
    !Number.isInteger(data.version) ||
    data.version < 1
  ) {
    throw new Error(
      `${factory}: invalid "version" field — expected an integer >= 1 (got ${JSON.stringify(data.version)}).`,
    );
  }
  if (data.version > GLAZE_EXPORT_VERSION) {
    throw new Error(
      `${factory}: unsupported export version ${data.version} (this library supports version ${GLAZE_EXPORT_VERSION}). Upgrade @tenphi/glaze to load this snapshot.`,
    );
  }
}

/**
 * When `kind` is present, it must match the factory. Missing `kind` is
 * allowed for legacy snapshots.
 */
export function assertExportKind(
  data: { kind?: unknown },
  expected: GlazeExportKind,
  factory: string,
): void {
  if (data.kind === undefined) return;
  if (data.kind !== expected) {
    throw new Error(
      `${factory}: expected kind "${expected}", got ${JSON.stringify(data.kind)}.`,
    );
  }
}

function hasThemeShape(data: Record<string, unknown>): boolean {
  return (
    typeof data.hue === 'number' &&
    typeof data.saturation === 'number' &&
    !('form' in data) &&
    !('themes' in data)
  );
}

function hasColorTokenShape(data: Record<string, unknown>): boolean {
  return data.form === 'value' || data.form === 'structured';
}

function hasPaletteShape(data: Record<string, unknown>): boolean {
  return (
    isPlainObject(data.themes) &&
    !('form' in data) &&
    typeof data.hue !== 'number'
  );
}

/** Type guard for theme authoring snapshots (prefers `kind`, falls back to shape). */
export function isThemeExport(data: unknown): data is GlazeThemeExport {
  if (!isPlainObject(data)) return false;
  if (data.kind === 'theme') return hasThemeShape(data);
  if (data.kind !== undefined) return false;
  return hasThemeShape(data);
}

/** Type guard for color-token authoring snapshots. */
export function isColorTokenExport(
  data: unknown,
): data is GlazeColorTokenExport {
  if (!isPlainObject(data)) return false;
  if (data.kind === 'color') return hasColorTokenShape(data);
  if (data.kind !== undefined) return false;
  return hasColorTokenShape(data);
}

/** Type guard for palette authoring snapshots. */
export function isPaletteExport(data: unknown): data is GlazePaletteExport {
  if (!isPlainObject(data)) return false;
  if (data.kind === 'palette') return hasPaletteShape(data);
  if (data.kind !== undefined) return false;
  return hasPaletteShape(data);
}
