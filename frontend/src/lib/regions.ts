import { scopeOf, type NewsEvent } from '../../../shared/news';

/**
 * Region views. A region is a camera framing plus a list filter; the globe
 * keeps drawing every story (out-of-region dots are only dimmed), so you can
 * always see what is happening next door.
 *
 * "US" is the US & state run's territory: a story belongs there when its run
 * scope is 'us' or it happens in the United States. "Americas" is the rest of
 * the hemisphere.
 */

export const REGION_IDS = ['world', 'us', 'europe', 'asia', 'africa-me', 'americas'] as const;
export type RegionId = (typeof REGION_IDS)[number];

export interface RegionView {
  label: string;
  /** Where the camera looks (the point that ends up facing the viewer). */
  lat: number;
  lon: number;
  /** Camera distance as a multiple of the framed whole-globe distance. */
  zoom: number;
}

export const REGIONS: Record<RegionId, RegionView> = {
  world: { label: 'World', lat: 12, lon: -75, zoom: 1 },
  us: { label: 'US', lat: 38.5, lon: -97, zoom: 0.7 },
  europe: { label: 'Europe', lat: 50, lon: 14, zoom: 0.7 },
  asia: { label: 'Asia-Pacific', lat: 22, lon: 108, zoom: 0.8 },
  'africa-me': { label: 'Africa & Middle East', lat: 12, lon: 28, zoom: 0.74 },
  americas: { label: 'Americas', lat: -6, lon: -68, zoom: 0.78 },
};

export function isRegionId(value: unknown): value is RegionId {
  return typeof value === 'string' && (REGION_IDS as readonly string[]).includes(value);
}

const EUROPE =
  'AD AL AM AT AZ BA BE BG BY CH CY CZ DE DK EE ES FI FO FR GB GE GG GI GL GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SK SM TR UA VA XK';
const ASIA =
  'AF AU BD BN BT CN FJ FM HK ID IN JP KG KH KI KP KR KZ LA LK MH MM MN MO MV MY NC NP NR NZ PF PG PH PK PW SB SG TH TJ TL TM TO TV TW UZ VN VU WS';
const AFRICA_ME =
  'AE AO BF BH BI BJ BW CD CF CG CI CM CV DJ DZ EG EH ER ET GA GH GM GN GQ GW IL IQ IR JO KE KM KW LB LR LS LY MA MG ML MR MU MW MZ NA NE NG OM PS QA RE RW SA SC SD SH SL SN SO SS ST SY SZ TD TG TN TZ UG YE YT ZA ZM ZW';
const AMERICAS =
  'AG AI AR AW BB BM BO BR BS BZ CA CL CO CR CU CW DM DO EC FK GD GF GP GT GY HN HT JM KN KY LC MQ MX NI PA PE PY SR SV TC TT UY VC VE VG';

/** ISO 3166-1 alpha-2 → region. The US and its territories are 'us'. */
export const COUNTRY_REGION: Readonly<Record<string, Exclude<RegionId, 'world'>>> = Object.freeze({
  ...Object.fromEntries(EUROPE.split(' ').map((c) => [c, 'europe' as const])),
  ...Object.fromEntries(ASIA.split(' ').map((c) => [c, 'asia' as const])),
  ...Object.fromEntries(AFRICA_ME.split(' ').map((c) => [c, 'africa-me' as const])),
  ...Object.fromEntries(AMERICAS.split(' ').map((c) => [c, 'americas' as const])),
  US: 'us',
  PR: 'us',
  GU: 'us',
  VI: 'us',
  AS: 'us',
  MP: 'us',
});

/**
 * Coarse continent boxes for stories with no usable country ('XX': at sea,
 * multi-country). Never answers 'us': that view is about where the US run
 * and US datelines put a story, not about a box drawn on the ocean.
 */
export function regionFromLatLon(lat: number, lon: number): Exclude<RegionId, 'world' | 'us'> {
  if (lon < -25 || lon > 170) return lon > 170 || lon < -150 ? 'asia' : 'americas';
  if (lat >= 35 && lon < 45) return 'europe';
  if (lat >= 50) return 'europe'; // Russia east of the Urals
  if (lon < 63 && lat > -40) return 'africa-me';
  return 'asia';
}

