import { createHash } from 'node:crypto';
import type { NewsDataset, NewsEvent, NewsSource, RunStats } from '../../shared/news.ts';
import { normalizeDomain, rateDomain } from './source-ratings.ts';
import { reconcileCoordinates } from './gazetteer.ts';
import { computeTrustScore } from './trust.ts';
import type { StagedOutput } from './schema.ts';

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

/**
 * Deterministic post-processing of agent output: source ratings, trust scores,
 * coordinate reconciliation, stable ids, firstSeen carry-over. Nothing here
 * trusts a number the model produced except lat/lon (gazetteer-checked),
 * severity, and the text fields.
 */
export function finalizeDataset(
  staged: StagedOutput,
  previous: NewsDataset | null,
  mode: 'daily' | 'breaking',
  opts: { markBreaking?: boolean; maxEvents?: number } = {},
): NewsDataset {
  const now = new Date().toISOString();
  const prevById = new Map<string, NewsEvent>(
    (previous?.events ?? []).map((event) => [event.id, event]),
  );

  const events: NewsEvent[] = [];
  for (const stagedEvent of staged.events) {
    const sources = buildSources(stagedEvent.sources as { url: string }[]);
    if (sources.length === 0) continue;

    const coords = reconcileCoordinates(stagedEvent.locationName, stagedEvent.lat, stagedEvent.lon);
    const id = stableEventId(stagedEvent.headline, coords.lat, coords.lon);
    const prev = prevById.get(id);

    // reuse preview images already resolved for the same article URLs
    const previousImages = new Map(
      (prev?.sources ?? []).filter((s) => s.image).map((s) => [s.url, s.image!]),
    );
    for (const source of sources) {
      const carried = previousImages.get(source.url);
      if (carried) source.image = carried;
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
      isBreaking: opts.markBreaking ?? false,
    });
  }

  events.sort((a, b) => b.severity - a.severity || b.trustScore - a.trustScore);
  return {
    generatedAt: now,
    mode,
    events: events.slice(0, opts.maxEvents ?? 60),
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
  return {
    imagesResolved: dataset.events.filter((event) => event.image).length,
    sourcesWithImages: sources.filter((source) => source.image).length,
    multiSource: dataset.events.filter((event) => event.sources.length >= 2).length,
  };
}
