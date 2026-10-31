import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { dropReasonKey, reportDropped } from '../src/batch.ts';
import { finalizeDataset } from '../src/finalize.ts';
import { resolveOutletName } from '../src/outlet-names.ts';
import { US_SUBAGENTS, SUBAGENTS, coordinatorPrompt, usCoordinatorPrompt } from '../src/agents.ts';
import {
  normalizeCategory,
  normalizeStagedSources,
  parseStagedOutput,
  StagedEventSchema,
  StagedValidationError,
  type StagedSource,
  validateDataset,
} from '../src/schema.ts';

const fixture = readFileSync(new URL('./fixtures/name-only-sources.json', import.meta.url), 'utf8');

const baseEvent = {
  headline: 'Something significant happened in a specific place today',
  summary:
    'A verified multi-source event summary that is comfortably within limits and describes what happened factually.',
  category: 'politics',
  severity: 3,
  lat: 51.51,
  lon: -0.13,
  locationName: 'London, United Kingdom',
  countryCode: 'GB',
};

const home = (domain: string): StagedSource => ({ url: `https://${domain}/`, homepage: true });

describe('resolveOutletName', () => {
  it.each([
    ['Reuters', 'reuters.com'],
    ['AP News', 'apnews.com'],
    ['The Associated Press', 'apnews.com'],
    ['Agence France-Presse', 'afp.com'],
    ['BBC News', 'bbc.com'],
    ['the guardian', 'theguardian.com'],
    ['The New York Times', 'nytimes.com'],
    ['WSJ', 'wsj.com'],
    ['ABC News', 'abcnews.go.com'],
    ['ABC (Australia)', 'abc.net.au'],
    ['Mail & Guardian', 'mg.co.za'],
    ['El País', 'elpais.com'],
    ['Gulf News', 'gulfnews.com'], // derived from the ratings table
    ['Taipei Times', 'taipeitimes.com'], // derived from the ratings table
    ['Kyiv Independent newspaper', 'kyivindependent.com'],
    ['National Weather Service', 'weather.gov'],
  ])('%s -> %s', (name, domain) => {
    expect(resolveOutletName(name)).toBe(domain);
  });

  it('does not invent outlets', () => {
    expect(resolveOutletName('Springfield Shopper')).toBeUndefined();
    expect(resolveOutletName('National Geographic')).toBeUndefined();
    expect(resolveOutletName('')).toBeUndefined();
  });
});

describe('normalizeStagedSources — outlet names', () => {
  it('recovers name-only strings as homepages', () => {
    expect(normalizeStagedSources(['Reuters', 'AP News'])).toEqual([home('reuters.com'), home('apnews.com')]);
  });

  it('recovers {name} and {outlet, url: ""} objects', () => {
    expect(normalizeStagedSources([{ name: 'Reuters' }])).toEqual([home('reuters.com')]);
    expect(normalizeStagedSources([{ outlet: 'BBC', url: '' }, { publisher: 'Al Jazeera' }])).toEqual([
      home('bbc.com'),
      home('aljazeera.com'),
    ]);
    expect(normalizeStagedSources([{ title: 'Deutsche Welle' }, { domain: 'france24.com' }])).toEqual([
      home('dw.com'),
      home('france24.com'),
    ]);
  });

  it('keeps article URLs and adds names alongside, dropping a homepage the article already covers', () => {
    expect(
      normalizeStagedSources([
        'https://www.reuters.com/world/some-article',
        'Reuters',
        { name: 'BBC News' },
        'Springfield Shopper',
      ]),
    ).toEqual([{ url: 'https://www.reuters.com/world/some-article' }, home('bbc.com')]);
  });

  it('takes a bare domain out of free text', () => {
    expect(normalizeStagedSources(['Some Outlet (examplenews.org)'])).toEqual([home('examplenews.org')]);
    expect(normalizeStagedSources(['see examplenews.org/2026/10/story for details'])).toEqual([
      { url: 'https://examplenews.org/2026/10/story' },
    ]);
    // a known name inside the text wins over guessing
    expect(normalizeStagedSources(['Al Jazeera (aljazeera.com)'])).toEqual([home('aljazeera.com')]);
  });

  it('skips unknown names, and returns nothing when nothing is recovered', () => {
    expect(normalizeStagedSources(['Reuters', 'Local Gazette'])).toEqual([home('reuters.com')]);
    expect(normalizeStagedSources(['Local Gazette', { name: 'Town Crier' }])).toBeUndefined();
  });
});

