import { describe, expect, it } from 'vitest';
import {
  balancedOrder,
  computeHealth,
  countExpired,
  finalizeScoped,
  MAX_PER_PLACE,
  SCOPE_CAPS,
} from '../src/finalize.ts';
import { dateWindow, newestFirst, WORLD_BEATS, coordinatorPrompt } from '../src/agents.ts';
import { AREA_IDS, areaOf, COUNTRY_AREA } from '../../shared/areas.ts';
import { CATEGORIES, type Category, type NewsDataset, type NewsEvent } from '../../shared/news.ts';
import type { StagedEvent } from '../src/schema.ts';

const NOW = '2026-11-05T06:00:00.000Z';

function event(overrides: Partial<NewsEvent> & { id: string }): NewsEvent {
  return {
    headline: `Headline ${overrides.id}`,
    summary: 'A summary that is long enough to pass validation.',
    category: 'politics',
    severity: 2,
    lat: 48.85,
    lon: 2.35,
    locationName: 'Paris, France',
    countryCode: 'FR',
    sources: [{ url: 'https://reuters.com/a', domain: 'reuters.com', reliability: 95, bias: 'center' }],
    trustScore: 60,
    firstSeen: NOW,
    lastUpdated: NOW,
    isBreaking: false,
    ...overrides,
  };
}

function staged(overrides: Partial<StagedEvent>): StagedEvent {
  return {
    headline: 'Something happened in a place today',
    summary: 'A summary that is long enough to pass validation.',
    category: 'politics',
    severity: 2,
    lat: 48.85,
    lon: 2.35,
    locationName: 'Paris, France',
    countryCode: 'FR',
    sources: [{ url: 'https://www.reuters.com/world/x' }, { url: 'https://www.bbc.com/news/y' }],
    ...overrides,
  };
}

describe('areas', () => {
  it('puts every country in exactly one area', () => {
    const seen = new Map<string, number>();
    for (const code of Object.keys(COUNTRY_AREA)) seen.set(code, (seen.get(code) ?? 0) + 1);
    expect([...seen.values()].every((count) => count === 1)).toBe(true);
  });

  it('splits Africa and the Middle East', () => {
    expect(areaOf({ countryCode: 'NG', lat: 0, lon: 0 })).toBe('sub-saharan-africa');
    expect(areaOf({ countryCode: 'EG', lat: 0, lon: 0 })).toBe('mena');
    expect(areaOf({ countryCode: 'BR', lat: 0, lon: 0 })).toBe('latin-america');
    expect(areaOf({ countryCode: 'US', lat: 0, lon: 0 })).toBe('north-america');
    expect(areaOf({ countryCode: 'CK', lat: 0, lon: 0 })).toBe('east-asia-oceania');
  });

  it('falls back to coordinates for multi-country stories', () => {
    expect(areaOf({ countryCode: 'XX', lat: 9, lon: 7 })).toBe('sub-saharan-africa');
    expect(areaOf({ countryCode: 'XX', lat: 15, lon: -80 })).toBe('latin-america');
  });
});

describe('balancedOrder', () => {
  it('reserves places for small categories and every area ahead of big stories', () => {
    const war = Array.from({ length: 10 }, (_, i) =>
      event({ id: `war${i}`, category: 'conflict', severity: 4, countryCode: 'UA', lat: 50, lon: 30 }),
    );
    const science = event({ id: 'sci', category: 'science', severity: 1 });
    const africa = event({ id: 'ng', category: 'conflict', severity: 1, countryCode: 'NG', lat: 9, lon: 7 });
    const order = balancedOrder([...war, science, africa]).map((e) => e.id);
    const capped = order.slice(0, 5);
    expect(capped).toContain('sci');
    expect(capped).toContain('ng');
  });
});

describe('per-place limit', () => {
  it(`keeps at most ${MAX_PER_PLACE} minor stories per country, never cutting severity 4+`, () => {
    const events = Array.from({ length: 7 }, (_, i) =>
      staged({ headline: `French story number ${i} about a different thing`, lat: 48.85 + i * 0.01 }),
    );
    events.push(staged({ headline: 'Major French event of national consequence', severity: 4 }));
    const { dataset, skippedPerPlace } = finalizeScoped({ events }, null, 'daily', { scope: 'global' });
    expect(dataset.events.length).toBe(MAX_PER_PLACE + 1);
    expect(skippedPerPlace.length).toBe(3);
    expect(dataset.events.some((e) => e.severity === 4)).toBe(true);
  });

  it('does not count multi-country stories', () => {
    const events = Array.from({ length: 6 }, (_, i) =>
      staged({ headline: `Regional story ${i} across several countries`, countryCode: 'XX', locationName: 'Sahel', lat: 15 + i, lon: 0 }),
    );
    const { dataset } = finalizeScoped({ events }, null, 'daily', { scope: 'global' });
    expect(dataset.events.length).toBe(6);
  });
});

