import { SOURCE_RATINGS } from './source-ratings.ts';

/**
 * Outlet name -> homepage domain. Verified need from live runs: the
 * synthesizer sometimes cites outlets by name ("Reuters", {"outlet": "BBC"})
 * instead of by URL, and a story whose every source was a bare name used to
 * be dropped outright. The outlet's homepage is a weaker citation than the
 * article, but it still names who reported the story, and its domain carries
 * the reliability and bias rating trust scoring needs.
 *
 * Keys are matched after `nameKey()` normalisation (case, accents,
 * punctuation, spacing and a leading "the" do not matter). Domains are what
 * the homepage URL is built from, so they are real hostnames.
 */
const OUTLET_ALIASES: Record<string, string> = {
  // wires
  reuters: 'reuters.com',
  'thomson reuters': 'reuters.com',
  ap: 'apnews.com',
  'associated press': 'apnews.com',
  'ap news': 'apnews.com',
  afp: 'afp.com',
  'agence france presse': 'afp.com',
  'agence france-presse': 'afp.com',
  upi: 'upi.com',
  'united press international': 'upi.com',
  kyodo: 'english.kyodonews.net',
  'kyodo news': 'english.kyodonews.net',
  xinhua: 'xinhuanet.com',
  'xinhua news agency': 'xinhuanet.com',
  tass: 'tass.com',
  yonhap: 'en.yna.co.kr',
  'yonhap news agency': 'en.yna.co.kr',
  anadolu: 'aa.com.tr',
  'anadolu agency': 'aa.com.tr',
  'anadolu ajansi': 'aa.com.tr',
  bernama: 'bernama.com',
  'press trust of india': 'ptinews.com',
  pti: 'ptinews.com',

  // broadcasters
  bbc: 'bbc.com',
  'bbc news': 'bbc.com',
  'bbc world service': 'bbc.com',
  cnn: 'cnn.com',
  'cnn international': 'cnn.com',
  'al jazeera': 'aljazeera.com',
  'al jazeera english': 'aljazeera.com',
  npr: 'npr.org',
  'national public radio': 'npr.org',
  pbs: 'pbs.org',
  'pbs newshour': 'pbs.org',
  'deutsche welle': 'dw.com',
  dw: 'dw.com',
  'dw news': 'dw.com',
  'france 24': 'france24.com',
  nhk: 'nhk.or.jp',
  'nhk world': 'nhk.or.jp',
  'nhk world japan': 'nhk.or.jp',
  'abc news': 'abcnews.go.com',
  'abc australia': 'abc.net.au',
  'abc news australia': 'abc.net.au',
  'australian broadcasting corporation': 'abc.net.au',
  cbc: 'cbc.ca',
  'cbc news': 'cbc.ca',
  'canadian broadcasting corporation': 'cbc.ca',
  sky: 'news.sky.com',
  'sky news': 'news.sky.com',
  euronews: 'euronews.com',
  cnbc: 'cnbc.com',
  fox: 'foxnews.com',
  'fox news': 'foxnews.com',
  nbc: 'nbcnews.com',
  'nbc news': 'nbcnews.com',
  cbs: 'cbsnews.com',
  'cbs news': 'cbsnews.com',
  msnbc: 'msnbc.com',
  'channel newsasia': 'channelnewsasia.com',
  'channel news asia': 'channelnewsasia.com',
  cna: 'channelnewsasia.com',
  'voice of america': 'voanews.com',
  voa: 'voanews.com',
  'radio free europe': 'rferl.org',
  'radio free europe radio liberty': 'rferl.org',
  rferl: 'rferl.org',
  'rfe rl': 'rferl.org',
  'al arabiya': 'alarabiya.net',
  africanews: 'africanews.com',
  cgtn: 'cgtn.com',
  rt: 'rt.com',
  'press tv': 'presstv.ir',

  // papers & magazines
  'new york times': 'nytimes.com',
  nyt: 'nytimes.com',
  'ny times': 'nytimes.com',
  'washington post': 'washingtonpost.com',
  wapo: 'washingtonpost.com',
  'wall street journal': 'wsj.com',
  wsj: 'wsj.com',
  bloomberg: 'bloomberg.com',
  'bloomberg news': 'bloomberg.com',
  'financial times': 'ft.com',
  ft: 'ft.com',
  economist: 'economist.com',
  guardian: 'theguardian.com',
  'le monde': 'lemonde.fr',
  'le figaro': 'lefigaro.fr',
  'der spiegel': 'spiegel.de',
  spiegel: 'spiegel.de',
  'el pais': 'elpais.com',
  'times of india': 'timesofindia.com',
  hindu: 'thehindu.com',
  dawn: 'dawn.com',
  independent: 'independent.co.uk',
  telegraph: 'telegraph.co.uk',
  'daily telegraph': 'telegraph.co.uk',
  'south china morning post': 'scmp.com',
  scmp: 'scmp.com',
  'nikkei asia': 'asia.nikkei.com',
  'nikkei asian review': 'asia.nikkei.com',
  nikkei: 'asia.nikkei.com',
  haaretz: 'haaretz.com',
  'times of israel': 'timesofisrael.com',
  'jerusalem post': 'jpost.com',
  'kyiv independent': 'kyivindependent.com',
  'kyiv post': 'kyivpost.com',
  'arab news': 'arabnews.com',
  national: 'thenationalnews.com',
  'national news': 'thenationalnews.com',
  'straits times': 'straitstimes.com',
  'japan times': 'japantimes.co.jp',
  'mail and guardian': 'mg.co.za',
  'daily maverick': 'dailymaverick.co.za',
  'premium times': 'premiumtimesng.com',
  'premium times nigeria': 'premiumtimesng.com',
  nation: 'nation.africa',
  'nation kenya': 'nation.africa',
  'daily nation': 'nation.africa',
  'nation africa': 'nation.africa',
  'la times': 'latimes.com',
  'los angeles times': 'latimes.com',
  'usa today': 'usatoday.com',
  politico: 'politico.com',
  'politico europe': 'politico.eu',
  axios: 'axios.com',
  hill: 'thehill.com',
  atlantic: 'theatlantic.com',
  'stat news': 'statnews.com',
  'global times': 'globaltimes.cn',
  'china daily': 'chinadaily.com.cn',
  'gulf news': 'gulfnews.com',
  'daily star': 'thedailystar.net',
  'express tribune': 'tribune.com.pk',

  // UN, agencies, government
  'un news': 'news.un.org',
  un: 'news.un.org',
  'united nations': 'news.un.org',
  who: 'who.int',
  'world health organization': 'who.int',
  unhcr: 'unhcr.org',
  'un refugee agency': 'unhcr.org',
  unicef: 'unicef.org',
  ocha: 'unocha.org',
  'un ocha': 'unocha.org',
  reliefweb: 'reliefweb.int',
  'world food programme': 'wfp.org',
  wfp: 'wfp.org',
  usgs: 'usgs.gov',
  'us geological survey': 'usgs.gov',
  'united states geological survey': 'usgs.gov',
  noaa: 'noaa.gov',
  nws: 'weather.gov',
  'national weather service': 'weather.gov',
  'national hurricane center': 'nhc.noaa.gov',
  nhc: 'nhc.noaa.gov',
  cdc: 'cdc.gov',
  'centers for disease control and prevention': 'cdc.gov',
  fema: 'fema.gov',
  nasa: 'nasa.gov',
  'white house': 'whitehouse.gov',
  'state department': 'state.gov',
  'us state department': 'state.gov',
  'european commission': 'ec.europa.eu',
};

