import { describe, expect, it } from 'vitest';
import { briefingLabel, checkedLabel } from './status';

const now = Date.parse('2026-10-30T09:15:00Z');

describe('briefingLabel', () => {
  it('names today’s briefing by its time', () => {
    expect(briefingLabel({ generatedAt: '2026-10-30T06:06:47Z', mode: 'daily' }, now)).toBe(
      "Today's briefing · 06:06 UTC",
    );
    expect(briefingLabel({ generatedAt: '2026-10-30T08:30:00Z', mode: 'breaking' }, now)).toBe(
      'Breaking update · 08:30 UTC',
    );
  });

  it('names the day when it is not today', () => {
    expect(briefingLabel({ generatedAt: '2026-10-29T06:23:00Z', mode: 'daily' }, now)).toBe(
      'Briefing Thu 29 Oct · 06:23 UTC',
    );
    expect(briefingLabel({ generatedAt: 'nope', mode: 'daily' }, now)).toBe('Briefing');
  });
});

describe('checkedLabel', () => {
  it('reads the last check', () => {
    expect(checkedLabel(null, now)).toBe('');
    expect(checkedLabel(now - 20_000, now)).toBe('checked just now');
    expect(checkedLabel(now - 3 * 60_000, now)).toBe('checked 3 min ago');
    expect(checkedLabel(now - 125 * 60_000, now)).toBe('checked 2 h ago');
  });
});
