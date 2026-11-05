/**
 * Shared vocabulary between the agent pipeline (producer) and the globe frontend (consumer).
 * This file is the single source of truth for categories and the dataset shape.
 *
 * Colour lives in the frontend: each theme carries its own tuning of the
 * category palette (frontend/src/lib/categoryColors.ts), so there is
 * deliberately no palette here.
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
  /**
   * The newsroom whose reporting this is, when it is not the outlet itself:
   * syndicated wire copy ('apnews.com', 'reuters.com', 'afp.com', or 'wire'
   * for unattributed aggregator copy). Trust counts distinct origins.
   */
  origin?: string;
  /** When the article was published (YYYY-MM-DD or ISO), as the researcher saw it. */
  published?: string;
  /**
   * `url` is the outlet's homepage, not the article: the synthesizer named the
   * outlet without linking the story. Still rated by its domain.
   */
  homepage?: boolean;
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

export const NEWS_SCOPES = ['global', 'us'] as const;
export type NewsScope = (typeof NEWS_SCOPES)[number];

/** A missing scope means the story came from the worldwide runs. */
export function scopeOf(event: { scope?: NewsScope }): NewsScope {
  return event.scope ?? 'global';
}

export interface NewsEvent {
  id: string;
  headline: string;
  summary: string;
  category: Category;
  /** 1 (minor regional story) … 5 (historic global event). Drives how many globe dots the story lights up, and whether they pulse (4–5). */
  severity: 1 | 2 | 3 | 4 | 5;
  lat: number;
  lon: number;
  locationName: string;
  /** ISO 3166-1 alpha-2, or 'XX' for international waters / multi-country events. */
  countryCode: string;
  /**
   * Which run owns the story: the worldwide daily batch / breaking monitor
   * ('global', also assumed when absent) or the US & state run ('us'). A run
   * only ever replaces, updates or expires stories in its own scope.
   */
  scope?: NewsScope;
  /** ISO 3166-2 subdivision for state-level stories, e.g. 'US-TX'. */
  subdivision?: string;
  sources: NewsSource[];
  /** Optional article preview image, resolved by the pipeline's enrichment step. */
  image?: NewsImage;
  /** 0-100, computed deterministically from corroboration + source reliability + bias spread. */
  trustScore: number;
  /** ISO timestamp of when this story was added to the map. Survives re-reporting. */
  firstSeen: string;
  /** ISO timestamp of the run that last reported it; moves only when the story is re-reported. */
  lastUpdated: string;
  /**
   * When the story leaves the map: lastUpdated plus a severity-scaled
   * lifetime (shared/retention.ts). Absent on files from before retention
   * existed; `expiryOf()` derives it then.
   */
  expiresAt?: string;
  isBreaking: boolean;
  /**
   * Editorial state, when there is something to say: 'developing' (facts
   * still moving), 'confirmed', 'disputed' (credible sources contradict each
   * other), or 'corrected' (an earlier version on the map was wrong — see
   * `correction`). Absent means an ordinary verified report.
   */
  status?: StoryStatus;
  /** What an earlier version of this story got wrong, when status is 'corrected'. */
  correction?: string;
  /** One line on what is new since the previous report, set when a run updates the story. */
  whatChanged?: string;
  /** Earlier versions of this story, oldest first (at most MAX_TIMELINE). */
  timeline?: TimelineEntry[];
  /**
   * The ongoing story this report belongs to ("Sudan war", "US midterms 2026"),
   * shared across reports so readers can follow it. `id` is a slug of `label`.
   */
  storyline?: Storyline;
}

/** A previous version of a story, kept when a run updates it. */
export interface TimelineEntry {
  /** When that version was reported (its lastUpdated). */
  at: string;
  headline: string;
  /** What that version said was new, if it said. */
  change?: string;
}

export interface Storyline {
  id: string;
  label: string;
}

/** Earlier versions kept per story. */
export const MAX_TIMELINE = 6;

/** A storyline's id from its label: lowercase ascii slug. */
export function storylineId(label: string): string {
  return label
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export const STORY_STATUSES = ['developing', 'confirmed', 'disputed', 'corrected'] as const;
export type StoryStatus = (typeof STORY_STATUSES)[number];

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
  /** Stories carried over unchanged from the previous run because they had not expired. */
  carried?: number;
  /** Stories that were already on the map and were re-reported this run. */
  updated?: number;
  /** Stories from the previous run that left the map because their lifetime ran out. */
  expired?: number;
  /**
   * Set when the run's coordinator hit its budget or turn cap after the
   * synthesizer had staged its stories, and those were published as-is: the
   * SDK result subtype, e.g. `error_max_budget_usd`. Absent on a full run.
   */
  stoppedEarly?: string;
  /** Whether the run produced a healthy map for its own scope; see RunHealth. */
  health?: RunHealth;
}

/**
 * A run's output checked against what a normal day looks like. Runs used to
 * publish one new story, or none, with nothing to say anything was wrong;
 * every warning here is meant to fail the Routine's pre-commit check.
 */
export interface RunHealth {
  /** The scope this run owns and was checked on. */
  scope: NewsScope;
  /** Stories this run added for the first time. */
  newStories: number;
  /** Stories already on the map that this run re-reported. */
  updatedStories: number;
  /** Categories with at least one live story in the scope. */
  categoriesCovered: number;
  /** World areas (shared/areas.ts) with at least one live story in the scope. */
  areasCovered: number;
  /** Human-readable problems; empty on a healthy run. */
  warnings: string[];
}

export interface NewsDataset {
  generatedAt: string;
  mode: 'daily' | 'breaking';
  events: NewsEvent[];
  stats?: RunStats;
}
