import type { BiasRating } from '../../shared/news.ts';

export interface SourceRating {
  reliability: number; // 0-100 factual-reporting track record
  bias: BiasRating;
}

/**
 * Bundled source intelligence table, keyed by registrable domain.
 * Heuristic starting points informed by public media-bias/factuality research
 * (wire services and public broadcasters rate highest on factual reporting).
 * Edit freely — the hooks and trust scoring read only from this table.
 */
export const SOURCE_RATINGS: Record<string, SourceRating> = {
  // Wire services
  'reuters.com': { reliability: 95, bias: 'center' },
  'apnews.com': { reliability: 95, bias: 'center' },
  'afp.com': { reliability: 93, bias: 'center' },
  'upi.com': { reliability: 82, bias: 'center' },

  // Global broadsheets & magazines
  'nytimes.com': { reliability: 87, bias: 'center-left' },
  'wsj.com': { reliability: 87, bias: 'center-right' },
  'washingtonpost.com': { reliability: 85, bias: 'center-left' },
  'theguardian.com': { reliability: 84, bias: 'center-left' },
  'ft.com': { reliability: 90, bias: 'center' },
  'economist.com': { reliability: 89, bias: 'center' },
  'bloomberg.com': { reliability: 88, bias: 'center' },
  'latimes.com': { reliability: 82, bias: 'center-left' },
  'usatoday.com': { reliability: 80, bias: 'center' },
  'thetimes.com': { reliability: 82, bias: 'center-right' },
  'telegraph.co.uk': { reliability: 78, bias: 'center-right' },
  'independent.co.uk': { reliability: 75, bias: 'center-left' },
  'lemonde.fr': { reliability: 85, bias: 'center-left' },
  'spiegel.de': { reliability: 83, bias: 'center-left' },
  'faz.net': { reliability: 84, bias: 'center-right' },
  'elpais.com': { reliability: 82, bias: 'center-left' },
  'corriere.it': { reliability: 80, bias: 'center' },
  'asahi.com': { reliability: 83, bias: 'center-left' },
  'japantimes.co.jp': { reliability: 82, bias: 'center' },
  'scmp.com': { reliability: 76, bias: 'center' },
  'straitstimes.com': { reliability: 78, bias: 'center' },
  'timesofindia.com': { reliability: 70, bias: 'center' },
  'thehindu.com': { reliability: 80, bias: 'center-left' },
  'haaretz.com': { reliability: 80, bias: 'center-left' },
  'timesofisrael.com': { reliability: 78, bias: 'center' },

  // Broadcasters & public media
  'bbc.com': { reliability: 90, bias: 'center' },
  'bbc.co.uk': { reliability: 90, bias: 'center' },
  'npr.org': { reliability: 87, bias: 'center-left' },
  'pbs.org': { reliability: 87, bias: 'center' },
  'cnn.com': { reliability: 75, bias: 'center-left' },
  'foxnews.com': { reliability: 62, bias: 'right' },
  'msnbc.com': { reliability: 62, bias: 'left' },
  'abcnews.go.com': { reliability: 82, bias: 'center' },
  'cbsnews.com': { reliability: 82, bias: 'center' },
  'nbcnews.com': { reliability: 81, bias: 'center-left' },
  'aljazeera.com': { reliability: 78, bias: 'center-left' },
  'dw.com': { reliability: 86, bias: 'center' },
  'france24.com': { reliability: 84, bias: 'center' },
  'nhk.or.jp': { reliability: 88, bias: 'center' },
  'abc.net.au': { reliability: 86, bias: 'center' },
  'cbc.ca': { reliability: 85, bias: 'center-left' },
  'skynews.com': { reliability: 76, bias: 'center' },
  'news.sky.com': { reliability: 76, bias: 'center' },
  'euronews.com': { reliability: 80, bias: 'center' },
  'channelnewsasia.com': { reliability: 80, bias: 'center' },

  // Digital-native & specialist
  'axios.com': { reliability: 80, bias: 'center' },
  'politico.com': { reliability: 79, bias: 'center' },
  'politico.eu': { reliability: 79, bias: 'center' },
  'thehill.com': { reliability: 76, bias: 'center' },
  'reuters.org': { reliability: 90, bias: 'center' },
  'cnbc.com': { reliability: 80, bias: 'center' },
  'marketwatch.com': { reliability: 78, bias: 'center' },
  'forbes.com': { reliability: 68, bias: 'center' },
  'businessinsider.com': { reliability: 66, bias: 'center-left' },
  'vox.com': { reliability: 68, bias: 'left' },
  'huffpost.com': { reliability: 60, bias: 'left' },
  'dailywire.com': { reliability: 55, bias: 'right' },
  'breitbart.com': { reliability: 40, bias: 'right' },
  'motherjones.com': { reliability: 62, bias: 'left' },
  'theatlantic.com': { reliability: 80, bias: 'center-left' },
  'newyorker.com': { reliability: 80, bias: 'center-left' },
  'time.com': { reliability: 78, bias: 'center-left' },
  'newsweek.com': { reliability: 62, bias: 'center' },
  'nature.com': { reliability: 95, bias: 'center' },
  'science.org': { reliability: 95, bias: 'center' },
  'scientificamerican.com': { reliability: 88, bias: 'center' },
  'newscientist.com': { reliability: 85, bias: 'center' },
  'statnews.com': { reliability: 86, bias: 'center' },
  'who.int': { reliability: 92, bias: 'center' },
  'un.org': { reliability: 88, bias: 'center' },
  'noaa.gov': { reliability: 94, bias: 'center' },
  'nasa.gov': { reliability: 94, bias: 'center' },
  'usgs.gov': { reliability: 95, bias: 'center' },
  'reliefweb.int': { reliability: 88, bias: 'center' },

  // State-linked (lower reliability on contested topics)
  'rt.com': { reliability: 30, bias: 'unknown' },
  'sputniknews.com': { reliability: 28, bias: 'unknown' },
  'presstv.ir': { reliability: 30, bias: 'unknown' },
  'globaltimes.cn': { reliability: 35, bias: 'unknown' },
  'xinhuanet.com': { reliability: 45, bias: 'unknown' },
  'chinadaily.com.cn': { reliability: 45, bias: 'unknown' },
  'tass.com': { reliability: 40, bias: 'unknown' },
};

