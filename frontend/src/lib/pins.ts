import { GLOBE_RADIUS } from './geo';

/**
 * Pin geometry. Unlike beams, pins hold a constant size on screen: the head
 * is a disc measured in pixels and the needle never drops below a legible
 * length, however far out the camera is. Severity sets the head size.
 */

/** Head disc diameter on screen, in CSS pixels. */
export function pinHeadPx(severity: number): number {
  return 7 + severity * 2.2;
}

/** Needle length in world units — the floor; the frame raises it to a pixel minimum. */
export function pinNeedleLength(severity: number): number {
  return GLOBE_RADIUS * (0.03 + severity * 0.012);
}

/** Needle never shorter than this many pixels on screen. */
export const PIN_MIN_NEEDLE_PX = 12;
/** Needle width on screen. */
export const PIN_NEEDLE_PX = 1.2;
/** Glyphs fade in as the head crosses this size; below it they are noise. */
export const PIN_GLYPH_FADE_PX: [number, number] = [11, 15];
