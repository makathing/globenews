export interface Place {
  lat: number;
  lon: number;
  cc: string;
  /** ISO 3166-2 subdivision (US places only, e.g. 'US-TX'). */
  sub?: string;
  /** Degrees the model's coordinates may sit from this point before they get snapped. */
  tol?: number;
  /** What the name denotes; decides how a later part of a place name constrains an earlier one. */
  kind?: 'country' | 'state' | 'city';
}

/**
 * Compact offline gazetteer (no geocoding API): countries + major cities.
 * Used to validate/snap agent-supplied coordinates — if the synthesizer's
 * lat/lon is >8° from a matching place name, we trust the gazetteer.
 */
export const GAZETTEER: Record<string, Place> = {
  // ——— Countries (centroid-ish points) ———
  'united states': { lat: 39.8, lon: -98.6, cc: 'US', kind: 'country' },
  usa: { lat: 39.8, lon: -98.6, cc: 'US', kind: 'country' },
  us: { lat: 39.8, lon: -98.6, cc: 'US', kind: 'country' },
  'u.s.': { lat: 39.8, lon: -98.6, cc: 'US', kind: 'country' },
  'u.s.a.': { lat: 39.8, lon: -98.6, cc: 'US', kind: 'country' },
  'united states of america': { lat: 39.8, lon: -98.6, cc: 'US', kind: 'country' },
  canada: { lat: 56.1, lon: -106.3, cc: 'CA', kind: 'country' },
  mexico: { lat: 23.6, lon: -102.5, cc: 'MX', kind: 'country' },
  brazil: { lat: -14.2, lon: -51.9, cc: 'BR', kind: 'country' },
  argentina: { lat: -38.4, lon: -63.6, cc: 'AR', kind: 'country' },
  chile: { lat: -35.7, lon: -71.5, cc: 'CL', kind: 'country' },
  colombia: { lat: 4.6, lon: -74.3, cc: 'CO', kind: 'country' },
  peru: { lat: -9.2, lon: -75.0, cc: 'PE', kind: 'country' },
  venezuela: { lat: 6.4, lon: -66.6, cc: 'VE', kind: 'country' },
  cuba: { lat: 21.5, lon: -77.8, cc: 'CU', kind: 'country' },
  haiti: { lat: 18.97, lon: -72.3, cc: 'HT', kind: 'country' },
  'united kingdom': { lat: 54.0, lon: -2.5, cc: 'GB', kind: 'country' },
  uk: { lat: 54.0, lon: -2.5, cc: 'GB', kind: 'country' },
  france: { lat: 46.6, lon: 2.4, cc: 'FR', kind: 'country' },
  germany: { lat: 51.2, lon: 10.4, cc: 'DE', kind: 'country' },
  italy: { lat: 42.8, lon: 12.6, cc: 'IT', kind: 'country' },
  spain: { lat: 40.3, lon: -3.7, cc: 'ES', kind: 'country' },
  portugal: { lat: 39.6, lon: -8.0, cc: 'PT', kind: 'country' },
  netherlands: { lat: 52.2, lon: 5.5, cc: 'NL', kind: 'country' },
  belgium: { lat: 50.6, lon: 4.5, cc: 'BE', kind: 'country' },
  switzerland: { lat: 46.8, lon: 8.2, cc: 'CH', kind: 'country' },
  austria: { lat: 47.6, lon: 14.1, cc: 'AT', kind: 'country' },
  poland: { lat: 52.0, lon: 19.3, cc: 'PL', kind: 'country' },
  ukraine: { lat: 48.4, lon: 31.2, cc: 'UA', kind: 'country' },
  russia: { lat: 60.0, lon: 90.0, cc: 'RU', kind: 'country' },
  sweden: { lat: 62.0, lon: 15.0, cc: 'SE', kind: 'country' },
  norway: { lat: 61.0, lon: 8.8, cc: 'NO', kind: 'country' },
  finland: { lat: 64.0, lon: 26.0, cc: 'FI', kind: 'country' },
  denmark: { lat: 56.1, lon: 9.5, cc: 'DK', kind: 'country' },
  greece: { lat: 39.1, lon: 22.9, cc: 'GR', kind: 'country' },
  turkey: { lat: 39.0, lon: 35.2, cc: 'TR', kind: 'country' },
  israel: { lat: 31.4, lon: 35.0, cc: 'IL', kind: 'country' },
  palestine: { lat: 31.9, lon: 35.2, cc: 'PS', kind: 'country' },
  gaza: { lat: 31.4, lon: 34.4, cc: 'PS', kind: 'country' },
  lebanon: { lat: 33.9, lon: 35.9, cc: 'LB', kind: 'country' },
  syria: { lat: 35.0, lon: 38.5, cc: 'SY', kind: 'country' },
  iraq: { lat: 33.2, lon: 43.7, cc: 'IQ', kind: 'country' },
  iran: { lat: 32.4, lon: 53.7, cc: 'IR', kind: 'country' },
  'saudi arabia': { lat: 24.0, lon: 45.0, cc: 'SA', kind: 'country' },
  yemen: { lat: 15.6, lon: 48.0, cc: 'YE', kind: 'country' },
  jordan: { lat: 31.3, lon: 36.5, cc: 'JO', kind: 'country' },
  egypt: { lat: 26.8, lon: 30.8, cc: 'EG', kind: 'country' },
  libya: { lat: 26.9, lon: 17.2, cc: 'LY', kind: 'country' },
  tunisia: { lat: 34.0, lon: 9.5, cc: 'TN', kind: 'country' },
  algeria: { lat: 28.0, lon: 1.7, cc: 'DZ', kind: 'country' },
  morocco: { lat: 31.8, lon: -7.1, cc: 'MA', kind: 'country' },
  sudan: { lat: 15.6, lon: 30.2, cc: 'SD', kind: 'country' },
  ethiopia: { lat: 9.1, lon: 40.5, cc: 'ET', kind: 'country' },
  somalia: { lat: 5.2, lon: 46.2, cc: 'SO', kind: 'country' },
  kenya: { lat: 0.0, lon: 37.9, cc: 'KE', kind: 'country' },
  nigeria: { lat: 9.1, lon: 8.7, cc: 'NG', kind: 'country' },
  ghana: { lat: 7.9, lon: -1.0, cc: 'GH', kind: 'country' },
  'south africa': { lat: -30.6, lon: 22.9, cc: 'ZA', kind: 'country' },
  'democratic republic of the congo': { lat: -2.9, lon: 23.7, cc: 'CD', kind: 'country' },
  drc: { lat: -2.9, lon: 23.7, cc: 'CD', kind: 'country' },
  mali: { lat: 17.6, lon: -4.0, cc: 'ML', kind: 'country' },
  niger: { lat: 17.6, lon: 8.1, cc: 'NE', kind: 'country' },
  china: { lat: 35.9, lon: 104.2, cc: 'CN', kind: 'country' },
  india: { lat: 21.0, lon: 78.0, cc: 'IN', kind: 'country' },
  pakistan: { lat: 30.4, lon: 69.3, cc: 'PK', kind: 'country' },
  afghanistan: { lat: 33.9, lon: 67.7, cc: 'AF', kind: 'country' },
  bangladesh: { lat: 23.7, lon: 90.4, cc: 'BD', kind: 'country' },
  myanmar: { lat: 21.9, lon: 95.9, cc: 'MM', kind: 'country' },
  thailand: { lat: 15.9, lon: 100.9, cc: 'TH', kind: 'country' },
  vietnam: { lat: 14.1, lon: 108.3, cc: 'VN', kind: 'country' },
  philippines: { lat: 12.9, lon: 121.8, cc: 'PH', kind: 'country' },
  indonesia: { lat: -0.8, lon: 113.9, cc: 'ID', kind: 'country' },
  malaysia: { lat: 4.2, lon: 102.0, cc: 'MY', kind: 'country' },
  singapore: { lat: 1.35, lon: 103.82, cc: 'SG', kind: 'country' },
  japan: { lat: 36.2, lon: 138.3, cc: 'JP', kind: 'country' },
  'south korea': { lat: 36.5, lon: 127.9, cc: 'KR', kind: 'country' },
  'north korea': { lat: 40.3, lon: 127.5, cc: 'KP', kind: 'country' },
  taiwan: { lat: 23.7, lon: 121.0, cc: 'TW', kind: 'country' },
  australia: { lat: -25.3, lon: 133.8, cc: 'AU', kind: 'country' },
  'new zealand': { lat: -41.8, lon: 172.8, cc: 'NZ', kind: 'country' },
  // shares its name with a US state; the rest of the place name decides
  georgia: { lat: 42.3, lon: 43.4, cc: 'GE', kind: 'country' },

  // ——— Major cities ———
  // US cities, states and DC live in US_STATES / US_CITIES below
  toronto: { lat: 43.65, lon: -79.38, cc: 'CA' },
  ottawa: { lat: 45.42, lon: -75.7, cc: 'CA' },
  'mexico city': { lat: 19.43, lon: -99.13, cc: 'MX' },
  'sao paulo': { lat: -23.55, lon: -46.63, cc: 'BR' },
  'são paulo': { lat: -23.55, lon: -46.63, cc: 'BR' },
  brasilia: { lat: -15.79, lon: -47.88, cc: 'BR' },
  'rio de janeiro': { lat: -22.91, lon: -43.17, cc: 'BR' },
  'buenos aires': { lat: -34.6, lon: -58.38, cc: 'AR' },
  santiago: { lat: -33.45, lon: -70.67, cc: 'CL' },
  bogota: { lat: 4.71, lon: -74.07, cc: 'CO' },
  lima: { lat: -12.05, lon: -77.04, cc: 'PE' },
  caracas: { lat: 10.48, lon: -66.9, cc: 'VE' },
  london: { lat: 51.51, lon: -0.13, cc: 'GB' },
  paris: { lat: 48.86, lon: 2.35, cc: 'FR' },
  berlin: { lat: 52.52, lon: 13.41, cc: 'DE' },
  rome: { lat: 41.9, lon: 12.5, cc: 'IT' },
  madrid: { lat: 40.42, lon: -3.7, cc: 'ES' },
  brussels: { lat: 50.85, lon: 4.35, cc: 'BE' },
  geneva: { lat: 46.2, lon: 6.14, cc: 'CH' },
  vienna: { lat: 48.21, lon: 16.37, cc: 'AT' },
  warsaw: { lat: 52.23, lon: 21.01, cc: 'PL' },
  kyiv: { lat: 50.45, lon: 30.52, cc: 'UA' },
  kiev: { lat: 50.45, lon: 30.52, cc: 'UA' },
  moscow: { lat: 55.76, lon: 37.62, cc: 'RU' },
  stockholm: { lat: 59.33, lon: 18.07, cc: 'SE' },
  athens: { lat: 37.98, lon: 23.73, cc: 'GR' },
  istanbul: { lat: 41.01, lon: 28.98, cc: 'TR' },
  ankara: { lat: 39.93, lon: 32.86, cc: 'TR' },
  jerusalem: { lat: 31.77, lon: 35.21, cc: 'IL' },
  'tel aviv': { lat: 32.09, lon: 34.78, cc: 'IL' },
  beirut: { lat: 33.89, lon: 35.5, cc: 'LB' },
  damascus: { lat: 33.51, lon: 36.29, cc: 'SY' },
  baghdad: { lat: 33.31, lon: 44.37, cc: 'IQ' },
  tehran: { lat: 35.69, lon: 51.39, cc: 'IR' },
  riyadh: { lat: 24.71, lon: 46.68, cc: 'SA' },
  dubai: { lat: 25.2, lon: 55.27, cc: 'AE' },
  cairo: { lat: 30.04, lon: 31.24, cc: 'EG' },
  khartoum: { lat: 15.5, lon: 32.56, cc: 'SD' },
  'addis ababa': { lat: 9.02, lon: 38.75, cc: 'ET' },
  nairobi: { lat: -1.29, lon: 36.82, cc: 'KE' },
  lagos: { lat: 6.52, lon: 3.38, cc: 'NG' },
  abuja: { lat: 9.06, lon: 7.5, cc: 'NG' },
  johannesburg: { lat: -26.2, lon: 28.05, cc: 'ZA' },
  'cape town': { lat: -33.92, lon: 18.42, cc: 'ZA' },
  kinshasa: { lat: -4.44, lon: 15.27, cc: 'CD' },
  beijing: { lat: 39.9, lon: 116.41, cc: 'CN' },
  shanghai: { lat: 31.23, lon: 121.47, cc: 'CN' },
  'hong kong': { lat: 22.32, lon: 114.17, cc: 'HK' },
  'new delhi': { lat: 28.61, lon: 77.21, cc: 'IN' },
  delhi: { lat: 28.61, lon: 77.21, cc: 'IN' },
  mumbai: { lat: 19.08, lon: 72.88, cc: 'IN' },
  islamabad: { lat: 33.69, lon: 73.06, cc: 'PK' },
  karachi: { lat: 24.86, lon: 67.0, cc: 'PK' },
  kabul: { lat: 34.56, lon: 69.21, cc: 'AF' },
  dhaka: { lat: 23.81, lon: 90.41, cc: 'BD' },
  bangkok: { lat: 13.76, lon: 100.5, cc: 'TH' },
  hanoi: { lat: 21.03, lon: 105.85, cc: 'VN' },
  manila: { lat: 14.6, lon: 120.98, cc: 'PH' },
  jakarta: { lat: -6.21, lon: 106.85, cc: 'ID' },
  tokyo: { lat: 35.68, lon: 139.69, cc: 'JP' },
  seoul: { lat: 37.57, lon: 126.98, cc: 'KR' },
  pyongyang: { lat: 39.03, lon: 125.75, cc: 'KP' },
  taipei: { lat: 25.03, lon: 121.57, cc: 'TW' },
  sydney: { lat: -33.87, lon: 151.21, cc: 'AU' },
  canberra: { lat: -35.28, lon: 149.13, cc: 'AU' },
  melbourne: { lat: -37.81, lon: 144.96, cc: 'AU' },
  wellington: { lat: -41.29, lon: 174.78, cc: 'NZ' },
  tbilisi: { lat: 41.72, lon: 44.79, cc: 'GE' },
};

