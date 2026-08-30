import type { BiasRating, NewsSource } from '../../shared/news.ts';

const LEFTISH: BiasRating[] = ['left', 'center-left'];
const RIGHTISH: BiasRating[] = ['right', 'center-right'];

/**
 * Deterministic trust score — computed by the runner, never by a model.
 *
 *  - corroboration: more independent domains → more trust (dominant term)
 *  - average source reliability from the bundled ratings table
 *  - cross-spectrum bonus when at least one left-leaning AND one
 *    right-leaning (or two+ center) outlets carry the story
 *  - single-source stories are capped at 40 ("unverified" territory)
 */
export function computeTrustScore(sources: NewsSource[]): number {
  if (sources.length === 0) return 0;

  const domains = new Set(sources.map((s) => s.domain));
  const n = domains.size;
  const avgReliability = sources.reduce((sum, s) => sum + s.reliability, 0) / sources.length;

  const biases = sources.map((s) => s.bias);
  const hasLeft = biases.some((b) => LEFTISH.includes(b));
  const hasRight = biases.some((b) => RIGHTISH.includes(b));
  const centerCount = biases.filter((b) => b === 'center').length;
  const crossSpectrum = (hasLeft && hasRight) || centerCount >= 2;

  const corroboration = Math.min(n, 5) / 5; // 0.2 … 1.0
  const raw = 0.5 * avgReliability + 40 * corroboration + (crossSpectrum ? 8 : 0);

  const capped = n < 2 ? Math.min(raw, 40) : raw;
  return Math.round(Math.max(0, Math.min(100, capped)));
}

/** Severity >= this and multi-source → allowed to mark breaking. */
export const MIN_SOURCES_FOR_BREAKING = 2;
