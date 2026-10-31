/**
 * The mobile bottom sheet's geometry, kept pure so the gesture maths is
 * testable: where the three snap points sit, and where a released drag goes.
 * Heights are measured from the bottom of the viewport, in CSS px.
 */

export const SNAPS = ['peek', 'half', 'full'] as const;
export type Snap = (typeof SNAPS)[number];
export type SnapHeights = Record<Snap, number>;

/** Handle, title row and region chips: what the sheet shows at its lowest. */
export const SHEET_HEADER_PX = 126;
/** One compact story card, gap included. */
export const SHEET_CARD_PX = 74;
/** A viewport this short is a phone on its side. */
export const LANDSCAPE_MAX_H = 500;

/** Faster than this (px/ms) on release is a flick: go one snap in its direction. */
export const FLICK_PX_PER_MS = 0.45;
/** How far ahead a slower release is projected before picking the nearest snap. */
const PROJECT_MS = 180;

export function snapHeights(viewportH: number, topBarBottom: number): SnapHeights {
  const full = Math.max(SHEET_HEADER_PX, Math.round(viewportH - topBarBottom - 8));
  if (viewportH < LANDSCAPE_MAX_H) {
    const peek = Math.min(SHEET_HEADER_PX, full);
    const half = Math.min(full, Math.max(peek + 60, Math.round(viewportH * 0.6)));
    return { peek, half, full };
  }
  // the top three stories, unless that would take most of the screen
  const peek = Math.min(
    Math.max(SHEET_HEADER_PX, Math.floor(viewportH * 0.4)),
    SHEET_HEADER_PX + SHEET_CARD_PX * 3,
  );
  const half = Math.min(full, Math.max(peek + 80, Math.round(viewportH * 0.58)));
  return { peek, half, full };
}

/**
 * Where a released drag settles. `velocity` is the sheet height's rate of
 * change in px/ms (positive = growing, i.e. the finger moved up).
 */
export function resolveSnap(height: number, velocity: number, heights: SnapHeights): Snap {
  if (Math.abs(velocity) >= FLICK_PX_PER_MS) {
    if (velocity > 0) return SNAPS.find((s) => heights[s] > height + 1) ?? 'full';
    return [...SNAPS].reverse().find((s) => heights[s] < height - 1) ?? 'peek';
  }
  const projected = height + velocity * PROJECT_MS;
  let best: Snap = 'peek';
  for (const s of SNAPS) {
    if (Math.abs(heights[s] - projected) < Math.abs(heights[best] - projected)) best = s;
  }
  return best;
}

/** One snap up (+1) or down (-1), stopping at the ends. */
export function stepSnap(current: Snap, direction: 1 | -1): Snap {
  const i = SNAPS.indexOf(current) + direction;
  return SNAPS[Math.min(SNAPS.length - 1, Math.max(0, i))];
}

/** Tapping the handle: peek → half → full → peek. */
export function nextSnap(current: Snap): Snap {
  return SNAPS[(SNAPS.indexOf(current) + 1) % SNAPS.length];
}

/** A dragged height, rubber-banded past either end. */
export function clampDrag(height: number, heights: SnapHeights): number {
  if (height > heights.full) return heights.full + (height - heights.full) * 0.2;
  if (height < heights.peek) return Math.max(0, heights.peek - (heights.peek - height) * 0.35);
  return height;
}