// ——— United States: states, DC and key cities ———

/** [name, postal code, centroid lat, centroid lon, snap tolerance in degrees] */
const STATE_ROWS: [string, string, number, number, number][] = [
  ['Alabama', 'AL', 32.8, -86.8, 3.5],
  ['Alaska', 'AK', 64.0, -152.0, 15],
  ['Arizona', 'AZ', 34.3, -111.7, 4],
  ['Arkansas', 'AR', 34.9, -92.4, 3],
  ['California', 'CA', 37.2, -119.5, 6],
  ['Colorado', 'CO', 39.0, -105.5, 4],
  ['Connecticut', 'CT', 41.6, -72.7, 1.5],
  ['Delaware', 'DE', 39.0, -75.5, 1.5],
  ['Florida', 'FL', 28.6, -82.4, 5.5],
  ['Georgia', 'GA', 32.7, -83.4, 3.5],
  ['Hawaii', 'HI', 20.8, -156.3, 4],
  ['Idaho', 'ID', 44.4, -114.6, 4.5],
  ['Illinois', 'IL', 40.0, -89.2, 4],
  ['Indiana', 'IN', 39.9, -86.3, 3],
  ['Iowa', 'IA', 42.1, -93.5, 3.5],
  ['Kansas', 'KS', 38.5, -98.4, 4],
  ['Kentucky', 'KY', 37.5, -85.3, 4],
  ['Louisiana', 'LA', 31.1, -92.0, 3.5],
  ['Maine', 'ME', 45.4, -69.2, 3.5],
  ['Maryland', 'MD', 39.0, -76.8, 2.5],
  ['Massachusetts', 'MA', 42.3, -71.8, 2.5],
  ['Michigan', 'MI', 44.3, -85.4, 5],
  ['Minnesota', 'MN', 46.3, -94.3, 4.5],
  ['Mississippi', 'MS', 32.7, -89.7, 3.5],
  ['Missouri', 'MO', 38.4, -92.5, 4],
  ['Montana', 'MT', 47.0, -109.6, 6],
  ['Nebraska', 'NE', 41.5, -99.8, 4.5],
  ['Nevada', 'NV', 39.3, -116.6, 5],
  ['New Hampshire', 'NH', 43.7, -71.6, 2],
  ['New Jersey', 'NJ', 40.2, -74.7, 2],
  ['New Mexico', 'NM', 34.4, -106.1, 4],
  ['New York', 'NY', 42.9, -75.5, 4],
  ['North Carolina', 'NC', 35.5, -79.4, 5],
  ['North Dakota', 'ND', 47.5, -100.5, 4],
  ['Ohio', 'OH', 40.3, -82.8, 3],
  ['Oklahoma', 'OK', 35.6, -97.5, 4.5],
  ['Oregon', 'OR', 43.9, -120.6, 4.5],
  ['Pennsylvania', 'PA', 40.9, -77.8, 3.5],
  ['Rhode Island', 'RI', 41.7, -71.5, 1],
  ['South Carolina', 'SC', 33.9, -80.9, 3],
  ['South Dakota', 'SD', 44.4, -100.2, 4],
  ['Tennessee', 'TN', 35.9, -86.4, 5],
  ['Texas', 'TX', 31.5, -99.3, 8],
  ['Utah', 'UT', 39.3, -111.7, 3.5],
  ['Vermont', 'VT', 44.0, -72.7, 2],
  ['Virginia', 'VA', 37.5, -78.8, 4.5],
  ['Washington', 'WA', 47.4, -120.5, 4.5],
  ['West Virginia', 'WV', 38.6, -80.6, 3],
  ['Wisconsin', 'WI', 44.6, -89.9, 3.5],
  ['Wyoming', 'WY', 43.0, -107.5, 4],
  ['District of Columbia', 'DC', 38.9, -77.04, 1],
];

