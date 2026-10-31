import type { Category } from '../../../shared/news';

/** One-word chip labels; the full CATEGORY_LABELS name is the accessible name. */
export const CATEGORY_SHORT: Record<Category, string> = {
  conflict: 'Conflict',
  disaster: 'Disaster',
  politics: 'Politics',
  economy: 'Economy',
  health: 'Health',
  science: 'Science',
  climate: 'Climate',
  society: 'Society',
};
