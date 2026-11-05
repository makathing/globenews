import { CATEGORIES, CATEGORY_LABELS, type NewsEvent, type NewsSource } from '../../../shared/news';
import { areaOf } from '../../../shared/areas';
import { regionFromLatLon, type RegionId } from './regions';

/**
 * What a reader does with the list beyond filtering it: search it, see what
 * changed since they last looked, follow places and ongoing stories, read
 * a short briefing, and find what is near them. Pure, so it is unit-testable;
 * state lives in the store and prefs.
 */

// ——— search ———

function normalize(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** The text a query is matched against. */
export function searchText(event: NewsEvent): string {
  return normalize(
    [
      event.headline,
      event.summary,
      event.locationName,
      event.storyline?.label ?? '',
      CATEGORY_LABELS[event.category],
      event.whatChanged ?? '',
    ].join(' • '),
  );
}

/** Every word of the query appears somewhere in the story (case- and accent-insensitive). */
export function matchesQuery(event: NewsEvent, query: string): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = searchText(event);
  return words.every((word) => text.includes(word));
}

// ——— since your last visit ———

export type VisitChange = 'new' | 'updated' | null;

/** What happened to a story since the reader's previous visit (null: nothing, or no previous visit). */
export function sinceVisit(event: NewsEvent, lastVisit: number | null): VisitChange {
  if (lastVisit === null) return null;
  if (Date.parse(event.firstSeen) > lastVisit) return 'new';
  if (Date.parse(event.lastUpdated) > lastVisit) return 'updated';
  return null;
}

export function countSinceVisit(events: readonly NewsEvent[], lastVisit: number | null): { added: number; updated: number } {
  let added = 0;
  let updated = 0;
  for (const event of events) {
    const change = sinceVisit(event, lastVisit);
    if (change === 'new') added += 1;
    else if (change === 'updated') updated += 1;
  }
  return { added, updated };
}

// ——— following ———

export interface Follows {
  /** Storyline ids. */
  storylines: string[];
  /** Places: an ISO 3166-2 state ('US-TX') or an ISO 3166-1 country ('FR'). */
  places: string[];
}

export const NO_FOLLOWS: Follows = { storylines: [], places: [] };

/** The place a story can be followed by: its state when it has one, else its country. */
export function placeOf(event: Pick<NewsEvent, 'countryCode' | 'subdivision'>): string | null {
  if (event.subdivision) return event.subdivision.toUpperCase();
  const code = event.countryCode.toUpperCase();
  return code === 'XX' ? null : code;
}

export function isFollowed(event: NewsEvent, follows: Follows): boolean {
  if (event.storyline && follows.storylines.includes(event.storyline.id)) return true;
  const place = placeOf(event);
  if (!place) return false;
  // following a country covers its states
  return follows.places.includes(place) || follows.places.includes(event.countryCode.toUpperCase());
}