/** [name (or aliases separated by '|'), postal code, lat, lon] — capitals and the largest metros. */
const CITY_ROWS: [string, string, number, number][] = [
  ['montgomery', 'AL', 32.38, -86.3], ['birmingham', 'AL', 33.52, -86.8], ['huntsville', 'AL', 34.73, -86.59], ['mobile', 'AL', 30.69, -88.04],
  ['anchorage', 'AK', 61.22, -149.9], ['juneau', 'AK', 58.3, -134.42], ['fairbanks', 'AK', 64.84, -147.72],
  ['phoenix', 'AZ', 33.45, -112.07], ['tucson', 'AZ', 32.22, -110.97], ['flagstaff', 'AZ', 35.2, -111.65],
  ['little rock', 'AR', 34.75, -92.29], ['fayetteville', 'AR', 36.06, -94.16],
  ['los angeles', 'CA', 34.05, -118.24], ['san francisco', 'CA', 37.77, -122.42], ['sacramento', 'CA', 38.58, -121.49],
  ['san diego', 'CA', 32.72, -117.16], ['san jose', 'CA', 37.34, -121.89], ['oakland', 'CA', 37.8, -122.27], ['fresno', 'CA', 36.74, -119.79],
  ['denver', 'CO', 39.74, -104.99], ['colorado springs', 'CO', 38.83, -104.82], ['boulder', 'CO', 40.01, -105.27],
  ['hartford', 'CT', 41.76, -72.67], ['new haven', 'CT', 41.31, -72.92], ['bridgeport', 'CT', 41.19, -73.2],
  ['dover', 'DE', 39.16, -75.52], ['wilmington', 'DE', 39.74, -75.55],
  ['tallahassee', 'FL', 30.44, -84.28], ['miami', 'FL', 25.76, -80.19], ['orlando', 'FL', 28.54, -81.38], ['tampa', 'FL', 27.95, -82.46],
  ['jacksonville', 'FL', 30.33, -81.66], ['pensacola', 'FL', 30.42, -87.22],
  ['atlanta', 'GA', 33.75, -84.39], ['savannah', 'GA', 32.08, -81.09], ['augusta', 'GA', 33.47, -81.97], ['columbus', 'GA', 32.46, -84.99],
  ['honolulu', 'HI', 21.31, -157.86], ['hilo', 'HI', 19.71, -155.08],
  ['boise', 'ID', 43.62, -116.2],
  ['chicago', 'IL', 41.88, -87.63], ['springfield', 'IL', 39.8, -89.64],
  ['indianapolis', 'IN', 39.77, -86.16], ['fort wayne', 'IN', 41.08, -85.14],
  ['des moines', 'IA', 41.59, -93.62], ['cedar rapids', 'IA', 41.98, -91.67],
  ['topeka', 'KS', 39.05, -95.68], ['wichita', 'KS', 37.69, -97.34], ['kansas city', 'KS', 39.11, -94.63],
  ['frankfort', 'KY', 38.2, -84.87], ['louisville', 'KY', 38.25, -85.76], ['lexington', 'KY', 38.04, -84.5],
  ['baton rouge', 'LA', 30.45, -91.19], ['new orleans', 'LA', 29.95, -90.07], ['shreveport', 'LA', 32.53, -93.75],
  ['augusta', 'ME', 44.31, -69.78], ['portland', 'ME', 43.66, -70.26],
  ['annapolis', 'MD', 38.98, -76.49], ['baltimore', 'MD', 39.29, -76.61],
  ['boston', 'MA', 42.36, -71.06], ['worcester', 'MA', 42.26, -71.8], ['springfield', 'MA', 42.1, -72.59],
  ['lansing', 'MI', 42.73, -84.56], ['detroit', 'MI', 42.33, -83.05], ['grand rapids', 'MI', 42.96, -85.67],
  ['saint paul|st. paul|st paul', 'MN', 44.95, -93.09], ['minneapolis', 'MN', 44.98, -93.27], ['duluth', 'MN', 46.79, -92.1],
  ['jackson', 'MS', 32.3, -90.18], ['gulfport', 'MS', 30.37, -89.09],
  ['jefferson city', 'MO', 38.58, -92.17], ['st. louis|st louis|saint louis', 'MO', 38.63, -90.2], ['kansas city', 'MO', 39.1, -94.58],
  ['springfield', 'MO', 37.21, -93.29],
  ['helena', 'MT', 46.59, -112.04], ['billings', 'MT', 45.78, -108.5],
  ['lincoln', 'NE', 40.81, -96.7], ['omaha', 'NE', 41.26, -95.93],
  ['carson city', 'NV', 39.16, -119.77], ['las vegas', 'NV', 36.17, -115.14], ['reno', 'NV', 39.53, -119.81],
  ['concord', 'NH', 43.21, -71.54], ['manchester', 'NH', 42.99, -71.46],
  ['trenton', 'NJ', 40.22, -74.76], ['newark', 'NJ', 40.74, -74.17], ['jersey city', 'NJ', 40.73, -74.08],
  ['santa fe', 'NM', 35.69, -105.94], ['albuquerque', 'NM', 35.08, -106.65],
  ['new york city|new york|nyc|manhattan|brooklyn|bronx|the bronx|queens|staten island', 'NY', 40.71, -74.01],
  ['albany', 'NY', 42.65, -73.76], ['buffalo', 'NY', 42.89, -78.88], ['rochester', 'NY', 43.16, -77.61], ['syracuse', 'NY', 43.05, -76.15],
  ['raleigh', 'NC', 35.78, -78.64], ['charlotte', 'NC', 35.23, -80.84], ['asheville', 'NC', 35.6, -82.55], ['wilmington', 'NC', 34.23, -77.94],
  ['bismarck', 'ND', 46.81, -100.78], ['fargo', 'ND', 46.88, -96.79],
  ['columbus', 'OH', 39.96, -83.0], ['cleveland', 'OH', 41.5, -81.69], ['cincinnati', 'OH', 39.1, -84.51],
  ['oklahoma city', 'OK', 35.47, -97.52], ['tulsa', 'OK', 36.15, -95.99],
  ['salem', 'OR', 44.94, -123.04], ['portland', 'OR', 45.52, -122.68], ['eugene', 'OR', 44.05, -123.09],
  ['harrisburg', 'PA', 40.27, -76.88], ['philadelphia', 'PA', 39.95, -75.17], ['pittsburgh', 'PA', 40.44, -80.0],
  ['providence', 'RI', 41.82, -71.41],
  ['columbia', 'SC', 34.0, -81.03], ['charleston', 'SC', 32.78, -79.93],
  ['pierre', 'SD', 44.37, -100.35], ['sioux falls', 'SD', 43.55, -96.73],
  ['nashville', 'TN', 36.16, -86.78], ['memphis', 'TN', 35.15, -90.05], ['knoxville', 'TN', 35.96, -83.92],
  ['austin', 'TX', 30.27, -97.74], ['houston', 'TX', 29.76, -95.37], ['dallas', 'TX', 32.78, -96.8], ['san antonio', 'TX', 29.42, -98.49],
  ['el paso', 'TX', 31.76, -106.49], ['fort worth', 'TX', 32.76, -97.33], ['brownsville', 'TX', 25.9, -97.5],
  ['salt lake city', 'UT', 40.76, -111.89], ['provo', 'UT', 40.23, -111.66],
  ['montpelier', 'VT', 44.26, -72.58], ['burlington', 'VT', 44.48, -73.21],
  ['richmond', 'VA', 37.54, -77.44], ['virginia beach', 'VA', 36.85, -75.98], ['norfolk', 'VA', 36.85, -76.29], ['arlington', 'VA', 38.88, -77.1],
  ['olympia', 'WA', 47.04, -122.9], ['seattle', 'WA', 47.61, -122.33], ['spokane', 'WA', 47.66, -117.43], ['tacoma', 'WA', 47.25, -122.44],
  ['charleston', 'WV', 38.35, -81.63], ['morgantown', 'WV', 39.63, -79.96],
  ['madison', 'WI', 43.07, -89.4], ['milwaukee', 'WI', 43.04, -87.91],
  ['cheyenne', 'WY', 41.14, -104.82], ['casper', 'WY', 42.87, -106.31],
];