describe('cap keeps balance', () => {
  it('a capped scope still holds the lone science story', () => {
    const previous: NewsDataset = {
      generatedAt: NOW,
      mode: 'daily',
      events: [
        ...Array.from({ length: SCOPE_CAPS.global }, (_, i) =>
          event({ id: `c${i}`, category: 'conflict', severity: 3, expiresAt: '2099-01-01T00:00:00.000Z' }),
        ),
        event({ id: 'sci', category: 'science', severity: 1, expiresAt: '2099-01-01T00:00:00.000Z' }),
      ],
    };
    const { dataset } = finalizeScoped({ events: [staged({ category: 'conflict', severity: 3 })] }, previous, 'daily');
    expect(dataset.events.length).toBe(SCOPE_CAPS.global);
    expect(dataset.events.some((e) => e.id === 'sci')).toBe(true);
  });
});

describe('computeHealth', () => {
  it('warns on a thin, lopsided world run', () => {
    const dataset: NewsDataset = {
      generatedAt: NOW,
      mode: 'daily',
      events: [event({ id: 'a' }), event({ id: 'b', firstSeen: '2026-11-03T06:00:00.000Z' })],
    };
    const health = computeHealth(dataset, 'global');
    expect(health.newStories).toBe(1);
    expect(health.updatedStories).toBe(1);
    expect(health.warnings.some((w) => w.includes('new global stories'))).toBe(true);
    expect(health.warnings.some((w) => w.includes('categories'))).toBe(true);
    expect(health.warnings.some((w) => w.includes('world areas'))).toBe(true);
  });

  it('is quiet on a healthy run', () => {
    const coords: Record<string, [string, number, number]> = {
      'north-america': ['US', 38, -77],
      'latin-america': ['BR', -15, -47],
      europe: ['FR', 48, 2],
      mena: ['EG', 30, 31],
      'sub-saharan-africa': ['NG', 9, 7],
      'south-central-asia': ['IN', 28, 77],
      'east-asia-oceania': ['JP', 35, 139],
    };
    const events: NewsEvent[] = [];
    for (let i = 0; i < 21; i++) {
      const [cc, lat, lon] = coords[AREA_IDS[i % AREA_IDS.length]];
      const category = CATEGORIES[i % CATEGORIES.length] as Category;
      events.push(event({ id: `e${i}`, countryCode: cc, lat, lon, category }));
    }
    const health = computeHealth({ generatedAt: NOW, mode: 'daily', events }, 'global');
    expect(health.warnings).toEqual([]);
    expect(health.areasCovered).toBe(7);
  });
});

describe('countExpired', () => {
  it('counts only the run’s own scope', () => {
    const previous: NewsDataset = {
      generatedAt: NOW,
      mode: 'daily',
      events: [event({ id: 'g1' }), event({ id: 'g2' }), event({ id: 'u1', scope: 'us' })],
    };
    const next: NewsDataset = { generatedAt: NOW, mode: 'daily', events: [event({ id: 'g1' })] };
    expect(countExpired(previous, next, 'global')).toBe(1);
    expect(countExpired(previous, next, 'us')).toBe(1);
  });
});

describe('prompts', () => {
  it('spells out the date window', () => {
    expect(dateWindow(new Date(NOW))).toContain('Today is 2026-11-05');
  });

  it('assigns every world beat, including the topic beats', () => {
    const prompt = coordinatorPrompt('/tmp/x.json');
    for (const beat of WORLD_BEATS) expect(prompt).toContain(beat.name);
    expect(WORLD_BEATS.some((beat) => beat.name.startsWith('Science'))).toBe(true);
    expect(WORLD_BEATS.some((beat) => beat.name.startsWith('Climate'))).toBe(true);
  });

  it('lists current stories newest report first', () => {
    const ordered = newestFirst([
      { id: 'old', headline: 'h', locationName: 'x', firstSeen: '2026-11-01T00:00:00Z', lastUpdated: '2026-11-01T00:00:00Z' },
      { id: 'new', headline: 'h', locationName: 'x', firstSeen: '2026-10-01T00:00:00Z', lastUpdated: '2026-11-04T00:00:00Z' },
    ]);
    expect(ordered[0].id).toBe('new');
  });
});
