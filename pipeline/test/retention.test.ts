import { describe, expect, it } from 'vitest';
import type { NewsEvent } from '../../shared/news.ts';
import { LIFETIME_HOURS, expiryOf, isExpired, lifetimeHours } from '../../shared/retention.ts';
import { distanceKm, headlineTokens, jaccard, matchPrevious } from '../src/retention.ts';

const HOUR = 3_600_000;

function event(overrides: Partial<NewsEvent> & { id: string }): NewsEvent {
  return {
    headline: 'Placeholder headline for a test event',
    summary: 'A summary long enough to satisfy the schema minimum length for summaries.',
    category: 'conflict',
    severity: 3,
    lat: 0,
    lon: 0,
    locationName: 'Nowhere',
    countryCode: 'XX',
    sources: [{ url: 'https://www.reuters.com/x', domain: 'reuters.com', reliability: 90, bias: 'center' }],
    trustScore: 70,
    firstSeen: '2026-09-01T00:00:00.000Z',
    lastUpdated: '2026-09-01T00:00:00.000Z',
    isBreaking: false,
    ...overrides,
  };
}

describe('lifetime', () => {
  it('scales with severity and clamps the edges', () => {
    expect(lifetimeHours(1)).toBe(24);
    expect(lifetimeHours(5)).toBe(168);
    expect(lifetimeHours(9)).toBe(LIFETIME_HOURS[5]);
    expect(lifetimeHours(0)).toBe(LIFETIME_HOURS[1]);
    expect(lifetimeHours(Number.NaN)).toBe(LIFETIME_HOURS[3]);
  });

  it('derives expiry from lastUpdated when the file predates expiresAt', () => {
    const e = event({ id: 'a', severity: 4, lastUpdated: '2026-09-01T00:00:00.000Z' });
    expect(expiryOf(e)).toBe(Date.parse('2026-09-01T00:00:00.000Z') + 96 * HOUR);
    expect(isExpired(e, Date.parse('2026-09-04T23:00:00.000Z'))).toBe(false);
    expect(isExpired(e, Date.parse('2026-09-05T00:00:00.000Z'))).toBe(true);
  });

  it('prefers a stamped expiresAt over the derived one', () => {
    const e = event({ id: 'a', severity: 1, expiresAt: '2026-09-10T00:00:00.000Z' });
    expect(expiryOf(e)).toBe(Date.parse('2026-09-10T00:00:00.000Z'));
  });
});

describe('headline similarity', () => {
  it('drops short words and stopwords', () => {
    const tokens = headlineTokens('Death toll rises to 1,400 after Nepal flood');
    expect([...tokens].sort()).toEqual(['flood', 'nepal', 'rises']);
  });

  it('measures overlap as Jaccard with the shared count', () => {
    const { score, shared } = jaccard(new Set(['a', 'b', 'c']), new Set(['b', 'c', 'd']));
    expect(shared).toBe(2);
    expect(score).toBeCloseTo(0.5);
  });

  it('haversine: Paris to London is about 344 km', () => {
    expect(distanceKm(48.8566, 2.3522, 51.5074, -0.1278)).toBeCloseTo(344, -1);
  });
});

describe('matchPrevious', () => {
  const kyiv = { lat: 50.45, lon: 30.52 };
  const previous = [
    event({
      id: 'ceasefire',
      headline: 'Ceasefire negotiations resume amid renewed shelling in eastern frontline towns',
      category: 'conflict',
      ...kyiv,
    }),
    event({
      id: 'grain',
      headline: 'Grain export corridor reopens after two-week closure',
      category: 'economy',
      ...kyiv,
    }),
    event({
      id: 'warsaw',
      headline: 'Ceasefire negotiations resume amid renewed shelling in eastern frontline towns',
      category: 'conflict',
      lat: 52.23,
      lon: 21.01,
    }),
  ];

  it('matches a reworded follow-up in the same place and category', () => {
    const hit = matchPrevious(
      {
        headline: 'Ceasefire talks resume as shelling continues near eastern frontline towns',
        category: 'conflict',
      },
      kyiv,
      previous,
      'fresh-id',
    );
    expect(hit?.id).toBe('ceasefire');
  });

  it('does not cross categories or long distances', () => {
    expect(
      matchPrevious(
        { headline: 'Grain corridor reopens as export shipments resume', category: 'conflict' },
        kyiv,
        previous,
        'x',
      ),
    ).toBeUndefined();
    expect(
      matchPrevious(
        { headline: 'Ceasefire talks resume as shelling continues in frontline towns', category: 'conflict' },
        { lat: 41.9, lon: 12.5 },
        previous,
        'x',
      ),
    ).toBeUndefined();
  });

  it('never matches on a single shared word', () => {
    expect(
      matchPrevious(
        { headline: 'Shelling reported overnight near power plant', category: 'conflict' },
        kyiv,
        previous,
        'x',
      ),
    ).toBeUndefined();
  });

  it('lets the synthesizer name the story it continues, over any fuzzy match', () => {
    const hit = matchPrevious(
      {
        headline: 'Ceasefire talks resume as shelling continues near eastern frontline towns',
        category: 'conflict',
        updates: 'grain',
      },
      kyiv,
      previous,
      'x',
    );
    expect(hit?.id).toBe('grain');
  });

  it('falls through when the named id is not on the map', () => {
    const hit = matchPrevious(
      { headline: 'Something else entirely happened', category: 'society', updates: 'gone' },
      kyiv,
      previous,
      'x',
    );
    expect(hit).toBeUndefined();
  });
});
