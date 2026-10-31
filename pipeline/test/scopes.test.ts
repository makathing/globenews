import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { NewsDataset, NewsEvent } from '../../shared/news.ts';
import { finalizeDataset, finalizeScoped, keepInRegion, remergeScope, SCOPE_CAPS } from '../src/finalize.ts';
import { MOCK_STAGED, MOCK_US_STAGED } from '../src/mock-data.ts';
import { validateDataset } from '../src/schema.ts';

const HOUR = 3_600_000;
const iso = (offsetHours: number) => new Date(Date.now() + offsetHours * HOUR).toISOString();

/** The committed dataset with its clock moved to now, so nothing in it has expired. */
function shippedDataset(): NewsDataset {
  const raw = JSON.parse(readFileSync(resolve(__dirname, '../../data/events.json'), 'utf8')) as NewsDataset;
  // move the clock so the soonest expiry is an hour from now
  const soonest = Math.min(...raw.events.map((event) => Date.parse(event.expiresAt ?? raw.generatedAt)));
  const delta = Date.now() + HOUR - soonest;
  const move = (value: string) => new Date(Date.parse(value) + delta).toISOString();
  return validateDataset({
    ...raw,
    generatedAt: move(raw.generatedAt),
    events: raw.events.map((event) => ({
      ...event,
      firstSeen: move(event.firstSeen),
      lastUpdated: move(event.lastUpdated),
      ...(event.expiresAt ? { expiresAt: move(event.expiresAt) } : {}),
    })),
  });
}

const globalRun = () => finalizeDataset(MOCK_STAGED, null, 'daily');
const usRun = (previous: NewsDataset | null = null) =>
  finalizeScoped(MOCK_US_STAGED, previous, 'daily', { scope: 'us' });

function synthetic(count: number, scope: 'global' | 'us'): NewsEvent[] {
  const base = globalRun().events[0];
  return Array.from({ length: count }, (_, index) => ({
    ...base,
    id: `${scope}-${index}`,
    headline: `${scope} synthetic story number ${index}`,
    severity: ((index % 5) + 1) as 1 | 2 | 3 | 4 | 5,
    lastUpdated: iso(-1),
    expiresAt: iso(10),
    ...(scope === 'us' ? { scope: 'us' as const, countryCode: 'US', subdivision: 'US-TX' } : {}),
  }));
}

describe('the US run over the shipped dataset (mock)', () => {
  const previous = shippedDataset();
  const { kept } = keepInRegion(MOCK_US_STAGED, 'US');
  const { dataset } = finalizeScoped(kept, previous, 'daily', { scope: 'us' });
  const globals = dataset.events.filter((event) => !event.scope);
  const us = dataset.events.filter((event) => event.scope === 'us');

  it('adds the US stories, each with a state', () => {
    expect(us).toHaveLength(MOCK_US_STAGED.events.length);
    for (const event of us) {
      expect(event.countryCode).toBe('US');
      expect(event.subdivision).toMatch(/^US-[A-Z]{2}$/);
    }
    // the one mock story without a subdivision gets it from the gazetteer
    expect(us.find((event) => event.locationName.startsWith('Boulder'))!.subdivision).toBe('US-CO');
    expect(() => validateDataset(dataset)).not.toThrow();
  });

  it('leaves every global story byte-identical', () => {
    expect(globals).toHaveLength(previous.events.length);
    const before = new Map(previous.events.map((event) => [event.id, JSON.stringify(event)]));
    for (const event of globals) expect(JSON.stringify(event)).toBe(before.get(event.id));
  });

  it('is stable when run twice: the second run updates its own stories only', () => {
    const second = usRun(dataset).dataset;
    expect(second.events.filter((event) => event.scope === 'us')).toHaveLength(us.length);
    const firstSeen = new Map(us.map((event) => [event.id, event.firstSeen]));
    for (const event of second.events.filter((e) => e.scope === 'us')) {
      expect(event.firstSeen).toBe(firstSeen.get(event.id));
    }
    expect(second.events.filter((event) => !event.scope)).toEqual(globals);
  });
});

