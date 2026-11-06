/**
 * Screen-space reach for picking stories. On the sphere a story's patch is a
 * fixed number of degrees, but near the globe's limb those degrees are
 * foreshortened to a sliver of pixels, and a fingertip is not that precise.
 * So picking also asks: which story's centre is drawn within a finger's (or a
 * cursor's) reach of where the pointer landed? Kept pure for testing.
 */

/** How far (CSS px) from a story's centre still counts as on it, by input. */
export const PICK_RADIUS_PX = { touch: 28, pen: 20, mouse: 14, other: 24 } as const;

export function pickRadiusPx(pointerType: string | undefined): number {
  if (pointerType === 'touch' || pointerType === 'pen' || pointerType === 'mouse') return PICK_RADIUS_PX[pointerType];
  return PICK_RADIUS_PX.other;
}

/**
 * Below this a story faces the camera too obliquely to read as tappable (its
 * dots are on the limb or behind the planet).
 */
export const MIN_FACING = 0.03;

export interface ScreenCandidate<T> {
  item: T;
  /** Where the story's centre is drawn, CSS px. */
  x: number;
  y: number;
  /** Cosine between the surface normal and the direction to the camera: 1 head on, ≤0 the far side. */
  facing: number;
}

/**
 * The candidate drawn nearest to (px, py) within `radius` px, or null.
 * Stories on the far side never count; among the rest, distance is weighed
 * up for ones barely facing the camera, so a story you can see squarely beats
 * a grazing one at nearly the same spot.
 */
export function nearestOnScreen<T>(candidates: Iterable<ScreenCandidate<T>>, px: number, py: number, radius: number): T | null {
  let best: T | null = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    if (!(c.facing > MIN_FACING)) continue;
    const d = Math.hypot(c.x - px, c.y - py);
    if (d > radius) continue;
    // up to +50% distance for a story right at the limb
    const score = d * (1 + 0.5 * (1 - Math.min(1, c.facing / 0.5)));
    if (score < bestScore) {
      bestScore = score;
      best = c.item;
    }
  }
  return best;
}
