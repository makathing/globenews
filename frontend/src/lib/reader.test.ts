import { describe, expect, it } from 'vitest';
import type { NewsEvent } from '../../../shared/news';
import {
  briefing,
  byDistance,
  coarsen,
  countSinceVisit,
  independentCount,
  isFollowed,
  matchesQuery,
  placeOf,
  railOrder,
  regionForPoint,
  relatedStories,
  sinceVisit,
  syndicationLabel,
  toggled,
} from './reader';
import { readUrlState, writeUrlState } from './urlParams';
import { loadFollows, loadLastVisit, storeFollows, storeLastVisit } from './prefs';

function event(overrides: Partial<NewsEvent> & { id: string }): NewsEvent {
  return {
    headline: `Headline ${overrides.id}`,
    summary: 'Summary text.',
    category: 'politics',
    severity: 2,
    lat: 48.85,
    lon: 2.35,
    locationName: 'Paris, France',
    countryCode: 'FR',
    sources: [{ url: 'https://reuters.com/a', domain: 'reuters.com', reliability: 95, bias: 'center' }],
    trustScore: 60,
    firstSeen: '2026-11-04T06:00:00.000Z',
    lastUpdated: '2026-11-04T06:00:00.000Z',
    isBreaking: false,
    ...overrides,
  };
}

function memoryStorage() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
}

describe('search', () => {
  const story = event({
    id: 'a',
    headline: 'Floods hit São Paulo',
    locationName: 'São Paulo, Brazil',
    storyline: { id: 'brazil-floods', label: 'Brazil floods' },
  });
  it('matches every word, ignoring case and accents', () => {
    expect(matchesQuery(story, 'sao paulo')).toBe(true);
    expect(matchesQuery(story, 'FLOODS brazil')).toBe(true);
    expect(matchesQuery(story, 'floods tokyo')).toBe(false);
    expect(matchesQuery(story, '   ')).toBe(true);
  });
  it('round-trips through the URL', () => {
    expect(readUrlState('?q=  sudan  ').q).toBe('sudan');
    expect(writeUrlState('https://x.test/?event=a', { q: 'gaza ceasefire' })).toBe('/?event=a&q=gaza+ceasefire');
    expect(writeUrlState('https://x.test/?q=old', { q: '' })).toBe('/');
  });
});

describe('since your last visit', () => {
  const visit = Date.parse('2026-11-04T12:00:00Z');
  const old = event({ id: 'old' });
  const added = event({ id: 'new', firstSeen: '2026-11-04T18:00:00Z', lastUpdated: '2026-11-04T18:00:00Z' });
  const updated = event({ id: 'upd', lastUpdated: '2026-11-04T18:00:00Z' });
  it('classifies stories against the previous visit', () => {
    expect(sinceVisit(old, visit)).toBeNull();
    expect(sinceVisit(added, visit)).toBe('new');
    expect(sinceVisit(updated, visit)).toBe('updated');
    expect(sinceVisit(added, null)).toBeNull();
    expect(countSinceVisit([old, added, updated], visit)).toEqual({ added: 1, updated: 1 });
  });
  it('remembers the visit, ignoring a time from the future', () => {
    const storage = memoryStorage();
    expect(loadLastVisit(storage)).toBeNull();
    storeLastVisit(visit, storage);
    expect(loadLastVisit(storage, visit + 1)).toBe(visit);
    expect(loadLastVisit(storage, visit - 1)).toBeNull();
  });
});

