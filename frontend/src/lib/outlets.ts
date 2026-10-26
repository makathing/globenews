import { hashString } from './illustration';

/** Display names for outlets whose domain doesn't title-case into their name. */
const OUTLET_NAMES: Record<string, string> = {
  'aljazeera.com': 'Al Jazeera',
  'usnews.com': 'US News',
  'euronews.com': 'Euronews',
  'washingtonpost.com': 'Washington Post',
  'cnn.com': 'CNN',
  'bloomberg.com': 'Bloomberg',
  'cnbc.com': 'CNBC',
  'yahoo.com': 'Yahoo',
  'nbcnews.com': 'NBC News',
  'pbs.org': 'PBS',
  'un.org': 'UN',
  'france24.com': 'France 24',
  'washingtontimes.com': 'Washington Times',
  'jpost.com': 'Jerusalem Post',
  'upi.com': 'UPI',
  'cbsnews.com': 'CBS News',
  'abcnews.com': 'ABC News',
  'abcnews.go.com': 'ABC News',
  'go.com': 'ABC News',
  'thehill.com': 'The Hill',
  'alarabiya.net': 'Al Arabiya',
  'npr.org': 'NPR',
  'riotimesonline.com': 'Rio Times',
  'africanews.com': 'Africanews',
  'gulfnews.com': 'Gulf News',
  'arabnews.com': 'Arab News',
  'al-monitor.com': 'Al-Monitor',
  'japantimes.co.jp': 'Japan Times',
  'axios.com': 'Axios',
  'abc.net.au': 'ABC Australia',
  'allafrica.com': 'AllAfrica',
  'timesofisrael.com': 'Times of Israel',
  'kyivpost.com': 'Kyiv Post',
  'kyivindependent.com': 'Kyiv Independent',
  'thenationalnews.com': 'The National',
  'aa.com.tr': 'Anadolu',
  'newsweek.com': 'Newsweek',
  'cbc.ca': 'CBC',
  'apnews.com': 'AP',
  'reuters.com': 'Reuters',
  'bbc.com': 'BBC',
  'bbc.co.uk': 'BBC',
  'theguardian.com': 'The Guardian',
  'nytimes.com': 'New York Times',
  'wsj.com': 'WSJ',
  'ft.com': 'Financial Times',
  'foxnews.com': 'Fox News',
  'dw.com': 'DW',
  'who.int': 'WHO',
  'noaa.gov': 'NOAA',
  'state.gov': 'US State Dept',
  'rferl.org': 'RFE/RL',
  'scmp.com': 'SCMP',
  'news.cn': 'Xinhua',
  'haaretz.com': 'Haaretz',
  'thedailystar.net': 'Daily Star',
  'koreaherald.com': 'Korea Herald',
  'koreatimes.co.kr': 'Korea Times',
  'themoscowtimes.com': 'Moscow Times',
  'thediplomat.com': 'The Diplomat',
  'theprint.in': 'ThePrint',
  'sabcnews.com': 'SABC News',
  'paho.org': 'PAHO',
  'usgs.gov': 'USGS',
  'rte.ie': 'RTÉ',
  'sbs.com.au': 'SBS',
};

/** Second-level suffixes that are not the outlet's name: "japantimes.co.jp" → "japantimes". */
const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'gov', 'ac', 'edu', 'or', 'ne', 'go']);

function bareDomain(domain: string): string {
  return domain.toLowerCase().replace(/^www\./, '');
}

/** "aljazeera.com" → "Al Jazeera"; an unknown "riotimes.com.br" → "Riotimes". */
export function outletName(domain: string): string {
  const bare = bareDomain(domain);
  if (OUTLET_NAMES[bare]) return OUTLET_NAMES[bare];
  const parts = bare.split('.');
  // drop the TLD, and a second-level suffix like .co.uk / .com.au
  parts.pop();
  if (parts.length > 1 && SECOND_LEVEL.has(parts[parts.length - 1])) parts.pop();
  const name = parts[parts.length - 1] ?? bare;
  if (name.length <= 3) return name.toUpperCase();
  return name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * One or two letters for a logo-less outlet — all a 16px circle can hold
 * legibly: "Al Jazeera" → "AJ", "Bloomberg" → "B", "CBS News" → "CB".
 */
export function outletInitials(domain: string): string {
  const name = outletName(domain);
  const words = name.split(/[\s/-]+/).filter((word) => /^[\p{L}\d]/u.test(word));
  const first = words[0] ?? '?';
  // an acronym is its own monogram: "CBS News", "NPR", "UN"
  if (/^[A-Z\d]{2,}$/.test(first)) return first.slice(0, 2);
  if (words.length >= 2) return (first[0] + words[1][0]).toUpperCase();
  return first[0].toUpperCase();
}

/** A stable hue per outlet, so a monogram keeps its colour everywhere it appears. */
export function outletHue(domain: string): number {
  return hashString(bareDomain(domain)) % 360;
}
