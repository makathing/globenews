/**
 * Shared vocabulary between the agent pipeline (producer) and the globe frontend (consumer).
 * This file is the single source of truth for categories and the dataset shape.
 *
 * Colour lives in the frontend: severity drives the beam ramp
 * (frontend/src/lib/beams.ts) and the interface is otherwise monochrome, so
 * there is deliberately no per-category palette here.
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
  /** This article's own preview image (og:image), when resolvable. */
  image?: string;
  /** The outlet's own icon, used as preview art when the article has none. */
  icon?: string;
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

/**
 * What a run actually produced. Recorded because image enrichment fails
 * silently by design: without this, a run that resolved nothing is
 * indistinguishable from one that had nothing to resolve.
 */
export interface RunStats {
  /** Events carrying a hero preview image. */
  imagesResolved: number;
  /** Sources carrying their own article image. */
  sourcesWithImages: number;
  /** Events corroborated by two or more independent sources. */
  multiSource: number;
  /** When the image enrichment pass last ran, if it has. */
  enrichedAt?: string;
  /**
   * Events whose severity was not supplied by the synthesizer and fell back to
   * the default. A high number means the beam encoding is largely fabricated.
   */
  severityDefaulted?: number;
  /** Events whose severity was assigned afterwards by the backfill pass. */
  severityBackfilled?: number;
  /**
   * Which process resolved the preview art. `inline` — the news run itself,
   * one pass. `deferred` — the run could not reach publishers and left it to
   * the build. `build` — the deploy's enrichment step filled it in.
   */
  enrichment?: 'inline' | 'deferred' | 'build';
}

export interface NewsDataset {
  generatedAt: string;
  mode: 'daily' | 'breaking';
  events: NewsEvent[];
  stats?: RunStats;
}
