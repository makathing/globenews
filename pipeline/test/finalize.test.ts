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

// ————— retention: what one run keeps from the last —————

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NewsDataset } from '../../shared/news.ts';
import { computeStats } from '../src/finalize.ts';

/** The same dataset as if it had been produced `hours` ago. */
function shift(dataset: NewsDataset, hours: number): NewsDataset {
  const back = (iso: string) => new Date(Date.parse(iso) - hours * 3_600_000).toISOString();
  return {
    ...dataset,
    generatedAt: back(dataset.generatedAt),
    events: dataset.events.map((event) => ({
      ...event,
      firstSeen: back(event.firstSeen),
      lastUpdated: back(event.lastUpdated),
      ...(event.expiresAt ? { expiresAt: back(event.expiresAt) } : {}),
    })),
  };
}

describe('finalizeDataset retention', () => {
  const first = finalizeDataset(MOCK_STAGED, null, 'daily');
  const ceasefire = first.events.find((event) => event.headline.startsWith('Ceasefire'))!;

  it('stamps every event with a severity-scaled expiry', () => {
    for (const event of first.events) {
      const hours = (Date.parse(event.expiresAt!) - Date.parse(event.lastUpdated)) / 3_600_000;
      expect(hours).toBe({ 1: 24, 2: 36, 3: 48, 4: 96, 5: 168 }[event.severity]);
    }
  });

  it('carries every unexpired story through a run that did not mention it', () => {
    const later = finalizeDataset({ events: [] }, shift(first, 10), 'daily');
    expect(later.events).toHaveLength(first.events.length);
    for (const event of later.events) {
      const before = shift(first, 10).events.find((e) => e.id === event.id)!;
      expect(event.lastUpdated).toBe(before.lastUpdated);
      expect(event.firstSeen).toBe(before.firstSeen);
      expect(event.summary).toBe(before.summary);
    }
    expect(() => validateDataset(later)).not.toThrow();
  });

  it('lets stories go when their lifetime runs out, shortest first', () => {
    const later = finalizeDataset({ events: [] }, shift(first, 40), 'daily');
    const survivors = first.events.filter((event) => event.severity >= 3);
    expect(later.events.map((e) => e.id).sort()).toEqual(survivors.map((e) => e.id).sort());
    expect(finalizeDataset({ events: [] }, shift(first, 200), 'daily').events).toHaveLength(0);
  });

  it('treats a reworded follow-up as an update: same id, same added time, new clock', () => {
    const previous = shift(first, 10);
    const staged = {
      events: [
        {
          ...MOCK_STAGED.events[0],
          headline: 'Ceasefire talks resume as shelling continues near eastern frontline towns',
          sources: [{ url: 'https://www.theguardian.com/world/sample-ceasefire' }],
        },
      ],
    };
    const later = finalizeDataset(staged, previous, 'daily');
    const updated = later.events.find((e) => e.id === ceasefire.id)!;
    expect(updated).toBeDefined();
    expect(updated.headline).toMatch(/^Ceasefire talks/);
    expect(updated.firstSeen).toBe(previous.events.find((e) => e.id === ceasefire.id)!.firstSeen);
    expect(updated.lastUpdated).toBe(later.generatedAt);
    expect(Date.parse(updated.expiresAt!)).toBeGreaterThan(Date.parse(ceasefire.expiresAt!) - 1);
    // the outlets that reported the earlier chapter stay, the new one leads
    expect(updated.sources[0].domain).toBe('theguardian.com');
    expect(updated.sources.map((s) => s.domain)).toEqual(
      expect.arrayContaining(ceasefire.sources.map((s) => s.domain)),
    );
    // and no stale copy of the story is left behind
    expect(later.events.filter((e) => e.headline.startsWith('Ceasefire'))).toHaveLength(1);
  });

  it('honours the synthesizer naming the story it continues', () => {
    const previous = shift(first, 10);
    const staged = {
      events: [
        {
          ...MOCK_STAGED.events[0],
          headline: 'Prisoner exchange completed under new humanitarian corridor agreement',
          updates: ceasefire.id,
        },
      ],
    };
    const later = finalizeDataset(staged, previous, 'daily');
    const updated = later.events.find((e) => e.id === ceasefire.id)!;
    expect(updated.headline).toMatch(/^Prisoner exchange/);
    expect(later.events).toHaveLength(first.events.length);
  });

  it('clears the breaking flag on carried stories in a daily run, keeps it for the monitor', () => {
    const previous = shift(first, 2);
    previous.events[0].isBreaking = true;
    const daily = finalizeDataset({ events: [] }, previous, 'daily');
    expect(daily.events.find((e) => e.id === previous.events[0].id)!.isBreaking).toBe(false);
    const breaking = finalizeDataset({ events: [] }, previous, 'breaking', { markBreaking: true });
    expect(breaking.events.find((e) => e.id === previous.events[0].id)!.isBreaking).toBe(true);
  });

  it('can still replace wholesale when asked', () => {
    const later = finalizeDataset({ events: [MOCK_STAGED.events[1]] }, shift(first, 10), 'daily', {
      retain: false,
    });
    expect(later.events).toHaveLength(1);
  });

  it('counts what a run carried and updated', () => {
    const previous = shift(first, 10);
    const later = finalizeDataset({ events: [MOCK_STAGED.events[0]] }, previous, 'daily');
    const stats = computeStats(later);
    expect(stats.updated).toBe(1);
    expect(stats.carried).toBe(first.events.length - 1);
  });

  it('still validates the dataset shipped before retention existed', () => {
    const shipped = JSON.parse(readFileSync(resolve(__dirname, '../../data/events.json'), 'utf8'));
    expect(() => validateDataset(shipped)).not.toThrow();
  });
});
