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
  'nikkei.com': { reliability: 85, bias: 'center' },
  'lefigaro.fr': { reliability: 78, bias: 'center-right' },
  'welt.de': { reliability: 76, bias: 'center-right' },
  'nypost.com': { reliability: 58, bias: 'right' },
  'washingtontimes.com': { reliability: 58, bias: 'right' },
  'washingtonexaminer.com': { reliability: 60, bias: 'center-right' },
  'nationalreview.com': { reliability: 66, bias: 'right' },
  'reason.com': { reliability: 70, bias: 'center-right' },
  'semafor.com': { reliability: 78, bias: 'center' },
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
  'abcnews.com': { reliability: 82, bias: 'center' },
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

  // Regional outlets frequently seen in live runs
  'wionews.com': { reliability: 65, bias: 'center' },
  'focustaiwan.tw': { reliability: 75, bias: 'center' },
  'taipeitimes.com': { reliability: 72, bias: 'center' },
  'inquirer.net': { reliability: 72, bias: 'center' },
  'japantoday.com': { reliability: 70, bias: 'center' },
  'gulfnews.com': { reliability: 66, bias: 'center' },
  'arabnews.com': { reliability: 64, bias: 'center' },
  'jpost.com': { reliability: 72, bias: 'center-right' },
  'foreignpolicy.com': { reliability: 80, bias: 'center' },
  'usnews.com': { reliability: 75, bias: 'center' },
  'yahoo.com': { reliability: 60, bias: 'center' },
  'news.yahoo.com': { reliability: 60, bias: 'center' },
  'caixinglobal.com': { reliability: 74, bias: 'center' },
  'bernama.com': { reliability: 68, bias: 'center' },
  'thedailystar.net': { reliability: 70, bias: 'center' },
  'tribune.com.pk': { reliability: 68, bias: 'center' },

  // Regional outlets the agents cite most (from `npm run report-unrated`).
  // Conservative heuristic starting points, like the rest of the table:
  // established newsrooms with their own reporting in the 65-80 band.

  // Latin America & Caribbean
  'infobae.com': { reliability: 70, bias: 'center' },
  'riotimesonline.com': { reliability: 55, bias: 'center' },
  'mexiconewsdaily.com': { reliability: 70, bias: 'center' },
  'batimes.com.ar': { reliability: 72, bias: 'center' },
  'mercopress.com': { reliability: 68, bias: 'center' },
  'elcomercio.pe': { reliability: 72, bias: 'center-right' },
  'elfinanciero.com.mx': { reliability: 74, bias: 'center' },
  'elcolombiano.com': { reliability: 70, bias: 'center-right' },
  'semana.com': { reliability: 62, bias: 'right' },
  'jamaicaobserver.com': { reliability: 70, bias: 'center' },
  'haitiantimes.com': { reliability: 72, bias: 'center' },
  'latintimes.com': { reliability: 60, bias: 'center' },
  'colombiaone.com': { reliability: 58, bias: 'center' },
  'prensa-latina.cu': { reliability: 35, bias: 'unknown' },

  // Sub-Saharan Africa
  'africanews.com': { reliability: 75, bias: 'center' },
  'allafrica.com': { reliability: 65, bias: 'center' },
  'vanguardngr.com': { reliability: 65, bias: 'center' },
  'premiumtimesng.com': { reliability: 74, bias: 'center' },
  'news24.com': { reliability: 74, bias: 'center' },
  'timeslive.co.za': { reliability: 72, bias: 'center' },
  'dailymaverick.co.za': { reliability: 78, bias: 'center-left' },
  'mg.co.za': { reliability: 74, bias: 'center-left' },
  'iol.co.za': { reliability: 66, bias: 'center' },
  'sudantribune.com': { reliability: 66, bias: 'center' },
  'radiotamazuj.org': { reliability: 70, bias: 'center' },
  'addisstandard.com': { reliability: 70, bias: 'center' },
  'nation.africa': { reliability: 74, bias: 'center' },
  'theeastafrican.co.ke': { reliability: 74, bias: 'center' },

  // Middle East & North Africa
  'thenationalnews.com': { reliability: 70, bias: 'center' },
  'middleeasteye.net': { reliability: 62, bias: 'center-left' },
  'alarabiya.net': { reliability: 62, bias: 'center-right' },
  'aawsat.com': { reliability: 62, bias: 'center-right' },
  'newarab.com': { reliability: 62, bias: 'center-left' },
  'al-monitor.com': { reliability: 76, bias: 'center' },
  'naharnet.com': { reliability: 66, bias: 'center' },
  'ahram.org.eg': { reliability: 50, bias: 'unknown' },
  'dailynewsegypt.com': { reliability: 60, bias: 'center' },
  'moroccoworldnews.com': { reliability: 60, bias: 'center' },
  'enabbaladi.net': { reliability: 66, bias: 'center' },
  'aa.com.tr': { reliability: 55, bias: 'unknown' },
  'dailysabah.com': { reliability: 45, bias: 'right' },
  'armenpress.am': { reliability: 55, bias: 'unknown' },

  // Europe, Ukraine & Russia
  'kyivindependent.com': { reliability: 76, bias: 'center' },
  'kyivpost.com': { reliability: 72, bias: 'center' },
  'pravda.com.ua': { reliability: 72, bias: 'center' },
  'ukrinform.net': { reliability: 60, bias: 'unknown' },
  'interfax.com.ua': { reliability: 72, bias: 'center' },
  'eurointegration.com.ua': { reliability: 70, bias: 'center' },
  'rbc.ua': { reliability: 66, bias: 'center' },
  'euromaidanpress.com': { reliability: 58, bias: 'center' },
  'united24media.com': { reliability: 50, bias: 'unknown' },
  'themoscowtimes.com': { reliability: 74, bias: 'center' },
  'meduza.io': { reliability: 74, bias: 'center' },
  'rferl.org': { reliability: 78, bias: 'center' },
  'balkaninsight.com': { reliability: 80, bias: 'center' },
  'notesfrompoland.com': { reliability: 74, bias: 'center' },
  'tvpworld.com': { reliability: 55, bias: 'unknown' },
  'irishtimes.com': { reliability: 84, bias: 'center' },
  'rte.ie': { reliability: 85, bias: 'center' },
  'itv.com': { reliability: 82, bias: 'center' },
  'thelocal.fr': { reliability: 70, bias: 'center' },
  'theolivepress.es': { reliability: 55, bias: 'center' },
  'cphpost.dk': { reliability: 66, bias: 'center' },
  'greekreporter.com': { reliability: 58, bias: 'center' },
  'ilsole24ore.com': { reliability: 82, bias: 'center' },
  'internazionale.it': { reliability: 76, bias: 'center-left' },

  // South & Central Asia
  'dawn.com': { reliability: 78, bias: 'center' },
  'theprint.in': { reliability: 72, bias: 'center' },
  'business-standard.com': { reliability: 76, bias: 'center' },
  'theweek.in': { reliability: 70, bias: 'center' },
  'etvbharat.com': { reliability: 62, bias: 'center' },
  'brecorder.com': { reliability: 70, bias: 'center' },
  'dhakatribune.com': { reliability: 68, bias: 'center' },
  'tbsnews.net': { reliability: 70, bias: 'center' },

  // East & Southeast Asia, Oceania
  'news.cn': { reliability: 45, bias: 'unknown' },
  'hongkongfp.com': { reliability: 76, bias: 'center' },
  'thestar.com.my': { reliability: 70, bias: 'center' },
  'malaymail.com': { reliability: 70, bias: 'center' },
  'philstar.com': { reliability: 70, bias: 'center' },
  'manilatimes.net': { reliability: 62, bias: 'center' },
  'rappler.com': { reliability: 76, bias: 'center-left' },
  'bworldonline.com': { reliability: 72, bias: 'center' },
  'thejakartapost.com': { reliability: 76, bias: 'center' },
  'jakartaglobe.id': { reliability: 68, bias: 'center' },
  'antaranews.com': { reliability: 55, bias: 'unknown' },
  'nationthailand.com': { reliability: 66, bias: 'center' },
  'khaosodenglish.com': { reliability: 70, bias: 'center' },
  'irrawaddy.com': { reliability: 74, bias: 'center' },
  'myanmar-now.org': { reliability: 72, bias: 'center' },
  'dvb.no': { reliability: 70, bias: 'center' },
  'koreaherald.com': { reliability: 76, bias: 'center' },
  'koreajoongangdaily.com': { reliability: 76, bias: 'center-right' },
  'koreatimes.co.kr': { reliability: 72, bias: 'center' },
  'asiaone.com': { reliability: 64, bias: 'center' },
  'mothership.sg': { reliability: 62, bias: 'center' },
  'rfa.org': { reliability: 74, bias: 'center' },
  'thediplomat.com': { reliability: 80, bias: 'center' },
  'sbs.com.au': { reliability: 84, bias: 'center' },
  'rnz.co.nz': { reliability: 86, bias: 'center' },
  'stuff.co.nz': { reliability: 76, bias: 'center' },

  // North America: Canada and US local/public outlets
  'theglobeandmail.com': { reliability: 84, bias: 'center' },
  'ctvnews.ca': { reliability: 80, bias: 'center' },
  'globalnews.ca': { reliability: 76, bias: 'center' },
  'cp24.com': { reliability: 72, bias: 'center' },
  'bostonglobe.com': { reliability: 82, bias: 'center-left' },
  'suntimes.com': { reliability: 76, bias: 'center-left' },
  'adn.com': { reliability: 78, bias: 'center' },
  'alaskapublic.org': { reliability: 82, bias: 'center' },
  'cpr.org': { reliability: 80, bias: 'center' },
  'coloradosun.com': { reliability: 80, bias: 'center' },
  'sltrib.com': { reliability: 78, bias: 'center' },
  'wtop.com': { reliability: 76, bias: 'center' },
  'ny1.com': { reliability: 74, bias: 'center' },
  'courthousenews.com': { reliability: 82, bias: 'center' },
  'ohiocapitaljournal.com': { reliability: 72, bias: 'center-left' },
  'tennesseelookout.com': { reliability: 72, bias: 'center-left' },
  'stripes.com': { reliability: 80, bias: 'center' },
  'usni.org': { reliability: 82, bias: 'center' },
  'gcaptain.com': { reliability: 76, bias: 'center' },

  // Research, rights groups & data (factual, not news desks)
  'paho.org': { reliability: 88, bias: 'center' },
  'umn.edu': { reliability: 80, bias: 'center' },
  'phys.org': { reliability: 74, bias: 'center' },
  'amnesty.org': { reliability: 74, bias: 'center-left' },
  'cpj.org': { reliability: 78, bias: 'center' },
  'securitycouncilreport.org': { reliability: 84, bias: 'center' },
  'criticalthreats.org': { reliability: 68, bias: 'center-right' },
  'longwarjournal.org': { reliability: 66, bias: 'center-right' },
  'tradingeconomics.com': { reliability: 72, bias: 'center' },
  'investing.com': { reliability: 66, bias: 'center' },
  'tradingview.com': { reliability: 60, bias: 'center' },
  'wikipedia.org': { reliability: 55, bias: 'center' },

  // State-linked (lower reliability on contested topics)
  'theepochtimes.com': { reliability: 32, bias: 'right' },
  'cgtn.com': { reliability: 38, bias: 'unknown' },
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
  // Government / intergovernmental primary sources: high factual reliability
  // even when the specific agency isn't in the table (verified need in live
  // runs: weather.gov, usgs feeds, EU bodies, etc. kept coming back unrated).
  if (/\.(gov|mil)$/.test(normalized) || /\.(gov|gob|gouv|go)\.[a-z]{2}$/.test(normalized)) {
    return { reliability: 85, bias: 'center', unrated: false };
  }
  if (/\.int$/.test(normalized) || /\.europa\.eu$/.test(domain.toLowerCase())) {
    return { reliability: 85, bias: 'center', unrated: false };
  }
  return { reliability: UNRATED_RELIABILITY, bias: 'unknown', unrated: true };
}

export function isBlockedDomain(domain: string): boolean {
  const normalized = normalizeDomain(domain);
  return BLOCKED_DOMAINS.includes(normalized);
}
