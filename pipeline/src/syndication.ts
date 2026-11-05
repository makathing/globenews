/**
 * Where a source's reporting actually comes from. Trust counts independent
 * newsrooms, not domains: an AP story reprinted by Yahoo, US News and a dozen
 * local TV sites is one report, not fourteen. A source's `origin` is the
 * newsroom that did the reporting — the wire it carries, or the outlet itself.
 *
 * Deliberately conservative: a URL is only attributed to a wire on a clear
 * signal (a known wire path or slug), plus aggregators whose news sections
 * are almost entirely wire copy. Anything else is its own origin.
 */

import { normalizeDomain } from './source-ratings.ts';

/** The wires, by the domain the origin is reported as. */
export const WIRE_DOMAINS: Readonly<Record<string, string>> = {
  'apnews.com': 'apnews.com',
  'ap.org': 'apnews.com',
  'reuters.com': 'reuters.com',
  'afp.com': 'afp.com',
};

/**
 * Sites whose news pages are overwhelmingly syndicated wire copy. A URL here
 * with no identifiable wire is attributed to the generic origin `wire`, so
 * two aggregators carrying the same story still count once.
 */
export const AGGREGATOR_DOMAINS: ReadonlySet<string> = new Set([
  'yahoo.com',
  'msn.com',
  'aol.com',
  'usnews.com',
  'newsbreak.com',
  'news.google.com',
  'flipboard.com',
  'ground.news',
  'inkl.com',
  'headtopics.com',
  'newsnow.co.uk',
  'devdiscourse.com',
  'marketscreener.com',
]);

/** Path or slug markers of syndicated wire copy, checked on lowercased paths. */
const WIRE_PATTERNS: [RegExp, string][] = [
  [/(^|[/_-])(ap|associated-press|associatedpress)([/_-]|$)/, 'apnews.com'],
  [/(^|[/_-])reuters([/_.-]|$)/, 'reuters.com'],
  [/(^|[/_-])afp([/_.-]|$)/, 'afp.com'],
];

/** Generic origin for unattributed aggregator copy. */
export const UNATTRIBUTED_WIRE = 'wire';

/** The newsroom behind a source URL. */
export function originOf(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const domain = normalizeDomain(host);
  const wire = WIRE_DOMAINS[domain];
  if (wire) return wire;
  const path = decodeURIComponent(parsed.pathname).toLowerCase();
  for (const [pattern, origin] of WIRE_PATTERNS) {
    if (pattern.test(path)) return origin;
  }
  if (AGGREGATOR_DOMAINS.has(domain) || AGGREGATOR_DOMAINS.has(host)) return UNATTRIBUTED_WIRE;
  return domain;
}