/** A city a story can sit in without its coordinates being second-guessed. */
const US_CITY_TOL = 2.5;

export const US_STATES: Place[] = STATE_ROWS.map(([, code, lat, lon, tol]) => ({
  lat,
  lon,
  cc: 'US',
  sub: `US-${code}`,
  tol,
  kind: 'state',
}));
const STATE_BY_NAME = new Map<string, Place>();
const STATE_BY_CODE = new Map<string, Place>();
STATE_ROWS.forEach(([name, code], index) => {
  STATE_BY_NAME.set(name.toLowerCase(), US_STATES[index]);
  STATE_BY_CODE.set(code, US_STATES[index]);
});
const DC = STATE_BY_CODE.get('DC')!;
const WA = STATE_BY_CODE.get('WA')!;
for (const alias of ['d.c.', 'dc', 'washington dc', 'washington d.c.', 'washington, d.c.']) {
  STATE_BY_NAME.set(alias, DC);
}
STATE_BY_NAME.set('washington state', WA);
// a bare "Washington" is DC or the state: decided by context (resolvePlace)
STATE_BY_NAME.delete('washington');

export const US_CITIES = new Map<string, Place[]>();
for (const [names, code, lat, lon] of CITY_ROWS) {
  const place: Place = { lat, lon, cc: 'US', sub: `US-${code}`, tol: US_CITY_TOL, kind: 'city' };
  for (const name of names.split('|')) {
    US_CITIES.set(name, [...(US_CITIES.get(name) ?? []), place]);
  }
}

