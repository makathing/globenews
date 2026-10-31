import { describe, expect, it } from 'vitest';
import { buildArchiveIndex, indexEntry, planArchive } from './archive-index.mjs';

describe('planArchive', () => {
  it('keeps daily snapshots only, newest first, skipping -us files and junk', () => {
    const plan = planArchive([
      '2026-10-28.json',
      '2026-10-30-us.json',
      '2026-10-30.json',
      'README.md',
      '2026-13-45.json',
      '2026-10-29.json.bak',
      '2026-10-29.json',
    ]);
    expect(plan).toEqual([
      { date: '2026-10-30', file: '2026-10-30.json' },
      { date: '2026-10-29', file: '2026-10-29.json' },
      { date: '2026-10-28', file: '2026-10-28.json' },
    ]);
  });

  it('keeps the last maxDays relative to the newest snapshot', () => {
    const plan = planArchive(['2026-10-30.json', '2026-10-01.json', '2026-09-30.json', '2026-08-30.json'], {
      maxDays: 30,
    });
    expect(plan.map((p) => p.date)).toEqual(['2026-10-30', '2026-10-01']);
    expect(planArchive([])).toEqual([]);
  });
});

describe('index', () => {
  it('summarises valid datasets and drops the rest', () => {
    const good = { generatedAt: '2026-10-30T06:06:47.664Z', mode: 'daily', events: [{}, {}] };
    expect(indexEntry('2026-10-30', good)).toEqual({
      date: '2026-10-30',
      count: 2,
      generatedAt: '2026-10-30T06:06:47.664Z',
    });
    expect(indexEntry('2026-10-30', { events: 'x' })).toBeNull();
    expect(indexEntry('2026-10-30', { events: [], generatedAt: 'soon' })).toBeNull();
    expect(indexEntry('2026-10-30', null)).toBeNull();
    const index = buildArchiveIndex([
      indexEntry('2026-10-28', good),
      null,
      indexEntry('2026-10-30', good),
    ]);
    expect(index.days.map((d) => d.date)).toEqual(['2026-10-30', '2026-10-28']);
  });
});
