import { createHash } from 'node:crypto';
import type { NewsDataset, NewsEvent, NewsSource, RunStats } from '../../shared/news.ts';
import { normalizeDomain, rateDomain } from './source-ratings.ts';
import { reconcileCoordinates } from './gazetteer.ts';
import { computeTrustScore } from './trust.ts';
import type { StagedOutput } from './schema.ts';
import { expiryIso, isExpired } from '../../shared/retention.ts';
import { matchPrevious } from './retention.ts';

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
 * Cap on stories on the map. With lifetimes of one to seven days and ~30 new
 * stories a run, steady state is around 80; the frontend draws three
 * primitives per story, so this has headroom.
 */
const MAX_EVENTS = 120;

/**
 * Deterministic post-processing of agent output: source ratings, trust scores,
 * coordinate reconciliation, stable ids, and continuity with the previous
 * run — a re-reported story keeps its id and its added time, and a story
 * nobody re-reported stays until its severity-scaled lifetime runs out.
 * Nothing here trusts a number the model produced except lat/lon
 * (gazetteer-checked), severity, and the text fields.
 */
export function finalizeDataset(
  staged: StagedOutput,
  previous: NewsDataset | null,
  mode: 'daily' | 'breaking',
  opts: { markBreaking?: boolean; maxEvents?: number; retain?: boolean } = {},
): NewsDataset {
  const now = new Date().toISOString();
  const nowMs = Date.parse(now);
  const retain = opts.retain ?? true;
  const previousEvents = previous?.events ?? [];
  const prevById = new Map<string, NewsEvent>(previousEvents.map((event) => [event.id, event]));
  /** Previous ids that a staged event continued this run. */
  const continued = new Set<string>();

  const events: NewsEvent[] = [];
  for (const stagedEvent of staged.events) {
    const sources = buildSources(stagedEvent.sources as { url: string }[]);
    if (sources.length === 0) continue;

    const coords = reconcileCoordinates(stagedEvent.locationName, stagedEvent.lat, stagedEvent.lon);
    const ownId = stableEventId(stagedEvent.headline, coords.lat, coords.lon);
    let prev = retain
      ? matchPrevious(stagedEvent, coords, previousEvents, ownId)
      : prevById.get(ownId);
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

    events.push({
      id,
      headline: stagedEvent.headline,
      summary: stagedEvent.summary,
      category: stagedEvent.category,
      severity: stagedEvent.severity,
      lat: coords.lat,
      lon: coords.lon,
      locationName: stagedEvent.locationName,
      countryCode: (coords.cc ?? stagedEvent.countryCode ?? 'XX').toUpperCase(),
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
    for (const event of previousEvents) {
      if (continued.has(event.id) || isExpired(event, nowMs)) continue;
      events.push({
        ...event,
        expiresAt: event.expiresAt ?? expiryIso(event.severity, event.lastUpdated),
        // breaking means "this hour"; the next daily batch is when it stops being that
        isBreaking: mode === 'daily' ? false : event.isBreaking,
      });
    }
  }

  events.sort((a, b) => b.severity - a.severity || b.trustScore - a.trustScore);
  return {
    generatedAt: now,
    mode,
    events: events.slice(0, opts.maxEvents ?? MAX_EVENTS),
  };
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
