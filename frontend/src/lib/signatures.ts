import type { Category } from '../../../shared/news';

/**
 * Per-category beam variation — index into the shaft shader's pattern
 * branches in Beams.tsx. Most categories share the default shaft and are
 * distinguished by colour and by the rail's icons; only the two loudest
 * categories get a distinct shaft behaviour.
 */
export const CATEGORY_PATTERN: Record<Category, number> = {
  conflict: 0, // split/doubled shaft
  disaster: 1, // trailing twin pulse
  politics: 2,
  economy: 3,
  health: 4,
  science: 5,
  climate: 6,
  society: 7,
};
