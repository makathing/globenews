import type { Category } from '../../../shared/news';

/**
 * On-globe radar signature per category — index into the blip fragment
 * shader's pattern branches. Keep in sync with the shaft shader in Beams.tsx and
 * the legend's SignatureGlyph set in ui/icons.tsx.
 */
export const CATEGORY_PATTERN: Record<Category, number> = {
  conflict: 0, // rings + radial spikes
  disaster: 1, // double shockwave
  politics: 2, // ring + orbiting satellite dot
  economy: 3, // diamond ring
  health: 4, // plus-shaped ring
  science: 5, // hexagonal ring
  climate: 6, // sinusoidal ripple
  society: 7, // dashed/segmented ring
};
