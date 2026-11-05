/**
 * World areas: the geographic beats the worldwide desk's explorers cover,
 * and the unit coverage balance is measured in. Shared so the pipeline (which
 * balances and health-checks a run by area) and anything reading the dataset
 * agree on where a country belongs.
 *
 * Finer than the frontend's region views on purpose: "Africa & Middle East"
 * as one bucket is exactly how sub-Saharan Africa used to vanish from the map.
 * Dependency-free, like news.ts.
 */

export const AREA_IDS = [
  'north-america',
  'latin-america',
  'europe',
  'mena',
  'sub-saharan-africa',
  'south-central-asia',
  'east-asia-oceania',
] as const;

export type AreaId = (typeof AREA_IDS)[number];

export const AREA_LABELS: Record<AreaId, string> = {
  'north-america': 'North America',
  'latin-america': 'Latin America & Caribbean',
  europe: 'Europe',
  mena: 'Middle East & North Africa',
  'sub-saharan-africa': 'Sub-Saharan Africa',
  'south-central-asia': 'South & Central Asia',
  'east-asia-oceania': 'East & Southeast Asia, Oceania',
};

const COUNTRIES: Record<AreaId, string> = {
  'north-america': 'US CA PR GU VI AS MP BM GL PM',
  'latin-america':
    'AG AI AR AW BB BL BO BQ BR BS BZ CL CO CR CU CW DM DO EC FK GD GF GP GT GY HN HT JM KN KY LC MF MQ MS MX NI PA PE PY SR SV SX TC TT UY VC VE VG',
  europe:
    'AD AL AT AX BA BE BG BY CH CY CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ SK SM UA VA XK',
  mena: 'AE AM AZ BH DZ EG EH GE IL IQ IR JO KW LB LY MA OM PS QA SA SY TN TR YE',
  'sub-saharan-africa':
    'AO BF BI BJ BW CD CF CG CI CM CV DJ ER ET GA GH GM GN GQ GW KE KM LR LS MG ML MR MU MW MZ NA NE NG RE RW SC SD SH SL SN SO SS ST SZ TD TG TZ UG YT ZA ZM ZW',
  'south-central-asia': 'AF BD BT IN KG KZ LK MV NP PK TJ TM UZ',
  'east-asia-oceania':
    'AU BN CK CN FJ FM HK ID JP KH KI KP KR LA MH MM MN MO MY NC NF NR NU NZ PF PG PH PN PW SB SG TH TK TL TO TV TW VN VU WF WS',
};

export const COUNTRY_AREA: Readonly<Record<string, AreaId>> = Object.freeze(
  Object.fromEntries(
    (Object.entries(COUNTRIES) as [AreaId, string][]).flatMap(([area, codes]) =>
      codes.split(' ').map((code) => [code, area] as const),
    ),
  ),
);

/** Coarse boxes for stories with no usable country ('XX': at sea, multi-country). */
export function areaFromLatLon(lat: number, lon: number): AreaId {
  if (lon < -25 || lon > 170) {
    if (lon > 170 || lon < -150) return 'east-asia-oceania';
    return lat > 23 ? 'north-america' : 'latin-america';
  }
  if (lat >= 35 && lon < 45) return 'europe';
  if (lat >= 50) return 'europe';
  if (lon < 63 && lat > 12) return 'mena';
  if (lon < 52 && lat > -40) return 'sub-saharan-africa';
  if (lon < 92 && lat > 0) return 'south-central-asia';
  return 'east-asia-oceania';
}

/** The area a story is in: by country code, else by coordinates. */
export function areaOf(event: { countryCode?: string; lat: number; lon: number }): AreaId {
  return COUNTRY_AREA[(event.countryCode ?? '').toUpperCase()] ?? areaFromLatLon(event.lat, event.lon);
}