/** Every US subdivision code the gazetteer knows, e.g. 'US-TX'. */
export const US_SUBDIVISIONS = new Set(US_STATES.map((state) => state.sub!));

/**
 * The US as boxes (contiguous states, Alaska incl. the Aleutians, Hawaii)
 * rather than an 8° radius around a centroid in Kansas, which put every
 * coastal story "far" from the country it is in.
 */
const US_BOXES: [number, number, number, number][] = [
  // [minLat, maxLat, minLon, maxLon]
  [24.0, 49.6, -125.0, -66.5],
  [51.0, 71.6, -180.0, -129.5],
  [51.0, 53.5, 172.0, 180.0],
  [18.5, 22.5, -160.5, -154.5],
];

export function inUnitedStates(lat: number, lon: number): boolean {
  return US_BOXES.some(([minLat, maxLat, minLon, maxLon]) =>
    lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon,
  );
}

/** Lookup of the worldwide table only (countries + major non-US cities, plus the US as a country). */
export function lookupPlace(name: string): Place | undefined {
  return GAZETTEER[name.trim().toLowerCase()];
}

/** The pieces of a place name, most specific first, with parentheticals dropped. */
function placeParts(locationName: string): string[] {
  return locationName
    .replace(/\([^)]*\)/g, ' ')
    .split(/[,/;]/)
    .map((part) => part.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
}

