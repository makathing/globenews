import { describe, expect, it } from 'vitest';
import { readUrlState, writeUrlState } from './urlParams';

describe('readUrlState', () => {
  it('reads valid params', () => {
    expect(readUrlState('?event=abc&region=us&date=2026-10-20')).toEqual({
      event: 'abc',
      region: 'us',
      date: '2026-10-20',
    });
  });

  it('drops invalid values', () => {
    expect(readUrlState('?region=mars&date=yesterday&event=')).toEqual({ event: null, region: null, date: null });
    expect(readUrlState('?region=world')).toEqual({ event: null, region: null, date: null });
    expect(readUrlState('')).toEqual({ event: null, region: null, date: null });
  });
});

describe('writeUrlState', () => {
  const base = 'https://example.org/globenews/?utm=x#top';

  it('sets, keeps and removes params', () => {
    const withRegion = writeUrlState(base, { region: 'europe', date: '2026-10-20' });
    expect(withRegion).toBe('/globenews/?utm=x&region=europe&date=2026-10-20#top');
    const withEvent = writeUrlState(`https://example.org${withRegion}`, { event: 'id1' });
    expect(withEvent).toBe('/globenews/?utm=x&region=europe&date=2026-10-20&event=id1#top');
    const cleared = writeUrlState(`https://example.org${withEvent}`, { region: 'world', date: null, event: null });
    expect(cleared).toBe('/globenews/?utm=x#top');
  });

  it('leaves params it was not given alone', () => {
    expect(writeUrlState('https://e.org/?event=a&region=us', { date: '2026-10-01' })).toBe(
      '/?event=a&region=us&date=2026-10-01',
    );
  });
});
