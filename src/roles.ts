/**
 * Semantic color role resolution.
 *
 * A `role` fixes APCA contrast polarity (which side is the foreground vs the
 * background). Roles are resolved per color via a four-step chain (see
 * `resolveRole`): explicit `def.role` → name inference → opposite of the
 * base's role → `'text'` foreground default.
 *
 * This module owns the alias keyword sets, name tokenization, and the
 * role → polarity / opposite-role mappings. It has no dependencies.
 */

import type { Role, RoleInput } from './types';

// ============================================================================
// Keyword sets
// ============================================================================

const SURFACE_KEYWORDS = new Set([
  'surface',
  'bg',
  'background',
  'fill',
  'canvas',
  'paper',
  'layer',
]);

const TEXT_KEYWORDS = new Set([
  'text',
  'fg',
  'foreground',
  'content',
  'ink',
  'label',
  'stroke',
]);

const BORDER_KEYWORDS = new Set([
  'border',
  'divider',
  'outline',
  'separator',
  'hairline',
  'rule',
]);

const ALIAS_TO_ROLE: Record<string, Role> = {
  // surface
  surface: 'surface',
  bg: 'surface',
  background: 'surface',
  fill: 'surface',
  canvas: 'surface',
  paper: 'surface',
  layer: 'surface',
  // text
  text: 'text',
  fg: 'text',
  foreground: 'text',
  content: 'text',
  ink: 'text',
  label: 'text',
  stroke: 'text',
  // border
  border: 'border',
  divider: 'border',
  outline: 'border',
  separator: 'border',
  hairline: 'border',
  rule: 'border',
};

// ============================================================================
// Normalization
// ============================================================================

/**
 * Normalize a `RoleInput` (canonical value or alias) into a canonical `Role`.
 * Returns `undefined` for unrecognized strings so callers can fall through to
 * the next step of the resolution chain.
 */
export function normalizeRole(input: RoleInput | undefined): Role | undefined {
  if (input === undefined) return undefined;
  return ALIAS_TO_ROLE[input];
}

// ============================================================================
// Name inference
// ============================================================================

/**
 * Tokenize a color name into lowercase keyword tokens, splitting on
 * non-alphanumeric boundaries and at camelCase boundaries. Examples:
 * - `'button-text'` → `['button', 'text']`
 * - `'inputBg'` → `['input', 'bg']`
 * - `'card_border-outline'` → `['card', 'border', 'outline']`
 */
function tokenizeName(name: string): string[] {
  // Split on non-alphanumeric, then split camelCase within each piece.
  const pieces = name.split(/[^0-9a-zA-Z]+/).filter(Boolean);
  const tokens: string[] = [];
  for (const piece of pieces) {
    // Split at the boundary between a lowercase/digit run and an uppercase
    // letter (camelCase humps), e.g. "inputBg" → ["input", "Bg"].
    const sub = piece
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .split(/\s+/)
      .filter(Boolean);
    for (const s of sub) tokens.push(s.toLowerCase());
  }
  return tokens;
}

/**
 * Infer a `Role` from a color name by matching its tokens against the role
 * keyword sets. When multiple tokens match, the **last** recognized token
 * wins (so `button-text` → `text`, `input-bg` → `surface`, `card-border` →
 * `border`). Returns `undefined` when no token matches.
 */
export function inferRoleFromName(name: string): Role | undefined {
  const tokens = tokenizeName(name);
  let inferred: Role | undefined;
  for (const token of tokens) {
    if (SURFACE_KEYWORDS.has(token)) inferred = 'surface';
    else if (TEXT_KEYWORDS.has(token)) inferred = 'text';
    else if (BORDER_KEYWORDS.has(token)) inferred = 'border';
  }
  return inferred;
}

// ============================================================================
// Polarity + opposites
// ============================================================================

/** APCA argument order: which side the resolved color plays. */
export type Polarity = 'fg' | 'bg';

/**
 * Map a role to its APCA polarity. `text` and `border` are foreground spots
 * against their base (the candidate is the text argument); `surface` is the
 * background (the base is the text argument).
 */
export function roleToPolarity(role: Role): Polarity {
  return role === 'surface' ? 'bg' : 'fg';
}

/**
 * The opposite role of `role`, used when a color with no explicit role and no
 * inferable name depends on a base: the dependent color plays the opposite
 * role of its base. `surface` ↔ `text`; `border` is treated as a foreground
 * spot, so its opposite is `surface`.
 */
export function oppositeRole(role: Role): Role {
  if (role === 'surface') return 'text';
  return 'surface';
}
