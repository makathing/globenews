import { z } from 'zod';
import {
  BIAS_RATINGS,
  CATEGORIES,
  CATEGORY_LABELS,
  NEWS_SCOPES,
  type Category,
  type NewsDataset,
} from '../../shared/news.ts';
import { resolvePlace } from './gazetteer.ts';
import { resolveOutletName } from './outlet-names.ts';
import { normalizeDomain } from './source-ratings.ts';

/** ISO 3166-2, e.g. 'US-TX', 'US-DC'. */
export const SUBDIVISION_PATTERN = /^[A-Z]{2}-[A-Z0-9]{1,3}$/;

export const NewsSourceSchema = z.object({
  url: z.url(),
  domain: z.string().min(3),
  reliability: z.number().min(0).max(100),
  bias: z.enum(BIAS_RATINGS),
  unrated: z.boolean().optional(),
  homepage: z.boolean().optional(),
  image: z.url().optional(),
  icon: z.url().optional(),
});

export const NewsImageSchema = z.object({
  url: z.url(),
  domain: z.string().min(3),
});

export const NewsEventSchema = z.object({
  id: z.string().min(4),
  headline: z.string().min(8).max(200),
  summary: z.string().min(20).max(600),
  category: z.enum(CATEGORIES),
  severity: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  locationName: z.string().min(2),
  countryCode: z.string().length(2),
  scope: z.enum(NEWS_SCOPES).optional(),
  subdivision: z.string().regex(SUBDIVISION_PATTERN).optional(),
  sources: z.array(NewsSourceSchema).min(1).max(10),
  image: NewsImageSchema.optional(),
  trustScore: z.number().min(0).max(100),
  firstSeen: z.iso.datetime({ offset: true }),
  lastUpdated: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }).optional(),
  isBreaking: z.boolean(),
});

export const RunStatsSchema = z.object({
  imagesResolved: z.number().min(0),
  sourcesWithImages: z.number().min(0),
  multiSource: z.number().min(0),
  enrichedAt: z.iso.datetime({ offset: true }).optional(),
  severityDefaulted: z.number().min(0).optional(),
  severityBackfilled: z.number().min(0).optional(),
  enrichment: z.enum(['inline', 'deferred', 'build']).optional(),
  carried: z.number().min(0).optional(),
  updated: z.number().min(0).optional(),
  expired: z.number().min(0).optional(),
});

export const NewsDatasetSchema = z.object({
  generatedAt: z.iso.datetime({ offset: true }),
  mode: z.enum(['daily', 'breaking']),
  // per-scope caps (finalize.ts SCOPE_CAPS: 120 global + 40 us) plus slack
  events: z.array(NewsEventSchema).max(170),
  // zod strips unknown keys rather than rejecting them, so anything absent
  // here is silently dropped on read — stats have to be declared to survive
  stats: RunStatsSchema.optional(),
});

/**
 * Looser shape for what the synthesizer agent writes to the staging file.
 * The runner fills in trustScore / firstSeen / timestamps deterministically,
 * so agents are not asked to produce (or trusted to invent) those.
 */
export const StagedEventSchema = NewsEventSchema.omit({
  id: true,
  // which run owns a story is the runner's call, never the model's
  scope: true,
  trustScore: true,
  firstSeen: true,
  lastUpdated: true,
  expiresAt: true,
  isBreaking: true,
}).extend({
  // the id of the story already on the map that this event continues; the
  // runner uses it to keep that story's id and added time
  updates: z.string().optional(),
  sources: z
    .array(
      z
        .object({ url: z.url(), homepage: z.boolean().optional() })
        .or(z.url().transform((url) => ({ url }))),
    )
    .min(1)
    .max(10),
});

export const StagedOutputSchema = z.object({
  events: z.array(StagedEventSchema).min(1).max(100),
});

export type StagedEvent = z.infer<typeof StagedEventSchema>;
export type StagedOutput = z.infer<typeof StagedOutputSchema>;

export function validateDataset(data: unknown): NewsDataset {
  return NewsDatasetSchema.parse(data) as NewsDataset;
}