/** Words that may trail an outlet's name without changing which outlet it is. */
const TRAILING_NOISE = /\s+(news(paper)?|news agency|newspaper|online|website|com)$/;

/** Lowercase, strip accents and punctuation, '&' -> 'and', drop a leading "the". */
export function nameKey(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^the\s+/, '');
}

const compact = (key: string) => key.replace(/\s+/g, '');

/** Labels too generic to stand for an outlet on their own. */
const GENERIC_LABELS = new Set(['news', 'en', 'english', 'www', 'edition', 'asia']);

/** compact name -> domain: the alias table, then every rated domain's leading label. */
const RESOLVER: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const domain of Object.keys(SOURCE_RATINGS)) {
    const label = domain.split('.')[0];
    if (GENERIC_LABELS.has(label) || label.length < 3) continue;
    if (!map.has(label)) map.set(label, domain);
  }
  // aliases win over the derived labels
  for (const [name, domain] of Object.entries(OUTLET_ALIASES)) map.set(compact(nameKey(name)), domain);
  return map;
})();

/** How many names the resolver knows (aliases plus rated-domain labels). */
export const OUTLET_RESOLVER_SIZE = RESOLVER.size;
export const OUTLET_ALIAS_COUNT = Object.keys(OUTLET_ALIASES).length;

/** The homepage domain for an outlet name, or undefined if it is not one we know. */
export function resolveOutletName(name: string): string | undefined {
  const key = nameKey(name);
  if (!key || key.length > 60) return undefined;
  const direct = RESOLVER.get(compact(key));
  if (direct) return direct;
  const stripped = key.replace(TRAILING_NOISE, '');
  if (stripped !== key && stripped) return RESOLVER.get(compact(stripped));
  return undefined;
}