/** The one region a story is listed under. */
export function regionOf(event: Pick<NewsEvent, 'countryCode' | 'lat' | 'lon' | 'scope'>): Exclude<RegionId, 'world'> {
  if (scopeOf(event) === 'us') return 'us';
  const code = (event.countryCode ?? '').toUpperCase();
  return COUNTRY_REGION[code] ?? regionFromLatLon(event.lat, event.lon);
}

export function inRegion(event: Pick<NewsEvent, 'countryCode' | 'lat' | 'lon' | 'scope'>, region: RegionId): boolean {
  return region === 'world' || regionOf(event) === region;
}

export const US_STATES: Readonly<Record<string, string>> = Object.freeze({
  'US-AL': 'Alabama', 'US-AK': 'Alaska', 'US-AZ': 'Arizona', 'US-AR': 'Arkansas', 'US-CA': 'California',
  'US-CO': 'Colorado', 'US-CT': 'Connecticut', 'US-DE': 'Delaware', 'US-DC': 'District of Columbia',
  'US-FL': 'Florida', 'US-GA': 'Georgia', 'US-HI': 'Hawaii', 'US-ID': 'Idaho', 'US-IL': 'Illinois',
  'US-IN': 'Indiana', 'US-IA': 'Iowa', 'US-KS': 'Kansas', 'US-KY': 'Kentucky', 'US-LA': 'Louisiana',
  'US-ME': 'Maine', 'US-MD': 'Maryland', 'US-MA': 'Massachusetts', 'US-MI': 'Michigan', 'US-MN': 'Minnesota',
  'US-MS': 'Mississippi', 'US-MO': 'Missouri', 'US-MT': 'Montana', 'US-NE': 'Nebraska', 'US-NV': 'Nevada',
  'US-NH': 'New Hampshire', 'US-NJ': 'New Jersey', 'US-NM': 'New Mexico', 'US-NY': 'New York',
  'US-NC': 'North Carolina', 'US-ND': 'North Dakota', 'US-OH': 'Ohio', 'US-OK': 'Oklahoma', 'US-OR': 'Oregon',
  'US-PA': 'Pennsylvania', 'US-RI': 'Rhode Island', 'US-SC': 'South Carolina', 'US-SD': 'South Dakota',
  'US-TN': 'Tennessee', 'US-TX': 'Texas', 'US-UT': 'Utah', 'US-VT': 'Vermont', 'US-VA': 'Virginia',
  'US-WA': 'Washington', 'US-WV': 'West Virginia', 'US-WI': 'Wisconsin', 'US-WY': 'Wyoming',
  'US-PR': 'Puerto Rico',
});

export const NATIONAL_GROUP = 'National / other';

export interface StateGroup<E> {
  /** The ISO 3166-2 code, or '' for the national / other group. */
  code: string;
  label: string;
  events: E[];
}

/**
 * The US view's sections: one per state, busiest first (ties alphabetical),
 * with stories that have no recognised state under "National / other" at the
 * end. Story order inside a section is kept as given.
 */
export function groupByState<E extends Pick<NewsEvent, 'subdivision'>>(events: readonly E[]): StateGroup<E>[] {
  const groups = new Map<string, E[]>();
  for (const event of events) {
    const code = (event.subdivision ?? '').toUpperCase();
    const key = US_STATES[code] ? code : '';
    const list = groups.get(key);
    if (list) list.push(event);
    else groups.set(key, [event]);
  }
  const states = [...groups.entries()]
    .filter(([code]) => code !== '')
    .map(([code, list]) => ({ code, label: US_STATES[code], events: list }))
    .sort((a, b) => b.events.length - a.events.length || a.label.localeCompare(b.label));
  const national = groups.get('');
  return national ? [...states, { code: '', label: NATIONAL_GROUP, events: national }] : states;
}