export function toggled(list: readonly string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

// ——— ordering ———

/**
 * The rail's order: breaking first, then severity, then — within the same
 * severity — what the reader follows, then trust.
 */
export function railOrder(events: readonly NewsEvent[], follows: Follows = NO_FOLLOWS): NewsEvent[] {
  return [...events].sort(
    (a, b) =>
      Number(b.isBreaking) - Number(a.isBreaking) ||
      b.severity - a.severity ||
      Number(isFollowed(b, follows)) - Number(isFollowed(a, follows)) ||
      b.trustScore - a.trustScore,
  );
}

/** How much a story matters for a briefing: impact weighted by how well it is sourced. */
export function importance(event: NewsEvent): number {
  return event.severity * (0.5 + event.trustScore / 200) + (event.isBreaking ? 2 : 0);
}

/** Stories a briefing leads with, regardless of where or what. */
export const BRIEFING_TOP = 5;

/**
 * A short briefing: the BRIEFING_TOP most important stories, then the most
 * important remaining story of every world area and every category, so a
 * reader skimming eight to fifteen items still sees the whole world.
 */
export function briefing(events: readonly NewsEvent[]): NewsEvent[] {
  const ranked = [...events].sort((a, b) => importance(b) - importance(a));
  const picked = new Set<NewsEvent>(ranked.slice(0, BRIEFING_TOP));
  const areas = new Set([...picked].map((event) => areaOf(event)));
  const categories = new Set([...picked].map((event) => event.category));
  for (const event of ranked) {
    const area = areaOf(event);
    if (!areas.has(area)) {
      areas.add(area);
      categories.add(event.category);
      picked.add(event);
    }
  }
  for (const category of CATEGORIES) {
    if (categories.has(category)) continue;
    const best = ranked.find((event) => event.category === category);
    if (best) {
      categories.add(category);
      picked.add(best);
    }
  }
  return ranked.filter((event) => picked.has(event));
}

// ——— near me ———

export interface Point {
  lat: number;
  lon: number;
}

/** Coarse: about 10 km. A reader's position is never kept more precisely than this. */
export function coarsen(point: Point): Point {
  return { lat: Math.round(point.lat * 10) / 10, lon: Math.round(point.lon * 10) / 10 };
}

export function distanceKm(a: Point, b: Point): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function byDistance(events: readonly NewsEvent[], from: Point): NewsEvent[] {
  return [...events].sort((a, b) => distanceKm(from, a) - distanceKm(from, b));
}

/** Contiguous US, Alaska and Hawaii, as rough boxes: enough to pick the US view. */
function inUnitedStates({ lat, lon }: Point): boolean {
  if (lat >= 24.5 && lat <= 49.4 && lon >= -125 && lon <= -66.9) return true; // lower 48
  if (lat >= 51 && lat <= 71.5 && lon >= -170 && lon <= -129.9) return true; // Alaska
  return lat >= 18.8 && lat <= 22.4 && lon >= -160.5 && lon <= -154.6; // Hawaii
}

/** The region view for a reader's position. */
export function regionForPoint(point: Point): Exclude<RegionId, 'world'> {
  return inUnitedStates(point) ? 'us' : regionFromLatLon(point.lat, point.lon);
}

// ——— related stories & sources ———

/**
 * Other stories worth reading next: the same storyline first, then the same
 * place, then the same category nearby (within 1500 km). Most recent first
 * within each group.
 */
export function relatedStories(event: NewsEvent, events: readonly NewsEvent[], max = 4): NewsEvent[] {
  const others = events.filter((other) => other.id !== event.id);
  const recent = (a: NewsEvent, b: NewsEvent) => Date.parse(b.lastUpdated) - Date.parse(a.lastUpdated);
  const sameStoryline = event.storyline
    ? others.filter((other) => other.storyline?.id === event.storyline!.id).sort(recent)
    : [];
  const place = placeOf(event);
  const samePlace = place ? others.filter((other) => placeOf(other) === place).sort(recent) : [];
  const nearbySameCategory = others
    .filter((other) => other.category === event.category && distanceKm(event, other) < 1500)
    .sort(recent);
  const out: NewsEvent[] = [];
  for (const candidate of [...sameStoryline, ...samePlace, ...nearbySameCategory]) {
    if (!out.includes(candidate)) out.push(candidate);
    if (out.length >= max) break;
  }
  return out;
}

const WIRE_NAMES: Record<string, string> = {
  'apnews.com': 'AP',
  'reuters.com': 'Reuters',
  'afp.com': 'AFP',
  wire: 'wire',
};

/** "AP copy" for a syndicated source, or null for an outlet's own reporting. */
export function syndicationLabel(source: NewsSource): string | null {
  if (!source.origin || source.origin === source.domain) return null;
  const name = WIRE_NAMES[source.origin] ?? source.origin;
  return `${name} copy`;
}

/** Distinct newsrooms behind the sources (syndicated copies of one wire count once). */
export function independentCount(sources: readonly NewsSource[]): number {
  return new Set(sources.map((source) => source.origin ?? source.domain)).size;
}