describe('parseStagedOutput — name-only sources', () => {
  it('keeps a story whose sources are all outlet names', () => {
    const result = parseStagedOutput(
      JSON.stringify({ events: [{ ...baseEvent, sources: [{ outlet: 'BBC', url: '' }, 'Reuters'] }] }),
    );
    expect(result.dropped).toHaveLength(0);
    expect(result.staged.events[0].sources).toEqual([home('bbc.com'), home('reuters.com')]);
  });

  it('still drops a story when no source is recovered', () => {
    const good = { ...baseEvent, sources: ['https://www.reuters.com/x'] };
    const bad = { ...baseEvent, headline: 'Another thing happened somewhere else', sources: ['Local Gazette'] };
    const result = parseStagedOutput(JSON.stringify({ events: [good, bad] }));
    expect(result.staged.events).toHaveLength(1);
    expect(result.dropped).toEqual([expect.objectContaining({ index: 1, sources: ['Local Gazette'] })]);
  });

  it('throws StagedValidationError with the drops when nothing survives', () => {
    const bad = { ...baseEvent, sources: ['Local Gazette'] };
    let caught: unknown;
    try {
      parseStagedOutput(JSON.stringify({ events: [bad] }));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(StagedValidationError);
    expect((caught as StagedValidationError).dropped).toHaveLength(1);
  });

  it('a day of 28 name-only stories goes from 0 kept to 28 kept (live-run regression)', () => {
    const events = (JSON.parse(fixture) as { events: unknown[] }).events;
    expect(events).toHaveLength(28);
    // before outlet names were recovered, salvage left these sources as they
    // were, and the schema rejects every one of them
    expect(events.filter((event) => StagedEventSchema.safeParse(event).success)).toHaveLength(0);

    const result = parseStagedOutput(fixture);
    expect(result.dropped).toEqual([]);
    expect(result.staged.events).toHaveLength(28);
    for (const event of result.staged.events) {
      expect(event.sources.length).toBeGreaterThanOrEqual(2);
      for (const source of event.sources) expect(source).toMatchObject({ homepage: true });
    }
    expect(() => validateDataset(finalizeDataset(result.staged, null, 'daily'))).not.toThrow();
  });
});

describe('finalizeDataset — homepage sources', () => {
  it('carries the homepage flag and rates the outlet by its domain', () => {
    const staged = parseStagedOutput(
      JSON.stringify({
        events: [{ ...baseEvent, sources: ['Reuters', { outlet: 'Sky News' }, 'https://www.bbc.com/news/x'] }],
      }),
    ).staged;
    const dataset = finalizeDataset(staged, null, 'daily');
    expect(() => validateDataset(dataset)).not.toThrow();
    const [event] = dataset.events;
    expect(event.sources).toEqual([
      expect.objectContaining({ url: 'https://reuters.com/', domain: 'reuters.com', reliability: 95, homepage: true }),
      expect.objectContaining({ url: 'https://news.sky.com/', domain: 'sky.com', reliability: 76, homepage: true }),
      expect.objectContaining({ url: 'https://www.bbc.com/news/x', domain: 'bbc.com' }),
    ]);
    expect(event.sources[2].homepage).toBeUndefined();
    expect(event.sources.some((source) => source.unrated)).toBe(false);
    expect(event.trustScore).toBeGreaterThan(0);
  });

  it('prefers an outlet article over its homepage for the same domain', () => {
    const dataset = finalizeDataset(
      {
        events: [
          {
            ...(baseEvent as never),
            sources: [home('reuters.com'), { url: 'https://www.reuters.com/world/story' }],
          },
        ],
      },
      null,
      'daily',
    );
    expect(dataset.events[0].sources).toEqual([
      expect.objectContaining({ url: 'https://www.reuters.com/world/story', domain: 'reuters.com' }),
    ]);
    expect(dataset.events[0].sources[0].homepage).toBeUndefined();
  });

  it('flags a front-page URL the model wrote itself', () => {
    const dataset = finalizeDataset(
      { events: [{ ...(baseEvent as never), sources: [{ url: 'https://www.apnews.com/' }] }] },
      null,
      'daily',
    );
    expect(dataset.events[0].sources[0].homepage).toBe(true);
  });
});

describe('category aliases', () => {
  it.each([
    ['Security', 'conflict'],
    ['terrorism', 'conflict'],
    ['war', 'conflict'],
    ['Environment', 'climate'],
    ['energy', 'economy'],
    ['Business', 'economy'],
    ['markets', 'economy'],
    ['Technology', 'science'],
    ['AI', 'science'],
    ['space', 'science'],
    ['weather', 'disaster'],
    ['Natural Disaster', 'disaster'],
    ['human rights', 'society'],
    ['crime', 'society'],
    ['migration', 'society'],
    ['Elections', 'politics'],
    ['diplomacy', 'politics'],
    ['public health', 'health'],
    ['Politics', 'politics'],
    ['Science & Tech', 'science'],
    ['politics/economy', 'politics'],
  ])('%s -> %s', (raw, category) => {
    expect(normalizeCategory(raw)).toBe(category);
  });

  it('leaves unknown categories alone, so the event is still dropped', () => {
    expect(normalizeCategory('sports')).toBeUndefined();
    const result = parseStagedOutput(
      JSON.stringify({
        events: [
          { ...baseEvent, sources: ['https://www.reuters.com/x'] },
          { ...baseEvent, category: 'sports', sources: ['https://www.reuters.com/y'] },
        ],
      }),
    );
    expect(result.dropped.map((d) => d.index)).toEqual([1]);
  });

  it('salvages an off-list category', () => {
    const result = parseStagedOutput(
      JSON.stringify({ events: [{ ...baseEvent, category: 'Technology', sources: ['https://www.reuters.com/x'] }] }),
    );
    expect(result.staged.events[0].category).toBe('science');
  });
});

describe('dropped-event diagnostics', () => {
  it('groups reasons across source indices', () => {
    expect(dropReasonKey('sources.0: Invalid input; sources.1: Invalid input')).toBe('sources.*: Invalid input');
  });

  it('keeps the raw staged file and logs one example per reason', () => {
    const dir = mkdtempSync(join(tmpdir(), 'globenews-rejected-'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const raw = '{"events": []}';
      const path = reportDropped(
        'daily',
        'events',
        raw,
        [
          { index: 2, reason: 'sources.0: Invalid input', sources: ['Local Gazette'] },
          { index: 5, reason: 'sources.0: Invalid input; sources.1: Invalid input', sources: ['x'.repeat(500)] },
          { index: 7, reason: 'category: Invalid option', sources: ['https://a.example/x'] },
        ],
        dir,
      );
      expect(path).toMatch(/\d{4}-\d{2}-\d{2}\.rejected\.json$/);
      expect(readFileSync(path!, 'utf8')).toBe(raw);
      const lines = warn.mock.calls.map((call) => String(call[0]));
      const examples = lines.filter((line) => line.includes('— e.g.'));
      expect(examples).toHaveLength(2);
      expect(examples[0]).toContain('2× sources.*: Invalid input');
      expect(examples[0]).toContain('["Local Gazette"]');
      expect(examples[1]).toContain('category: Invalid option');

      expect(reportDropped('us', 'us', raw, [{ index: 0, reason: 'x' }], dir)).toMatch(/-us\.rejected\.json$/);
      expect(reportDropped('daily', 'events', raw, [], dir)).toBeUndefined();
    } finally {
      warn.mockRestore();
    }
  });
});

describe('prompt guard rails', () => {
  it('both synthesizers and coordinators require https source URLs', () => {
    for (const prompt of [SUBAGENTS.synthesizer.prompt, US_SUBAGENTS.synthesizer.prompt]) {
      expect(prompt).toContain('homepage URL');
      expect(prompt).toContain('NEVER write a\n   bare outlet name');
    }
    for (const prompt of [coordinatorPrompt('/tmp/x.json'), usCoordinatorPrompt('/tmp/x.json')]) {
      expect(prompt).toContain('every source has a "url" starting with https://');
    }
  });
});
