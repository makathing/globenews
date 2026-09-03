import { z } from 'zod';
import { BIAS_RATINGS, CATEGORIES, type NewsDataset } from '../../shared/news.ts';
import { lookupPlace } from './gazetteer.ts';

export const NewsSourceSchema = z.object({
  url: z.url(),
  domain: z.string().min(3),
  reliability: z.number().min(0).max(100),
  bias: z.enum(BIAS_RATINGS),
  unrated: z.boolean().optional(),
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
  events: z.array(NewsEventSchema).max(150),
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
    .array(z.object({ url: z.url() }).or(z.url().transform((url) => ({ url }))))
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

/**
 * Coerce whatever the synthesizer wrote for `sources` into [{url}] —
 * live runs produced strings, protocol-less domains, markdown links, and
 * objects keyed `link`/`href` instead of `url`.
 */
export function normalizeStagedSources(value: unknown): { url: string }[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const urls: string[] = [];
  const push = (raw: unknown) => {
    if (typeof raw !== 'string') return;
    const match = raw.match(/https?:\/\/[^\s"'<>\\)\]]+/);
    let candidate = match?.[0] ?? raw.trim();
    if (!/^https?:\/\//.test(candidate) && /^[\w-]+(\.[\w-]+)+(\/|$)/.test(candidate)) {
      candidate = `https://${candidate}`;
    }
    try {
      const url = new URL(candidate);
      if (url.protocol === 'https:' || url.protocol === 'http:') urls.push(url.toString());
    } catch {
      // not a URL — skip
    }
  };
  for (const entry of value) {
    if (typeof entry === 'string') push(entry);
    else if (entry && typeof entry === 'object') {
      const record = entry as Record<string, unknown>;
      push(record.url ?? record.link ?? record.href ?? record.source);
    }
  }
  const unique = [...new Set(urls)].map((url) => ({ url }));
  return unique.length > 0 ? unique.slice(0, 10) : undefined;
}

export interface SalvageResult {
  staged: StagedOutput;
  dropped: { index: number; reason: string }[];
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
        for (const part of name.split(/[,/]/).map((p) => p.trim())) {
          const place = lookupPlace(part);
          if (place) {
            fixed.lat = place.lat;
            fixed.lon = place.lon;
            if (typeof fixed.countryCode !== 'string') fixed.countryCode = place.cc;
            break;
          }
        }
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
      const retry = StagedEventSchema.safeParse(fixed);
      if (retry.success) {
        staged.events.push(retry.data);
        repaired += 1;
        continue;
      }
      dropped.push({
        index,
        reason: retry.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ').slice(0, 300),
      });
    } else {
      dropped.push({ index, reason: 'not an object' });
    }
  }

  if (staged.events.length === 0) {
    throw new Error(
      `No staged events survived validation (${dropped.length} dropped). First reason: ${dropped[0]?.reason}`,
    );
  }
  return { staged, dropped, repaired, severityDefaulted };
}
