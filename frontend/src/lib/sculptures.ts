import { GLOBE_RADIUS } from './geo';

/**
 * Sculpture sizing. Like pins, sculptures hold their size on screen: the
 * severity-3 reference height is clamped to a pixel range in the vertex
 * shader, and severity scales the whole object around that. Everything here
 * is in globe radii unless it says px.
 */

/** Height of a severity-3 sculpture in world units (≈ 20 px at the opening framing). */
export const SCULPTURE_HEIGHT = GLOBE_RADIUS * 0.06;

/** The reference height never drops below / rises above this many CSS pixels. */
export const SCULPTURE_MIN_PX = 18;
export const SCULPTURE_MAX_PX = 48;
/** A finger needs less detail than a cursor, and a phone GPU is doing the shading. */
export const SCULPTURE_MAX_PX_COARSE = 40;

/** Severity 1-5 → uniform scale of the whole object: 0.7 … 1.3. */
export function sculptureScale(severity: number): number {
  return 0.55 + 0.15 * severity;
}

/** Where the ground pool sits, as a fraction of the object's height: just off the surface. */
export const SCULPTURE_GLOW_HEIGHT = 0.1;
/** Pool diameter as a multiple of the object's height. */
export const SCULPTURE_GLOW_SIZE = 1.5;

/** Lift above the sphere so the base never z-fights with the surface. */
export const SCULPTURE_BASE_LIFT = 0.001;

/** Body brightness relative to the theme's sky; the ship's hull is the reference look. */
export const SCULPTURE_BODY_BRIGHTNESS = 0.95;

/**
 * Deterministic 0..1 phase from a story id, so breathing and blinks are out of
 * step between neighbours and stable across reloads.
 */
export function sculpturePhase(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}