const isRegion = (place: Place) => place.kind === 'country' || place.kind === 'state';

/** Every place one part of a name could mean, in preference order for when there are no coordinates. */
function candidatesFor(
  part: string,
  index: number,
  coords: { lat: number; lon: number } | undefined,
  namesDC: boolean,
): Place[] {
  let lower = part.toLowerCase();
  // "New York State", "Washington State"
  const stateSuffix = / state$/.test(lower) && STATE_BY_NAME.has(lower.slice(0, -6));
  if (stateSuffix && !STATE_BY_NAME.has(lower)) lower = lower.slice(0, -6);
  const out: Place[] = [];
  // postal codes only in capitals ("Spokane, WA") and only for a story in the US:
  // "Berlin, DE" must not become Delaware
  if (/^[A-Z]{2}$/.test(part) && STATE_BY_CODE.has(part) && (!coords || inUnitedStates(coords.lat, coords.lon))) {
    out.push(STATE_BY_CODE.get(part)!);
  }
  if (lower === 'washington' && !stateSuffix) {
    // "Washington, D.C." is DC; "Seattle, Washington" (a later part) is the state;
    // a leading bare "Washington" may be either
    out.push(...(namesDC ? [DC] : index === 0 ? [DC, WA] : [WA]));
  }
  if (!stateSuffix) {
    const global = GAZETTEER[lower];
    if (global) out.push(global);
    out.push(...(US_CITIES.get(lower) ?? []));
  }
  const state = STATE_BY_NAME.get(lower);
  if (state) out.push(state);
  return [...new Set(out)];
}

