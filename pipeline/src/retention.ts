import type { NewsEvent } from '../../shared/news.ts';

/**
 * Matching a freshly reported story to the one already on the map.
 *
 * A story's id is a hash of its headline, so a follow-up with new wording
 * would otherwise land as a brand-new event with a brand-new "added" time,
 * next to the stale copy of itself. Three signals, strongest first: the
 * synthesizer naming the story it continues, the exact id, and a fuzzy
 * headline match gated by category and distance. The fuzzy gate exists for
 * the runs where the agent forgot; it is deliberately conservative — a
 * missed match costs a duplicate for a day, a false one merges two stories.
 */

export const MATCH_RADIUS_KM = 250;
/** Jaccard similarity of headline tokens needed for a fuzzy match. */
export const MATCH_SIMILARITY = 0.34;
/** ...and never on a single shared word. */
const MIN_SHARED_TOKENS = 2;

// words that appear in most headlines about anything, so sharing them says
// nothing about sharing a story
const STOPWORDS = new Set([
  'about', 'across', 'after', 'again', 'against', 'amid', 'among', 'announces', 'authorities',
  'before', 'between', 'city', 'continue', 'continues', 'country', 'death', 'dead', 'deaths',
  'despite', 'during', 'first', 'following', 'from', 'government', 'group', 'hits', 'into',
  'killed', 'kills', 'latest', 'leader', 'least', 'major', 'minister', 'more', 'most', 'national',
  'near', 'officials', 'over', 'people', 'police', 'president', 'report', 'reports', 'said',
  'says', 'several', 'since', 'some', 'state', 'than', 'that', 'their', 'there', 'they', 'this',
  'thousands', 'through', 'toll', 'under', 'while', 'with', 'world', 'years',
]);

export function headlineTokens(headline: string): Set<string> {
  return new Set(
    headline
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((token) => token.length >= 4 && !STOPWORDS.has(token)),
  );
}

export function jaccard(a: Set<string>, b: Set<string>): { score: number; shared: number } {
  if (a.size === 0 || b.size === 0) return { score: 0, shared: 0 };
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return { score: shared / (a.size + b.size - shared), shared };
}

const EARTH_RADIUS_KM = 6371;

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

export interface StagedLike {
  headline: string;
  category: string;
  /** Id of the story this one continues, when the synthesizer said so. */
  updates?: string;
}

/**
 * The previous event this staged one continues, or undefined for a new story.
 * `exactId` is the id the staged event would get on its own; passing it in
 * keeps the hashing in one place (finalize.ts).
 */
export function matchPrevious(
  staged: StagedLike,
  coords: { lat: number; lon: number },
  previous: NewsEvent[],
  exactId: string,
): NewsEvent | undefined {
  if (staged.updates) {
    const named = previous.find((event) => event.id === staged.updates);
    if (named) return named;
  }
  const exact = previous.find((event) => event.id === exactId);
  if (exact) return exact;

  const tokens = headlineTokens(staged.headline);
  let best: NewsEvent | undefined;
  let bestScore = 0;
  for (const candidate of previous) {
    if (candidate.category !== staged.category) continue;
    if (distanceKm(coords.lat, coords.lon, candidate.lat, candidate.lon) > MATCH_RADIUS_KM) continue;
    const { score, shared } = jaccard(tokens, headlineTokens(candidate.headline));
    if (shared < MIN_SHARED_TOKENS || score < MATCH_SIMILARITY) continue;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}
