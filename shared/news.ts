/**
 * Shared vocabulary between the agent pipeline (producer) and the globe frontend (consumer).
 * This file is the single source of truth for categories, colors, and the dataset shape.
 * It must stay dependency-free so both workspaces can import it directly.
 */

export const CATEGORIES = [
  'conflict',
  'disaster',
  'politics',
  'economy',
  'health',
  'science',
  'climate',
  'society',
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Neon palette tuned for additive glow on a dark globe. */
export const CATEGORY_COLORS: Record<Category, string> = {
  conflict: '#ff3b3b',
  disaster: '#ff9f1c',
  politics: '#b14aff',
  economy: '#ffd60a',
  health: '#2ec4b6',
  science: '#4cc9f0',
  climate: '#57e39f',
  society: '#7aa2ff',
};

export const CATEGORY_LABELS: Record<Category, string> = {
  conflict: 'Conflict & Security',
  disaster: 'Disaster',
  politics: 'Politics',
  economy: 'Economy',
  health: 'Health',
  science: 'Science & Tech',
  climate: 'Climate & Environment',
  society: 'Society',
};

export const BIAS_RATINGS = [
  'left',
  'center-left',
  'center',
  'center-right',
  'right',
  'unknown',
] as const;

export type BiasRating = (typeof BIAS_RATINGS)[number];

export interface NewsSource {
  url: string;
  domain: string;
  /** 0-100, from the bundled source-ratings table (conservative default for unrated domains). */
  reliability: number;
  bias: BiasRating;
  /** True when the domain was not in the ratings table. */
  unrated?: boolean;
}

/** Article preview image (hotlinked Open Graph image from one of the sources). */
export interface NewsImage {
  url: string;
  /** Registrable domain of the article the image came from. */
  domain: string;
}

export interface NewsEvent {
  id: string;
  headline: string;
  summary: string;
  category: Category;
  /** 1 (minor regional story) … 5 (historic global event). Drives blip size + pulse rate. */
  severity: 1 | 2 | 3 | 4 | 5;
  lat: number;
  lon: number;
  locationName: string;
  /** ISO 3166-1 alpha-2, or 'XX' for international waters / multi-country events. */
  countryCode: string;
  sources: NewsSource[];
  /** Optional article preview image, resolved by the pipeline's enrichment step. */
  image?: NewsImage;
  /** 0-100, computed deterministically from corroboration + source reliability + bias spread. */
  trustScore: number;
  /** ISO timestamp of when this event first appeared in the dataset. */
  firstSeen: string;
  lastUpdated: string;
  isBreaking: boolean;
}

export interface NewsDataset {
  generatedAt: string;
  mode: 'daily' | 'breaking';
  events: NewsEvent[];
}
