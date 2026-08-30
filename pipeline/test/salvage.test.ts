import { describe, expect, it } from 'vitest';
import { parseStagedOutput, truncateText } from '../src/schema.ts';

const validEvent = {
  headline: 'Something significant happened in a specific place today',
  summary:
    'A verified multi-source event summary that is comfortably within limits and describes what happened factually.',
  category: 'politics',
  severity: 3,
  lat: 10,
  lon: 20,
  locationName: 'Testville, Testland',
  countryCode: 'TL',
  sources: [{ url: 'https://www.reuters.com/x' }, { url: 'https://www.bbc.com/y' }],
};

describe('truncateText', () => {
  it('leaves short text alone', () => {
    expect(truncateText('short.', 100)).toBe('short.');
  });
  it('prefers sentence boundaries', () => {
    const text = 'First sentence is long enough to matter. Second sentence overflows the limit for sure.';
    const out = truncateText(text, 60);
    expect(out).toBe('First sentence is long enough to matter.');
  });
  it('falls back to word boundary with ellipsis', () => {
    const out = truncateText('word '.repeat(50).trim(), 42);
    expect(out.length).toBeLessThanOrEqual(42);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('parseStagedOutput (salvage)', () => {
  it('passes clean output through untouched', () => {
    const result = parseStagedOutput(JSON.stringify({ events: [validEvent] }));
    expect(result.staged.events).toHaveLength(1);
    expect(result.repaired).toBe(0);
    expect(result.dropped).toHaveLength(0);
  });

  it('repairs an over-long summary instead of failing the batch (live-run regression)', () => {
    const overlong = { ...validEvent, summary: 'A sentence here. '.repeat(45) };
    expect(overlong.summary.length).toBeGreaterThan(600);
    const result = parseStagedOutput(JSON.stringify({ events: [validEvent, overlong] }));
    expect(result.staged.events).toHaveLength(2);
    expect(result.repaired).toBe(1);
    expect(result.staged.events[1].summary.length).toBeLessThanOrEqual(590);
  });

  it('clamps out-of-range severity and defaults bad countryCode', () => {
    const wonky = { ...validEvent, severity: 7, countryCode: 'Testland' };
    const result = parseStagedOutput(JSON.stringify({ events: [wonky] }));
    expect(result.staged.events[0].severity).toBe(5);
    expect(result.staged.events[0].countryCode).toBe('XX');
    expect(result.repaired).toBe(1);
  });

  it('drops individually-broken events, keeps the rest', () => {
    const broken = { ...validEvent, lat: 999, sources: [] };
    const result = parseStagedOutput(JSON.stringify({ events: [validEvent, broken] }));
    expect(result.staged.events).toHaveLength(1);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0].reason).toContain('lat');
  });

  it('throws when nothing survives', () => {
    expect(() => parseStagedOutput(JSON.stringify({ events: [{ nonsense: true }] }))).toThrow(
      /No staged events survived/,
    );
    expect(() => parseStagedOutput('{"notEvents": []}')).toThrow(/no "events" array/);
  });
});
