import type { BiasRating, NewsSource } from '../../shared/news.ts';
import { originOf } from './syndication.ts';

const LEFTISH: BiasRating[] = ['left', 'center-left'];
const RIGHTISH: BiasRating[] = ['right', 'center-right'];

/** Weight of an origin seen only through an outlet's homepage, not an article. */
export const HOMEPAGE_WEIGHT = 0.5;
/** Distinct center origins that stand in for a left + right pair. */
export const CENTER_ORIGINS_FOR_SPECTRUM = 3;

/** A source's origin: stamped by finalize, else derived from its URL. */
export function sourceOrigin(source: Pick<NewsSource, 'url' | 'domain' | 'origin'>): string {
  return source.origin ?? originOf(source.url);
}

/**
 * How many independent reports back a story: distinct origins (newsrooms,
 * with syndicated wire copy folded into its wire), where an origin seen only
 * through an outlet's homepage counts half — naming an outlet is not the
 * same as linking what it reported.
 */
export function independentReports(sources: NewsSource[]): number {
  const best = new Map<string, number>();
  for (const source of sources) {
    const origin = sourceOrigin(source);
    const weight = source.homepage ? HOMEPAGE_WEIGHT : 1;
    best.set(origin, Math.max(best.get(origin) ?? 0, weight));
  }
  let total = 0;
  for (const weight of best.values()) total += weight;
  return total;
}

/**
 * Deterministic trust score — computed by the runner, never by a model.
 *
 *  - corroboration: more independent reports → more trust (dominant term).
 *    Reports are distinct origins, so wire copy on many sites counts once
 *    and a homepage-only citation counts half (independentReports).
 *  - average source reliability from the bundled ratings table
 *  - cross-spectrum bonus when a left-leaning AND a right-leaning outlet
 *    carry the story, or three distinct center newsrooms do
 *  - stories with fewer than two independent reports are capped at 40
 *    ("unverified" territory)
 */
export function computeTrustScore(sources: NewsSource[]): number {
  if (sources.length === 0) return 0;

  const reports = independentReports(sources);
  const avgReliability = sources.reduce((sum, s) => sum + s.reliability, 0) / sources.length;

  const hasLeft = sources.some((s) => LEFTISH.includes(s.bias));
  const hasRight = sources.some((s) => RIGHTISH.includes(s.bias));
  const centerOrigins = new Set(sources.filter((s) => s.bias === 'center' && !s.homepage).map(sourceOrigin));
  const crossSpectrum = (hasLeft && hasRight) || centerOrigins.size >= CENTER_ORIGINS_FOR_SPECTRUM;

  const corroboration = Math.min(reports, 5) / 5; // 0.1 … 1.0
  const raw = 0.5 * avgReliability + 40 * corroboration + (crossSpectrum ? 8 : 0);

  const capped = reports < 2 ? Math.min(raw, 40) : raw;
  return Math.round(Math.max(0, Math.min(100, capped)));
}

/** Severity >= this and multi-source → allowed to mark breaking. */
export const MIN_SOURCES_FOR_BREAKING = 2;
