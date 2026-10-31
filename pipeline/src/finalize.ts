import { createHash } from 'node:crypto';
import {
  scopeOf,
  type NewsDataset,
  type NewsEvent,
  type NewsScope,
  type NewsSource,
  type RunStats,
} from '../../shared/news.ts';
import { normalizeDomain, rateDomain } from './source-ratings.ts';
import { reconcileCoordinates, subdivisionFor, US_SUBDIVISIONS } from './gazetteer.ts';
import { computeTrustScore } from './trust.ts';
import type { StagedOutput } from './schema.ts';
import { expiryIso, isExpired } from '../../shared/retention.ts';
import { crossScopeMatch, matchPrevious } from './retention.ts';

export function stableEventId(headline: string, lat: number, lon: number): string {
  const key = `${headline.toLowerCase().replace(/[^a-z0-9]+/g, '-')}|${Math.round(lat)}|${Math.round(lon)}`;
  return createHash('sha1').update(key).digest('hex').slice(0, 12);
}

function buildSources(urls: { url: string }[]): NewsSource[] {
  const seen = new Set<string>();
  const sources: NewsSource[] = [];
  for (const { url } of urls) {
    try {
      const domain = normalizeDomain(new URL(url).hostname);
      if (seen.has(domain)) continue;
      seen.add(domain);
      const rating = rateDomain(domain);
      sources.push({
        url,
        domain,
        reliability: rating.reliability,
        bias: rating.bias,
        ...(rating.unrated ? { unrated: true } : {}),
      });
    } catch {
      // skip malformed URLs
    }
  }
  return sources;
}

/** Schema cap on sources per event; an update keeps its old outlets up to this. */
const MAX_SOURCES = 10;
/**
 * Cap on stories on the map, per scope: each run fills and trims only its own
 * share, so the US desk can never push a world story off the map or the
 * other way round. With lifetimes of one to seven days and ~30 new stories a
 * daily run, global steady state is around 80; the frontend draws three
 * primitives per story, so 160 in all has headroom (the schema allows 170).
 */
export const SCOPE_CAPS: Record<NewsScope, number> = { global: 120, us: 40 };

export interface FinalizeOptions {
  /** Which run this is; it only adds, updates or expires stories in this scope. */
  scope?: NewsScope;
  markBreaking?: boolean;
  /** Overrides the cap for this run's own scope. */
  maxEvents?: number;
  retain?: boolean;
}

export interface FinalizeReport {
  dataset: NewsDataset;
  /** Headlines dropped because the story already belongs to another scope. */
  skippedCrossScope: string[];
}

const bySeverityThenTrust = (a: NewsEvent, b: NewsEvent) =>
  b.severity - a.severity || b.trustScore - a.trustScore;

/** Sort, then trim each scope to its own cap. */
function capByScope(events: NewsEvent[], caps: Record<NewsScope, number>): NewsEvent[] {
  const sorted = [...events].sort(bySeverityThenTrust);
  const counts = new Map<NewsScope, number>();
  return sorted.filter((event) => {
    const scope = scopeOf(event);
    const count = counts.get(scope) ?? 0;
    counts.set(scope, count + 1);
    return count < caps[scope];
  });
}

/**
 * The state a US story is in: what the place name says, else the model's
 * (if it is a real US code), else the nearest known city's.
 */
function resolveSubdivision(
  countryCode: string,
  locationName: string,
  lat: number,
  lon: number,
  fromName: string | undefined,
  fromModel: string | undefined,
): string | undefined {
  if (countryCode !== 'US') {
    return fromModel?.startsWith(`${countryCode}-`) ? fromModel : undefined;
  }
  if (fromName) return fromName;
  if (fromModel && US_SUBDIVISIONS.has(fromModel)) return fromModel;
  return subdivisionFor(locationName, lat, lon);
}

/**
 * Deterministic post-processing of agent output: source ratings, trust scores,
 * coordinate reconciliation, stable ids, and continuity with the previous
 * run — a re-reported story keeps its id and its added time, and a story
 * nobody re-reported stays until its severity-scaled lifetime runs out.
 * Nothing here trusts a number the model produced except lat/lon
 * (gazetteer-checked), severity, and the text fields.
 *
 * Scoped: a run matches, updates, carries and caps only the stories of its
 * own scope. Every other story is carried through untouched (the very same
 * object), except that anything past its expiry is dropped by every run.
 */
export function finalizeDataset(
  staged: StagedOutput,
  previous: NewsDataset | null,
  mode: 'daily' | 'breaking',
  opts: FinalizeOptions = {},
): NewsDataset {
  return finalizeScoped(staged, previous, mode, opts).dataset;
}