/** Truncate at a sentence (preferred) or word boundary, with ellipsis. */
export function truncateText(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  const slice = trimmed.slice(0, max - 1);
  const sentenceEnd = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '));
  if (sentenceEnd > max * 0.6) return slice.slice(0, sentenceEnd + 1);
  const wordEnd = slice.lastIndexOf(' ');
  return (wordEnd > max * 0.6 ? slice.slice(0, wordEnd) : slice) + '…';
}

export interface StagedSource {
  url: string;
  /** The outlet's homepage, recovered from a bare outlet name — not the article itself. */
  homepage?: boolean;
}

const URL_KEYS = ['url', 'link', 'href', 'source'] as const;
const NAME_KEYS = ['name', 'outlet', 'publisher', 'domain', 'title', 'source', 'site'] as const;

/** A bare domain somewhere in free text: "Al Jazeera (aljazeera.com)". */
const DOMAIN_IN_TEXT = /(?:^|[\s(\[<"'])((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24})(\/[^\s"'<>)\]]*)?(?=$|[\s)\]>"',;])/i;

function asHttpUrl(candidate: string): URL | undefined {
  try {
    const url = new URL(candidate);
    if ((url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.includes('.')) return url;
  } catch {
    // not a URL
  }
  return undefined;
}

/** A site's front page rather than an article on it. */
export function isHomepage(url: URL): boolean {
  return url.pathname === '/' && !url.search;
}

/** An article URL (or a domain-prefixed path) from a string, if it holds one. */
function urlFrom(raw: string): StagedSource | undefined {
  const match = raw.match(/https?:\/\/[^\s"'<>\\)\]]+/);
  if (match) {
    const url = asHttpUrl(match[0]);
    return url ? { url: url.toString() } : undefined;
  }
  const text = raw.trim();
  if (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(text)) {
    const url = asHttpUrl(`https://${text}`);
    if (url) return isHomepage(url) ? { url: url.toString(), homepage: true } : { url: url.toString() };
  }
  const inText = raw.match(DOMAIN_IN_TEXT);
  if (inText) {
    const path = inText[2] && inText[2] !== '/' ? inText[2] : '';
    const url = asHttpUrl(`https://${inText[1].toLowerCase()}${path}`);
    if (url) return path ? { url: url.toString() } : { url: url.toString(), homepage: true };
  }
  return undefined;
}

/** The outlet's homepage from a name: the whole string, then its parts ("Reuters - Headline"). */
function homepageFrom(raw: string): StagedSource | undefined {
  const candidates = [raw, ...raw.split(/\s[-\u2013\u2014|:]\s|[()[\],;]/)];
  for (const candidate of candidates) {
    const domain = resolveOutletName(candidate);
    if (domain) return { url: `https://${domain}/`, homepage: true };
  }
  return undefined;
}

/**
 * Coerce whatever the synthesizer wrote for `sources` into [{url}] —
 * live runs produced strings, protocol-less domains, markdown links, objects
 * keyed `link`/`href` instead of `url`, and bare outlet names ("Reuters",
 * {"outlet": "BBC", "url": ""}). Names of known outlets become the outlet's
 * homepage, flagged `homepage: true`; unknown names are skipped.
 */
export function normalizeStagedSources(value: unknown): StagedSource[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const found: StagedSource[] = [];
  for (const entry of value) {
    let source: StagedSource | undefined;
    if (typeof entry === 'string') {
      source = urlFrom(entry) ?? homepageFrom(entry);
    } else if (entry && typeof entry === 'object') {
      const record = entry as Record<string, unknown>;
      const strings = (keys: readonly string[]) =>
        keys.map((key) => record[key]).filter((v): v is string => typeof v === 'string' && v.trim() !== '');
      for (const raw of strings(URL_KEYS)) {
        source = urlFrom(raw);
        if (source) break;
      }
      if (!source) {
        for (const raw of strings(NAME_KEYS)) {
          source = homepageFrom(raw) ?? urlFrom(raw);
          if (source) break;
        }
      }
    }
    if (source) found.push(source);
  }
  // a homepage adds nothing when the same outlet's article is already cited
  const domainOf = (url: string) => normalizeDomain(new URL(url).hostname);
  const articleDomains = new Set(found.filter((s) => !s.homepage).map((s) => domainOf(s.url)));
  const seen = new Set<string>();
  const unique: StagedSource[] = [];
  for (const source of found) {
    const key = source.homepage ? `home:${domainOf(source.url)}` : source.url;
    if (seen.has(key)) continue;
    if (source.homepage && articleDomains.has(domainOf(source.url))) continue;
    seen.add(key);
    unique.push(source);
  }
  return unique.length > 0 ? unique.slice(0, 10) : undefined;
}

/**
 * Synthesizer category dialects -> the fixed list. Live runs dropped stories
 * for "security", "technology", "environment" and the like.
 */
const CATEGORY_ALIASES: Record<string, Category> = {
  security: 'conflict',
  war: 'conflict',
  military: 'conflict',
  terrorism: 'conflict',
  defense: 'conflict',
  defence: 'conflict',
  'armed conflict': 'conflict',
  violence: 'conflict',
  environment: 'climate',
  environmental: 'climate',
  ecology: 'climate',
  pollution: 'climate',
  wildlife: 'climate',
  'climate change': 'climate',
  energy: 'economy',
  business: 'economy',
  markets: 'economy',
  market: 'economy',
  finance: 'economy',
  financial: 'economy',
  trade: 'economy',
  economics: 'economy',
  economic: 'economy',
  labor: 'economy',
  labour: 'economy',
  technology: 'science',
  tech: 'science',
  space: 'science',
  ai: 'science',
  'artificial intelligence': 'science',
  research: 'science',
  weather: 'disaster',
  earthquake: 'disaster',
  'natural disaster': 'disaster',
  'natural disasters': 'disaster',
  accident: 'disaster',
  disasters: 'disaster',
  'human rights': 'society',
  culture: 'society',
  education: 'society',
  religion: 'society',
  migration: 'society',
  immigration: 'society',
  crime: 'society',
  justice: 'society',
  social: 'society',
  elections: 'politics',
  election: 'politics',
  government: 'politics',
  diplomacy: 'politics',
  geopolitics: 'politics',
  'international relations': 'politics',
  policy: 'politics',
  medicine: 'health',
  'public health': 'health',
  disease: 'health',
  healthcare: 'health',
  'health care': 'health',
  pandemic: 'health',
};

/** A category from the fixed list for an off-list one, if it maps cleanly. */
export function normalizeCategory(value: unknown): Category | undefined {
  if (typeof value !== 'string') return undefined;
  const key = value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  const lookup = (k: string): Category | undefined => {
    if ((CATEGORIES as readonly string[]).includes(k)) return k as Category;
    const byLabel = CATEGORIES.find((c) => CATEGORY_LABELS[c].toLowerCase() === k);
    return byLabel ?? CATEGORY_ALIASES[k];
  };
  // "politics/economy", "security & defense": the first part decides
  return lookup(key) ?? lookup(key.split(/\s*[/&,]\s*|\s+and\s+/)[0]);
}

/** Nothing survived salvage; carries the drops so the caller can still diagnose them. */
export class StagedValidationError extends Error {
  constructor(
    message: string,
    readonly dropped: SalvageResult['dropped'],
  ) {
    super(message);
  }
}

export interface SalvageResult {
  staged: StagedOutput;
  /** `sources` is the event's raw sources value, kept for diagnosing why it failed. */
  dropped: { index: number; reason: string; sources?: unknown }[];
  repaired: number;
  /**
   * How many events had no usable severity and took the default. A live run
   * once produced 19 of 19 here: the synthesizer omitted the field entirely,
   * every event silently became a 3, and the globe's whole severity encoding
   * went flat with nothing in the logs to say so. Counted so it can be seen.
   */
  severityDefaulted: number;
}

/**
 * Salvage parser for the synthesizer's staging file. Verified need from live
 * runs: models occasionally overflow a length limit or malform one event —
 * failing the whole (expensive) batch for that is wasteful. Trivial issues
 * are repaired (over-long text truncated, severity clamped, countryCode
 * defaulted); events that still fail validation are dropped individually.
 */
export function parseStagedOutput(raw: string): SalvageResult {
  const json = JSON.parse(raw) as { events?: unknown[] };
  if (!Array.isArray(json.events)) throw new Error('Staged output has no "events" array');

  const staged: StagedOutput = { events: [] };
  const dropped: SalvageResult['dropped'] = [];
  let repaired = 0;
  let severityDefaulted = 0;

  for (let index = 0; index < json.events.length; index++) {
    const rawEvent = json.events[index];
    const direct = StagedEventSchema.safeParse(rawEvent);
    if (direct.success) {
      staged.events.push(direct.data);
      continue;
    }

    if (typeof rawEvent === 'object' && rawEvent !== null) {
      const fixed: Record<string, unknown> = { ...(rawEvent as Record<string, unknown>) };

      // field aliases — live runs produced title/description/location dialects
      if (typeof fixed.headline !== 'string' && typeof fixed.title === 'string') {
        fixed.headline = fixed.title;
      }
      if (typeof fixed.summary !== 'string' && typeof fixed.description === 'string') {
        fixed.summary = fixed.description;
      }
      if (typeof fixed.locationName !== 'string') {
        if (typeof fixed.location === 'string') fixed.locationName = fixed.location;
        else if (typeof fixed.place === 'string') fixed.locationName = fixed.place;
      }
      if (typeof fixed.severity !== 'number') {
        const SEVERITY_WORDS: Record<string, number> = {
          critical: 5,
          extreme: 5,
          severe: 4,
          high: 4,
          major: 4,
          moderate: 3,
          medium: 3,
          significant: 3,
          low: 2,
          minor: 1,
        };
        const rawSeverity = fixed.severity ?? fixed.impact;
        if (typeof rawSeverity === 'string') {
          fixed.severity =
            SEVERITY_WORDS[rawSeverity.trim().toLowerCase()] ??
            (Number.isFinite(Number(rawSeverity)) ? Number(rawSeverity) : 3);
        } else if (typeof rawSeverity === 'number') {
          fixed.severity = rawSeverity;
        } else {
          fixed.severity = 3;
          severityDefaulted += 1;
        }
      }
      // missing coordinates: resolve from the gazetteer by location name
      if (typeof fixed.lat !== 'number' || typeof fixed.lon !== 'number') {
        const name = typeof fixed.locationName === 'string' ? fixed.locationName : '';
        const place = resolvePlace(name);
        if (place) {
          fixed.lat = place.lat;
          fixed.lon = place.lon;
          if (typeof fixed.countryCode !== 'string') fixed.countryCode = place.cc;
        }
      }
      // a malformed subdivision is not worth an event: fix the case or drop the field
      if (fixed.subdivision !== undefined) {
        const sub = typeof fixed.subdivision === 'string' ? fixed.subdivision.trim().toUpperCase() : '';
        if (SUBDIVISION_PATTERN.test(sub)) fixed.subdivision = sub;
        else delete fixed.subdivision;
      }

      if (typeof fixed.summary === 'string') fixed.summary = truncateText(fixed.summary, 590);
      if (typeof fixed.headline === 'string') fixed.headline = truncateText(fixed.headline, 195);
      if (typeof fixed.severity === 'number') {
        fixed.severity = Math.min(5, Math.max(1, Math.round(fixed.severity)));
      }
      if (typeof fixed.countryCode !== 'string' || fixed.countryCode.length !== 2) {
        fixed.countryCode = 'XX';
      }
      const sources = normalizeStagedSources(fixed.sources);
      if (sources) fixed.sources = sources;
      if (!(CATEGORIES as readonly string[]).includes(fixed.category as string)) {
        const category = normalizeCategory(fixed.category);
        if (category) fixed.category = category;
      }
      const retry = StagedEventSchema.safeParse(fixed);
      if (retry.success) {
        staged.events.push(retry.data);
        repaired += 1;
        continue;
      }
      dropped.push({
        index,
        reason: retry.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ').slice(0, 300),
        sources: (rawEvent as Record<string, unknown>).sources,
      });
    } else {
      dropped.push({ index, reason: 'not an object' });
    }
  }

  if (staged.events.length === 0) {
    throw new StagedValidationError(
      `No staged events survived validation (${dropped.length} dropped). First reason: ${dropped[0]?.reason}`,
      dropped,
    );
  }
  return { staged, dropped, repaired, severityDefaulted };
}