describe('scoped finalize', () => {
  it('writes no scope key on global stories and scope "us" on US stories', () => {
    expect(globalRun().events.every((event) => !('scope' in event))).toBe(true);
    expect(usRun().dataset.events.every((event) => event.scope === 'us')).toBe(true);
  });

  it('drops a US staged story that the world desk already has (named, exact or fuzzy)', () => {
    const world = globalRun();
    const target = world.events[0];
    const stagedLike = MOCK_STAGED.events.find((event) => event.headline === target.headline)!;
    for (const staged of [
      { ...MOCK_US_STAGED.events[0], updates: target.id },
      { ...stagedLike },
    ]) {
      const { dataset, skippedCrossScope } = finalizeScoped({ events: [staged] }, world, 'daily', { scope: 'us' });
      expect(skippedCrossScope).toHaveLength(1);
      expect(dataset.events.filter((event) => event.scope === 'us')).toHaveLength(0);
      expect(dataset.events).toHaveLength(world.events.length);
    }
  });

  it('the global run never edits or duplicates a US story', () => {
    const us = usRun().dataset;
    const target = us.events[0];
    const stagedUs = MOCK_US_STAGED.events.find((event) => event.headline === target.headline)!;
    const { dataset, skippedCrossScope } = finalizeScoped(
      { events: [{ ...stagedUs, summary: 'A rewritten summary that must never reach the US story.' }] },
      us,
      'daily',
    );
    expect(skippedCrossScope).toEqual([stagedUs.headline]);
    expect(dataset.events).toEqual(us.events);
  });

  it('caps each scope on its own, so neither run can evict the other', () => {
    const previous: NewsDataset = {
      generatedAt: iso(-1),
      mode: 'daily',
      events: [...synthetic(130, 'global'), ...synthetic(50, 'us')],
    };
    for (const scope of ['global', 'us'] as const) {
      const { dataset } = finalizeScoped({ events: [] }, previous, 'daily', { scope });
      expect(dataset.events.filter((event) => !event.scope)).toHaveLength(SCOPE_CAPS.global);
      expect(dataset.events.filter((event) => event.scope === 'us')).toHaveLength(SCOPE_CAPS.us);
      expect(() => validateDataset(dataset)).not.toThrow();
    }
    // a full US run leaves a full global set untouched
    const full: NewsDataset = { ...previous, events: synthetic(120, 'global') };
    const { dataset } = finalizeScoped(MOCK_US_STAGED, full, 'daily', { scope: 'us' });
    expect(dataset.events.filter((event) => !event.scope)).toHaveLength(120);
  });

  it('every run drops other-scope stories once expired, and only then', () => {
    const live = synthetic(2, 'global');
    const expired = { ...live[1], id: 'gone', expiresAt: iso(-0.5) };
    const previous: NewsDataset = { generatedAt: iso(-1), mode: 'daily', events: [live[0], expired] };
    const { dataset } = finalizeScoped({ events: [] }, previous, 'daily', { scope: 'us' });
    expect(dataset.events.map((event) => event.id)).toEqual([live[0].id]);
    expect(dataset.events[0]).toBe(live[0]);
  });

  it('clears isBreaking only on its own scope', () => {
    const globalStory = { ...synthetic(1, 'global')[0], isBreaking: true };
    const usStory = { ...synthetic(1, 'us')[0], isBreaking: true };
    const previous: NewsDataset = { generatedAt: iso(-1), mode: 'breaking', events: [globalStory, usStory] };
    const afterUs = finalizeDataset({ events: [] }, previous, 'daily', { scope: 'us' });
    expect(afterUs.events.find((e) => e.id === globalStory.id)!.isBreaking).toBe(true);
    expect(afterUs.events.find((e) => e.id === usStory.id)!.isBreaking).toBe(false);
    const afterGlobal = finalizeDataset({ events: [] }, previous, 'daily');
    expect(afterGlobal.events.find((e) => e.id === globalStory.id)!.isBreaking).toBe(false);
    expect(afterGlobal.events.find((e) => e.id === usStory.id)!.isBreaking).toBe(true);
  });

  it('fills subdivision for US stories in the global run too', () => {
    const staged = { ...MOCK_STAGED.events[0], locationName: 'Harrisburg, Pennsylvania, USA', lat: 40.27, lon: -76.88, countryCode: 'US' };
    const event = finalizeDataset({ events: [staged] }, null, 'daily').events[0];
    expect(event.subdivision).toBe('US-PA');
    expect('scope' in event).toBe(false);
  });

  it('prefers the state the place name says over a wrong model subdivision', () => {
    const staged = { ...MOCK_US_STAGED.events[0], subdivision: 'US-OK' };
    expect(finalizeScoped({ events: [staged] }, null, 'daily', { scope: 'us' }).dataset.events[0].subdivision).toBe('US-TX');
  });

  it('keepInRegion drops staged events outside the US', () => {
    const { kept, dropped } = keepInRegion({ events: [...MOCK_US_STAGED.events, MOCK_STAGED.events[1]] }, 'US');
    expect(kept.events).toHaveLength(MOCK_US_STAGED.events.length);
    expect(dropped).toHaveLength(1);
  });
});

describe('remergeScope', () => {
  it('takes my scope from my result and everything else from the fresh file', () => {
    const mine = usRun(globalRun()).dataset;
    // meanwhile the daily batch published a different world
    const fresh = finalizeDataset({ events: MOCK_STAGED.events.slice(2) }, null, 'daily');
    const merged = remergeScope(fresh, mine, 'us');
    expect(merged.events.filter((e) => e.scope === 'us').map((e) => e.id).sort()).toEqual(
      mine.events.filter((e) => e.scope === 'us').map((e) => e.id).sort(),
    );
    expect(merged.events.filter((e) => !e.scope).map((e) => e.id).sort()).toEqual(
      fresh.events.map((e) => e.id).sort(),
    );
    expect(merged.generatedAt).toBe(mine.generatedAt);
    expect(() => validateDataset(merged)).not.toThrow();
  });

  it('ignores my stale copy of the other scope and fresh copies of my own', () => {
    const mine = usRun(globalRun()).dataset;
    const fresh: NewsDataset = { ...mine, events: [...synthetic(3, 'us'), ...synthetic(2, 'global')] };
    const merged = remergeScope(fresh, mine, 'us');
    expect(merged.events.some((e) => e.id.startsWith('us-'))).toBe(false);
    expect(merged.events.filter((e) => !e.scope).map((e) => e.id).sort()).toEqual(['global-0', 'global-1']);
  });

  it('lets a fresh other-scope story win an id collision, and copes with no fresh file', () => {
    const mine = usRun().dataset;
    const clash = { ...synthetic(1, 'global')[0], id: mine.events[0].id };
    const merged = remergeScope({ ...mine, events: [clash] }, mine, 'us');
    expect(merged.events.filter((e) => e.id === clash.id)).toEqual([clash]);
    expect(remergeScope(null, mine, 'us').events).toHaveLength(mine.events.length);
  });
});