export function finalizeScoped(
  staged: StagedOutput,
  previous: NewsDataset | null,
  mode: 'daily' | 'breaking',
  opts: FinalizeOptions = {},
): FinalizeReport {
  const now = new Date().toISOString();
  const nowMs = Date.parse(now);
  const scope = opts.scope ?? 'global';
  const retain = opts.retain ?? true;
  const previousEvents = previous?.events ?? [];
  const own = previousEvents.filter((event) => scopeOf(event) === scope);
  const others = previousEvents.filter((event) => scopeOf(event) !== scope);
  const prevById = new Map<string, NewsEvent>(own.map((event) => [event.id, event]));
  /** Previous ids that a staged event continued this run. */
  const continued = new Set<string>();
  const skippedCrossScope: string[] = [];

  const events: NewsEvent[] = [];
  for (const stagedEvent of staged.events) {
    const sources = buildSources(stagedEvent.sources as { url: string }[]);
    if (sources.length === 0) continue;

    const coords = reconcileCoordinates(stagedEvent.locationName, stagedEvent.lat, stagedEvent.lon);
    const ownId = stableEventId(stagedEvent.headline, coords.lat, coords.lon);
    if (crossScopeMatch(stagedEvent, coords, others, ownId)) {
      skippedCrossScope.push(stagedEvent.headline);
      continue;
    }
    let prev = retain ? matchPrevious(stagedEvent, coords, own, ownId) : prevById.get(ownId);
    // two staged events claiming the same story: the first is the update,
    // the second stands on its own
    if (prev && continued.has(prev.id)) prev = undefined;
    if (prev) continued.add(prev.id);
    const id = prev?.id ?? ownId;

    // reuse preview images already resolved for the same article URLs
    const previousImages = new Map(
      (prev?.sources ?? []).filter((s) => s.image).map((s) => [s.url, s.image!]),
    );
    for (const source of sources) {
      const carried = previousImages.get(source.url);
      if (carried) source.image = carried;
    }
    // an update keeps the outlets that reported the earlier chapter
    if (prev) {
      const domains = new Set(sources.map((source) => source.domain));
      for (const source of prev.sources) {
        if (sources.length >= MAX_SOURCES) break;
        if (domains.has(source.domain)) continue;
        domains.add(source.domain);
        sources.push({ ...source });
      }
    }

    const countryCode = (coords.cc ?? stagedEvent.countryCode ?? 'XX').toUpperCase();
    const subdivision = resolveSubdivision(
      countryCode,
      stagedEvent.locationName,
      coords.lat,
      coords.lon,
      coords.sub,
      stagedEvent.subdivision,
    );
    events.push({
      id,
      headline: stagedEvent.headline,
      summary: stagedEvent.summary,
      category: stagedEvent.category,
      severity: stagedEvent.severity,
      lat: coords.lat,
      lon: coords.lon,
      locationName: stagedEvent.locationName,
      countryCode,
      // global stories carry no scope key, so the worldwide file stays byte-stable
      ...(scope !== 'global' ? { scope } : {}),
      ...(subdivision ? { subdivision } : {}),
      sources,
      // carry a previously-resolved preview image forward; enrichment fills gaps
      ...(prev?.image ? { image: prev.image } : {}),
      trustScore: computeTrustScore(sources),
      firstSeen: prev?.firstSeen ?? now,
      lastUpdated: now,
      expiresAt: expiryIso(stagedEvent.severity, now),
      isBreaking: opts.markBreaking ?? false,
    });
  }

  if (retain) {
    for (const event of own) {
      if (continued.has(event.id) || isExpired(event, nowMs)) continue;
      events.push({
        ...event,
        expiresAt: event.expiresAt ?? expiryIso(event.severity, event.lastUpdated),
        // breaking means "this hour"; the next daily batch is when it stops being that
        isBreaking: mode === 'daily' ? false : event.isBreaking,
      });
    }
  }
  // another run's stories: never edited, only dropped once expired
  for (const event of others) {
    if (!isExpired(event, nowMs)) events.push(event);
  }

  const caps = { ...SCOPE_CAPS, ...(opts.maxEvents !== undefined ? { [scope]: opts.maxEvents } : {}) };
  return {
    dataset: { generatedAt: now, mode, events: capByScope(events, caps) },
    skippedCrossScope,
  };
}

/**
 * Re-merge a finished run onto a fresher copy of the dataset (another run may
 * have pushed while this one was researching): this run's scope comes from
 * its own result, every other scope from `fresh`. On an id collision the
 * fresh other-scope story wins. Pure; `generatedAt`, `mode` and `stats` are
 * this run's.
 */
export function remergeScope(fresh: NewsDataset | null, mine: NewsDataset, scope: NewsScope): NewsDataset {
  const nowMs = Date.parse(mine.generatedAt);
  const theirs = (fresh?.events ?? []).filter(
    (event) => scopeOf(event) !== scope && !isExpired(event, nowMs),
  );
  const theirIds = new Set(theirs.map((event) => event.id));
  const ours = mine.events.filter((event) => scopeOf(event) === scope && !theirIds.has(event.id));
  return { ...mine, events: capByScope([...ours, ...theirs], SCOPE_CAPS) };
}

/** Staged events outside the region are not this run's to publish. */
export function keepInRegion(staged: StagedOutput, countryCode: string): {
  kept: StagedOutput;
  dropped: string[];
} {
  const dropped: string[] = [];
  const events = staged.events.filter((event) => {
    const cc = (reconcileCoordinates(event.locationName, event.lat, event.lon).cc ?? event.countryCode).toUpperCase();
    if (cc === countryCode) return true;
    dropped.push(`${event.headline} (${event.locationName}, ${cc})`);
    return false;
  });
  return { kept: { events }, dropped };
}

/**
 * Recount a dataset's headline numbers from the dataset itself, so what the
 * file claims can never drift from what it contains. Recorded on every run
 * because image enrichment fails silently by design: without this, a run that
 * resolved nothing looks exactly like one that had nothing to resolve.
 */
export function computeStats(dataset: NewsDataset): RunStats {
  const sources = dataset.events.flatMap((event) => event.sources);
  const thisRun = (event: NewsEvent) => event.lastUpdated === dataset.generatedAt;
  return {
    imagesResolved: dataset.events.filter((event) => event.image).length,
    sourcesWithImages: sources.filter((source) => source.image).length,
    multiSource: dataset.events.filter((event) => event.sources.length >= 2).length,
    carried: dataset.events.filter((event) => !thisRun(event)).length,
    updated: dataset.events.filter((event) => thisRun(event) && event.firstSeen !== event.lastUpdated)
      .length,
  };
}
