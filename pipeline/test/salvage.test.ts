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

describe('isNonRetryable (live-run regression)', () => {
  it('classifies account/limit errors as non-retryable, transient ones as retryable', async () => {
    const { isNonRetryable } = await import('../src/io.ts');
    expect(isNonRetryable("You've hit your session limit · resets 7:50pm (UTC)")).toBe(true);
    expect(isNonRetryable('error_max_budget_usd')).toBe(true);
    expect(isNonRetryable('rate limit exceeded')).toBe(true);
    expect(isNonRetryable('Synthesizer never wrote the staging file.')).toBe(false);
  });
});

describe('normalizeStagedSources (live-run regression)', () => {
  it('coerces strings, markdown links, and alt-keyed objects to {url}', async () => {
    const { normalizeStagedSources } = await import('../src/schema.ts');
    expect(
      normalizeStagedSources([
        'https://www.reuters.com/a',
        '[Reuters](https://www.reuters.com/b)',
        'apnews.com/article/x',
        { link: 'https://www.bbc.com/c' },
        { href: 'https://www.dw.com/d' },
        { source: 'Reuters' },
        42,
      ]),
    ).toEqual([
      { url: 'https://www.reuters.com/a' },
      { url: 'https://www.reuters.com/b' },
      { url: 'https://apnews.com/article/x' },
      { url: 'https://www.bbc.com/c' },
      { url: 'https://www.dw.com/d' },
    ]);
    expect(normalizeStagedSources(['not a url at all'])).toBeUndefined();
    expect(normalizeStagedSources('nope')).toBeUndefined();
  });

  it('salvages an event whose sources are bare URL strings', async () => {
    const { parseStagedOutput } = await import('../src/schema.ts');
    const event = {
      headline: 'A perfectly valid headline about a real place',
      summary: 'A verified multi-source event summary that is comfortably within limits and factual.',
      category: 'economy',
      severity: 2,
      lat: 1,
      lon: 2,
      locationName: 'Testville, Testland',
      countryCode: 'TL',
      sources: ['https://www.reuters.com/x', 'www.ft.com/y'],
    };
    const result = parseStagedOutput(JSON.stringify({ events: [event] }));
    expect(result.staged.events).toHaveLength(1);
    expect(result.staged.events[0].sources).toHaveLength(2);
  });
});

describe('severity coercion (live-run regression)', () => {
  it('maps word and numeric-string severities onto 1-5', async () => {
    const { parseStagedOutput } = await import('../src/schema.ts');
    const base = {
      headline: 'A perfectly valid headline about a real place',
      summary: 'A verified multi-source event summary that is comfortably within limits and factual.',
      category: 'conflict',
      lat: 1,
      lon: 2,
      locationName: 'Testville, Testland',
      countryCode: 'TL',
      sources: [{ url: 'https://www.reuters.com/x' }],
    };
    const result = parseStagedOutput(
      JSON.stringify({
        events: [
          { ...base, severity: 'high' },
          { ...base, headline: base.headline + ' two', severity: '2' },
          { ...base, headline: base.headline + ' three', severity: 'catastrophic-unknown' },
        ],
      }),
    );
    expect(result.staged.events.map((e) => e.severity)).toEqual([4, 2, 3]);
  });
});

describe('severity defaulting is reported, not silent', () => {
  // The bug this guards: a live run's synthesizer omitted `severity` on every
  // event. Each one quietly became a 3, the run reported success, and the
  // globe rendered 19 identical beams. The default is fine; being unable to
  // see that it fired is not.
  const event = (extra: Record<string, unknown> = {}) => ({
    headline: 'A sufficiently long and neutral headline for validation',
    summary:
      'A factual two sentence summary that comfortably clears the minimum length the schema asks for. It says what happened and where.',
    category: 'politics',
    lat: 51.5,
    lon: -0.12,
    locationName: 'London, United Kingdom',
    countryCode: 'GB',
    sources: [{ url: 'https://www.bbc.co.uk/news/example-1' }],
    ...extra,
  });

  it('counts an event that had no usable severity', () => {
    const raw = JSON.stringify({ events: [event()] });
    const result = parseStagedOutput(raw);
    expect(result.staged.events).toHaveLength(1);
    expect(result.staged.events[0].severity).toBe(3);
    expect(result.severityDefaulted).toBe(1);
  });

  it('does not count events that carried their own severity', () => {
    const raw = JSON.stringify({ events: [event({ severity: 5 }), event({ severity: 'high' })] });
    const result = parseStagedOutput(raw);
    expect(result.staged.events.map((e) => e.severity)).toEqual([5, 4]);
    expect(result.severityDefaulted).toBe(0);
  });

  it('reports the whole batch when the field is missing everywhere', () => {
    const raw = JSON.stringify({ events: [event(), event(), event()] });
    expect(parseStagedOutput(raw).severityDefaulted).toBe(3);
  });
});
