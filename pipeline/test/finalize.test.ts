import { describe, expect, it } from 'vitest';
import { finalizeDataset, stableEventId } from '../src/finalize.ts';
import { MOCK_STAGED } from '../src/mock-data.ts';
import { validateDataset } from '../src/schema.ts';

describe('finalizeDataset', () => {
  it('produces a schema-valid dataset from mock staged events', () => {
    const dataset = finalizeDataset(MOCK_STAGED, null, 'daily');
    expect(() => validateDataset(dataset)).not.toThrow();
    expect(dataset.events.length).toBe(MOCK_STAGED.events.length);
    expect(dataset.mode).toBe('daily');
  });

  it('computes trust scores and rates every source', () => {
    const dataset = finalizeDataset(MOCK_STAGED, null, 'daily');
    for (const event of dataset.events) {
      expect(event.trustScore).toBeGreaterThan(0);
      for (const source of event.sources) {
        expect(source.reliability).toBeGreaterThan(0);
        expect(source.domain).not.toMatch(/^www\./);
      }
    }
  });

  it('carries firstSeen over from a previous dataset by stable id', () => {
    const first = finalizeDataset(MOCK_STAGED, null, 'daily');
    const later = finalizeDataset(MOCK_STAGED, first, 'daily');
    expect(later.events[0].firstSeen).toBe(first.events[0].firstSeen);
  });

  it('snaps far-off coordinates to the gazetteer by location name', () => {
    const staged = {
      events: [
        {
          ...MOCK_STAGED.events[0],
          locationName: 'Tokyo, Japan',
          lat: 0,
          lon: 0,
        },
      ],
    };
    const dataset = finalizeDataset(staged, null, 'daily');
    expect(dataset.events[0].lat).toBeCloseTo(35.68, 1);
    expect(dataset.events[0].countryCode).toBe('JP');
  });

  it('marks breaking events when asked', () => {
    const dataset = finalizeDataset(MOCK_STAGED, null, 'breaking', { markBreaking: true });
    expect(dataset.events.every((event) => event.isBreaking)).toBe(true);
  });

  it('stable ids are deterministic', () => {
    expect(stableEventId('Some Headline', 10.2, 20.4)).toBe(stableEventId('Some Headline', 10.2, 20.4));
  });
});

describe('per-source preview images', () => {
  it('carries resolved source images forward by URL across runs', () => {
    const first = finalizeDataset(MOCK_STAGED, null, 'daily');
    // simulate enrichment having resolved images for two of the first event's sources
    first.events[0].sources[0].image = 'https://cdn.example.com/a.jpg';
    first.events[0].sources[1].image = 'https://cdn.example.com/b.jpg';

    const second = finalizeDataset(MOCK_STAGED, first, 'daily');
    const carried = second.events.find((e) => e.id === first.events[0].id)!;
    expect(carried.sources[0].image).toBe('https://cdn.example.com/a.jpg');
    expect(carried.sources[1].image).toBe('https://cdn.example.com/b.jpg');
    // sources that never had one stay empty
    expect(carried.sources[2]?.image).toBeUndefined();
  });
});