/** Reliability assigned to domains missing from the table. Conservative on purpose. */
export const UNRATED_RELIABILITY = 50;

/**
 * Domains the PreToolUse hook refuses to fetch outright:
 * satire and repeatedly-flagged fabrication mills. Not "low quality" outlets —
 * those are allowed through and simply scored low.
 */
export const BLOCKED_DOMAINS = [
  'theonion.com',
  'babylonbee.com',
  'clickhole.com',
  'worldnewsdailyreport.com',
  'empirenews.net',
  'newspunch.com',
  'yournewswire.com',
  'infowars.com',
  'naturalnews.com',
  'beforeitsnews.com',
];

/** Registrable-ish domain from a hostname: keeps last two labels, three for common ccTLD pairs. */
export function normalizeDomain(hostname: string): string {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  const ccSecondLevel = new Set(['co', 'com', 'net', 'org', 'ac', 'gov', 'or', 'ne']);
  const tld = parts[parts.length - 1];
  const sld = parts[parts.length - 2];
  if (tld.length === 2 && ccSecondLevel.has(sld)) return parts.slice(-3).join('.');
  return parts.slice(-2).join('.');
}

export function rateDomain(domain: string): SourceRating & { unrated: boolean } {
  const normalized = normalizeDomain(domain);
  const known = SOURCE_RATINGS[normalized] ?? SOURCE_RATINGS[domain.toLowerCase()];
  if (known) return { ...known, unrated: false };
  return { reliability: UNRATED_RELIABILITY, bias: 'unknown', unrated: true };
}

export function isBlockedDomain(domain: string): boolean {
  const normalized = normalizeDomain(domain);
  return BLOCKED_DOMAINS.includes(normalized);
}