/** Can `place` sit inside `region` (a country or a state)? */
function fitsIn(place: Place, region: Place): boolean {
  if (region.kind === 'state') {
    if (place.cc !== 'US') return false;
    return place.kind === 'country' || place.sub === region.sub;
  }
  return place.cc === region.cc;
}

function nearest(places: Place[], coords?: { lat: number; lon: number }): Place {
  if (!coords || places.length === 1) return places[0];
  let best = places[0];
  let bestDistance = Infinity;
  for (const place of places) {
    const distance = Math.hypot(place.lat - coords.lat, place.lon - coords.lon);
    if (distance < bestDistance) {
      best = place;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * What a free-text place name refers to. Parts are tried most specific first
 * ("Tokyo, Japan" is Tokyo), but a later country or state overrides an earlier
 * city that cannot be in it: "Paris, Texas" is Texas, not France, and
 * "Savannah, Georgia, USA" is the state, not the country. Names that mean two
 * things ("Washington", "Georgia", "Portland") take the reading the rest of
 * the name allows, then the one nearest the model's coordinates.
 */
export function resolvePlace(locationName: string, coords?: { lat: number; lon: number }): Place | undefined {
  const parts = placeParts(locationName);
  const namesDC = parts.some((part) => STATE_BY_NAME.get(part.toLowerCase()) === DC);
  const candidates = parts.map((part, index) => candidatesFor(part, index, coords, namesDC));
  for (let index = 0; index < parts.length; index++) {
    const later = candidates.slice(index + 1);
    let options = candidates[index].filter((place) => consistentWith(place, later));
    if (options.length === 0) continue;
    if (!later.some((part) => part.some(isRegion)) && coords && !inUnitedStates(coords.lat, coords.lon)) {
      // a bare US city name with coordinates abroad is a namesake ("Birmingham")
      options = options.filter((place) => !(place.cc === 'US' && place.kind === 'city'));
      if (options.length === 0) continue;
    }
    return nearest(options, coords);
  }
  return undefined;
}

/**
 * Whether a candidate fits the countries and states named after it: the
 * nearest later country/state part decides. A state may sit next to a sibling
 * state ("Gulf Shores, Alabama/Pensacola, Florida, USA"), so for a state the
 * walk continues past parts that only name other states.
 */
function consistentWith(place: Place, later: Place[][]): boolean {
  for (const part of later) {
    const regions = part.filter(isRegion);
    if (regions.length === 0) continue;
    if (regions.some((region) => fitsIn(place, region))) return true;
    if (place.kind === 'state' && regions.every((region) => region.kind === 'state')) continue;
    return false;
  }
  return true;
}

/** Whether coordinates are too far from a matched place to be believed. */
function isFar(place: Place, lat: number, lon: number): boolean {
  if (place.cc === 'US' && place.kind === 'country') return !inUnitedStates(lat, lon);
  const tol = place.tol ?? 8;
  return Math.abs(place.lat - lat) > tol || Math.abs(place.lon - lon) > tol;
}

/** Snap agent coordinates to the gazetteer when the name matches but coords are far off. */
export function reconcileCoordinates(
  locationName: string,
  lat: number,
  lon: number,
): { lat: number; lon: number; cc?: string; sub?: string } {
  const place = resolvePlace(locationName, { lat, lon });
  if (!place) return { lat, lon };
  const snapped = isFar(place, lat, lon) ? { lat: place.lat, lon: place.lon } : { lat, lon };
  return { ...snapped, cc: place.cc, ...(place.sub ? { sub: place.sub } : {}) };
}

/** Within this distance a story with no state in its name takes the nearest known city's state. */
const SUBDIVISION_RADIUS_KM = 150;

/**
 * ISO 3166-2 code for a US story: the state the place name says, else the state
 * of the nearest gazetteer city within 150 km, else undefined.
 */
export function subdivisionFor(locationName: string, lat: number, lon: number): string | undefined {
  const place = resolvePlace(locationName, { lat, lon });
  if (place?.sub) return place.sub;
  if (place && place.cc !== 'US') return undefined;
  let best: Place | undefined;
  let bestKm = SUBDIVISION_RADIUS_KM;
  for (const cities of US_CITIES.values()) {
    for (const city of cities) {
      const km = haversineKm(lat, lon, city.lat, city.lon);
      if (km <= bestKm) {
        best = city;
        bestKm = km;
      }
    }
  }
  return best?.sub;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const a =
    Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lon2 - lon1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}