describe('following', () => {
  const texas = event({ id: 'tx', countryCode: 'US', subdivision: 'US-TX', scope: 'us' });
  const war = event({ id: 'sd', countryCode: 'SD', storyline: { id: 'sudan-war', label: 'Sudan war' } });
  it('follows places (a country covers its states) and storylines', () => {
    expect(placeOf(texas)).toBe('US-TX');
    expect(placeOf(event({ id: 'x', countryCode: 'XX' }))).toBeNull();
    expect(isFollowed(texas, { storylines: [], places: ['US'] })).toBe(true);
    expect(isFollowed(texas, { storylines: [], places: ['US-TX'] })).toBe(true);
    expect(isFollowed(war, { storylines: ['sudan-war'], places: [] })).toBe(true);
    expect(isFollowed(war, { storylines: [], places: ['FR'] })).toBe(false);
    expect(toggled(['a'], 'a')).toEqual([]);
    expect(toggled([], 'a')).toEqual(['a']);
  });
  it('ranks followed stories first within the same severity', () => {
    const a = event({ id: 'a', trustScore: 90 });
    const b = event({ id: 'b', trustScore: 50, countryCode: 'SD' });
    const big = event({ id: 'big', severity: 4, trustScore: 10 });
    expect(railOrder([a, b, big], { storylines: [], places: ['SD'] }).map((e) => e.id)).toEqual(['big', 'b', 'a']);
  });
  it('stores only well-formed follows', () => {
    const storage = memoryStorage();
    storeFollows({ storylines: ['sudan-war'], places: ['US-TX', 'FR'] }, storage);
    expect(loadFollows(storage)).toEqual({ storylines: ['sudan-war'], places: ['US-TX', 'FR'] });
    storage.setItem('globenews-follows', JSON.stringify({ storylines: ['<script>'], places: ['france', 7] }));
    expect(loadFollows(storage)).toEqual({ storylines: [], places: [] });
  });
});

describe('briefing', () => {
  it('leads with the most important stories and still covers every area and category', () => {
    const conflicts = Array.from({ length: 8 }, (_, i) =>
      event({ id: `ua${i}`, category: 'conflict', severity: 4, countryCode: 'UA', lat: 50, lon: 30 }),
    );
    const africa = event({ id: 'ng', severity: 1, countryCode: 'NG', lat: 9, lon: 7 });
    const science = event({ id: 'sci', category: 'science', severity: 1 });
    const result = briefing([...conflicts, africa, science]).map((e) => e.id);
    expect(result.slice(0, 5).every((id) => id.startsWith('ua'))).toBe(true);
    expect(result).toContain('ng');
    expect(result).toContain('sci');
    expect(result.length).toBe(7);
  });
});

describe('near me', () => {
  it('coarsens the position and picks a region', () => {
    expect(coarsen({ lat: 40.71284, lon: -74.00601 })).toEqual({ lat: 40.7, lon: -74 });
    expect(regionForPoint({ lat: 40.7, lon: -74 })).toBe('us');
    expect(regionForPoint({ lat: 61.2, lon: -149.9 })).toBe('us');
    expect(regionForPoint({ lat: 48.8, lon: 2.3 })).toBe('europe');
    expect(regionForPoint({ lat: -23.5, lon: -46.6 })).toBe('americas');
  });
  it('sorts by distance', () => {
    const paris = event({ id: 'paris' });
    const tokyo = event({ id: 'tokyo', lat: 35.7, lon: 139.7 });
    expect(byDistance([tokyo, paris], { lat: 51.5, lon: -0.1 }).map((e) => e.id)).toEqual(['paris', 'tokyo']);
  });
});

describe('related stories and sources', () => {
  it('prefers the same storyline, then the same place, then nearby stories of the same kind', () => {
    const base = event({ id: 'base', countryCode: 'SD', lat: 15.5, lon: 32.5, storyline: { id: 'sudan-war', label: 'Sudan war' } });
    const sameLine = event({ id: 'line', countryCode: 'TD', lat: 12, lon: 15, storyline: { id: 'sudan-war', label: 'Sudan war' } });
    const samePlace = event({ id: 'place', countryCode: 'SD', lat: 15.6, lon: 32.6, category: 'health' });
    const far = event({ id: 'far', countryCode: 'JP', lat: 35, lon: 139 });
    expect(relatedStories(base, [base, far, samePlace, sameLine]).map((e) => e.id)).toEqual(['line', 'place']);
  });
  it('labels syndicated copies and counts newsrooms once', () => {
    const sources = [
      { url: 'https://apnews.com/a', domain: 'apnews.com', reliability: 95, bias: 'center' as const },
      { url: 'https://yahoo.com/a', domain: 'yahoo.com', reliability: 60, bias: 'center' as const, origin: 'apnews.com' },
      { url: 'https://bbc.com/a', domain: 'bbc.com', reliability: 90, bias: 'center' as const },
    ];
    expect(syndicationLabel(sources[1])).toBe('AP copy');
    expect(syndicationLabel(sources[0])).toBeNull();
    expect(independentCount(sources)).toBe(2);
  });
});
