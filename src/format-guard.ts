/**
 * Export-time guards for color format and channel-splitting prerequisites.
 */

import type {
  GlazeColorFormat,
  GlazeOutputModes,
  ResolvedColor,
} from './types';

const NON_NATIVE_FORMATS = new Set<GlazeColorFormat>(['okhsl', 'okhst']);

/**
 * Throw when a non-native Glaze color space is requested for an export that
 * emits raw CSS or non-Tasty token maps.
 */
export function assertNativeFormat(
  format: GlazeColorFormat | undefined,
  method: string,
): void {
  if (format !== undefined && NON_NATIVE_FORMATS.has(format)) {
    throw new Error(
      `glaze: ${format} output is only supported by tasty() (not a native CSS color space). ` +
        `Use tasty({ format: '${format}' }) or pick a native format (oklch|hsl|rgb) for ${method}().`,
    );
  }
}

type SchemeField = 'light' | 'dark' | 'lightContrast' | 'darkContrast';

const SCHEME_FIELDS: {
  field: SchemeField;
  modes: (modes: Required<GlazeOutputModes>) => boolean;
}[] = [
  { field: 'light', modes: () => true },
  { field: 'dark', modes: (m) => m.dark },
  { field: 'lightContrast', modes: (m) => m.highContrast },
  {
    field: 'darkContrast',
    modes: (m) => m.dark && m.highContrast,
  },
];

/**
 * Throw when `splitHue` is enabled but any exported color is not pastel.
 * Hue rotation is only clip-free when chroma is bounded by the hue-independent
 * safe chroma (`computeSafeChromaOKLCH`).
 */
export function assertAllPastel(
  resolved: Map<string, ResolvedColor>,
  modes: Required<GlazeOutputModes>,
): void {
  const nonPastel: string[] = [];

  for (const [name, color] of resolved) {
    for (const { field, modes: active } of SCHEME_FIELDS) {
      if (!active(modes)) continue;
      const variant = color[field];
      if (variant.pastel !== true) {
        if (!nonPastel.includes(name)) nonPastel.push(name);
        break;
      }
    }
  }

  if (nonPastel.length === 0) return;

  throw new Error(
    'glaze: splitHue requires every color to be pastel (hue rotation is only ' +
      'clip-free when chroma is bounded by the hue-independent safe chroma). ' +
      `Non-pastel: ${nonPastel.join(', ')}. ` +
      'Set pastel: true (global or per-color) or drop splitHue.',
  );
}
