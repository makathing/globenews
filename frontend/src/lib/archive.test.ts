import { describe, expect, it } from 'vitest';
import { dayLabel, isDataset, isValidDate, longDayLabel, parseArchiveIndex } from './archive';

describe('archive index', () => {
  it('validates, de-duplicates and sorts newest first', () => {
    const days = parseArchiveIndex({
      days: [
        { date: '2026-10-28', count: 28, generatedAt: '2026-10-28T06:07:17Z' },
        { date: '2026-10-30', count: 44, generatedAt: '2026-10-30T06:06:47Z' },
        { date: '2026-10-30', count: 1, generatedAt: 'dup' },
        { date: '2026-02-30', count: 3, generatedAt: 'x' },
        { date: '../../etc', count: 3, generatedAt: 'x' },
        { date: '2026-10-29', count: '40', generatedAt: 'x' },
        null,
      ],
    });
    expect(days.map((d) => d.date)).toEqual(['2026-10-30', '2026-10-28']);
    expect(days[0].count).toBe(44);
  });

  it('returns nothing for junk', () => {
    expect(parseArchiveIndex(null)).toEqual([]);
    expect(parseArchiveIndex({ days: 'no' })).toEqual([]);
    expect(parseArchiveIndex([])).toEqual([]);
  });
});

describe('dates', () => {
  it('accepts real calendar days only', () => {
    expect(isValidDate('2026-10-30')).toBe(true);
    expect(isValidDate('2026-02-29')).toBe(false);
    expect(isValidDate('2026-10-30T00:00')).toBe(false);
    expect(isValidDate(20261030)).toBe(false);
  });

  it('labels days relative to today', () => {
    expect(dayLabel('2026-10-31', '2026-10-31')).toBe('Today');
    expect(dayLabel('2026-10-30', '2026-10-31')).toBe('Yesterday');
    expect(dayLabel('2026-10-27', '2026-10-31')).toBe('Tue 27 Oct');
    expect(dayLabel('2026-02-28', '2026-03-01')).toBe('Yesterday');
    expect(longDayLabel('2026-10-30')).toBe('Fri 30 Oct');
  });

  it('recognises a dataset', () => {
    expect(isDataset({ generatedAt: 'x', events: [] })).toBe(true);
    expect(isDataset({ events: [] })).toBe(false);
    expect(isDataset(null)).toBe(false);
  });
});
