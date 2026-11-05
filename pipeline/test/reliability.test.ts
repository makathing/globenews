import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { originOf, UNATTRIBUTED_WIRE } from '../src/syndication.ts';
import { computeTrustScore, independentReports } from '../src/trust.ts';
import { DEFAULT_CORRECTION, finalizeScoped, isStale } from '../src/finalize.ts';
import { normalizePublished, normalizeStagedSources, parseStagedOutput } from '../src/schema.ts';
import type { NewsDataset, NewsSource } from '../../shared/news.ts';
import type { StagedEvent } from '../src/schema.ts';

const src = (url: string, reliability: number, bias: NewsSource['bias'], extra: Partial<NewsSource> = {}): NewsSource => ({
  url,
  domain: new URL(url).hostname.replace(/^www\./, ''),
  reliability,
  bias,
  ...extra,
});

describe('originOf', () => {
  it('attributes wire copy to its wire', () => {
    expect(originOf('https://apnews.com/article/abc')).toBe('apnews.com');
    expect(originOf('https://www.wsmv.com/2026/11/04/ap-storm-hits-coast/')).toBe('apnews.com');
    expect(originOf('https://www.timesofisrael.com/liveblog_entry/reuters-ceasefire/')).toBe('reuters.com');
    expect(originOf('https://www.france24.com/en/live-news/20261104-afp-quake')).toBe('afp.com');
  });

  it('folds unattributed aggregator copy into one origin', () => {
    expect(originOf('https://www.yahoo.com/news/storm-hits-coast-120000123.html')).toBe(UNATTRIBUTED_WIRE);
    expect(originOf('https://www.usnews.com/news/world/articles/2026-11-04/storm')).toBe(UNATTRIBUTED_WIRE);
  });

  it('leaves an outlet’s own reporting alone', () => {
    expect(originOf('https://www.bbc.com/news/world-123')).toBe('bbc.com');
    expect(originOf('https://www.nytimes.com/2026/11/04/world/map-of-the-strikes.html')).toBe('nytimes.com');
  });
});

describe('trust counts newsrooms, not domains', () => {
  it('one AP story on four sites is one report', () => {
    const syndicated = [
      src('https://apnews.com/article/x', 95, 'center'),
      src('https://www.yahoo.com/news/x-1.html', 60, 'center', { origin: 'wire' }),
      src('https://www.usnews.com/news/world/articles/x', 75, 'center', { origin: 'wire' }),
      src('https://www.wsmv.com/ap-x/', 60, 'center', { origin: 'apnews.com' }),
    ];
    expect(independentReports(syndicated)).toBe(2); // AP + generic wire copy
    const independent = [
      src('https://apnews.com/article/x', 95, 'center'),
      src('https://www.bbc.com/news/x', 90, 'center'),
      src('https://www.nytimes.com/x', 87, 'center-left'),
      src('https://www.wsj.com/x', 87, 'center-right'),
    ];
    expect(computeTrustScore(independent)).toBeGreaterThan(computeTrustScore(syndicated));
  });

  it('a homepage citation counts half', () => {
    const withHome = [
      src('https://www.reuters.com/world/x', 95, 'center'),
      src('https://www.bbc.com/', 90, 'center', { homepage: true }),
    ];
    expect(independentReports(withHome)).toBe(1.5);
    expect(computeTrustScore(withHome)).toBeLessThanOrEqual(40);
  });

  it('two center outlets are no longer a cross-spectrum pair; three are', () => {
    const two = [src('https://reuters.com/a', 90, 'center'), src('https://bbc.com/a', 90, 'center')];
    const three = [...two, src('https://dw.com/a', 90, 'center')];
    const twoPlusOne = computeTrustScore(three) - computeTrustScore(two);
    // one more report is worth 8; the spectrum bonus adds 8 on top
    expect(twoPlusOne).toBe(16);
  });
});

describe('publish dates', () => {
  it('normalizes the date formats agents write', () => {
    expect(normalizePublished('2026-11-04')).toBe('2026-11-04');
    expect(normalizePublished('2026-11-04T12:30:00Z')).toBe('2026-11-04');
    expect(normalizePublished('Nov 4')).toBeUndefined();
    expect(normalizePublished('2026-13-04')).toBeUndefined();
  });

  it('reads dates from dated URL strings and object keys', () => {
    const sources = normalizeStagedSources([
      'https://www.reuters.com/world/x (2026-11-04)',
      { url: 'https://www.bbc.com/news/y', date: '2026-11-03T08:00:00Z' },
    ]);
    expect(sources?.map((s) => s.published)).toEqual(['2026-11-04', '2026-11-03']);
  });

  it('a story is stale only when every source is dated and old', () => {
    const now = Date.parse('2026-11-10T06:00:00Z');
    const old = [src('https://a.com/x', 80, 'center', { published: '2026-11-01' })];
    expect(isStale(old, now)).toBe(true);
    expect(isStale([...old, src('https://b.com/x', 80, 'center')], now)).toBe(false);
    expect(isStale([src('https://a.com/x', 80, 'center', { published: '2026-11-09' })], now)).toBe(false);
  });
});

const stagedEvent = (overrides: Partial<StagedEvent> = {}): StagedEvent => ({
  headline: 'Earthquake strikes the coast of a country',
  summary: 'A summary that is long enough to pass validation.',
  category: 'disaster',
  severity: 3,
  lat: 35.68,
  lon: 139.69,
  locationName: 'Tokyo, Japan',
  countryCode: 'JP',
  sources: [{ url: 'https://www.reuters.com/world/x' }, { url: 'https://www.bbc.com/news/y' }],
  ...overrides,
});

describe('finalize: staleness, status and corrections', () => {
  it('drops a new story whose sources are all old', () => {
    const { dataset, skippedStale } = finalizeScoped(
      {
        events: [
          stagedEvent({
            sources: [
              { url: 'https://www.reuters.com/world/x', published: '2020-01-01' },
              { url: 'https://www.bbc.com/news/y', published: '2020-01-02' },
            ],
          }),
        ],
      },
      null,
      'daily',
    );
    expect(dataset.events).toHaveLength(0);
    expect(skippedStale).toHaveLength(1);
  });

  it('records origins and dates on sources', () => {
    const { dataset } = finalizeScoped(
      {
        events: [
          stagedEvent({
            sources: [
              { url: 'https://www.yahoo.com/news/quake-1.html', published: '2099-01-01' },
              { url: 'https://www.bbc.com/news/y' },
            ],
          }),
        ],
      },
      null,
      'daily',
    );
    const [yahoo, bbc] = dataset.events[0].sources;
    expect(yahoo.origin).toBe('wire');
    expect(yahoo.published).toBe('2099-01-01');
    expect(bbc.origin).toBeUndefined();
  });

  it('a correction replaces the story and the note survives later updates', () => {
    const first = finalizeScoped({ events: [stagedEvent({ status: 'developing' })] }, null, 'daily').dataset;
    const id = first.events[0].id;
    expect(first.events[0].status).toBe('developing');

    const corrected = finalizeScoped(
      {
        events: [
          stagedEvent({
            headline: 'Quake toll revised down sharply by officials',
            corrects: id,
            correction: 'Earlier reports put the toll at 300; officials now say 30.',
          }),
        ],
      },
      first,
      'daily',
    ).dataset;
    expect(corrected.events).toHaveLength(1);
    expect(corrected.events[0].id).toBe(id);
    expect(corrected.events[0].status).toBe('corrected');
    expect(corrected.events[0].correction).toContain('300');

    const later = finalizeScoped({ events: [stagedEvent({ updates: id })] }, corrected, 'daily').dataset;
    expect(later.events[0].status).toBe('corrected');
    expect(later.events[0].correction).toContain('300');
  });

  it('salvages a status in the wrong case and drops one off the list', () => {
    const raw = JSON.stringify({
      events: [
        { ...stagedEvent(), status: 'Developing' },
        { ...stagedEvent({ headline: 'Another event somewhere else entirely' }), status: 'rumour' },
      ],
    });
    const { staged } = parseStagedOutput(raw);
    expect(staged.events[0].status).toBe('developing');
    expect(staged.events[1].status).toBeUndefined();
    expect(DEFAULT_CORRECTION.length).toBeGreaterThan(10);
  });
});

describe('recalibration over the archive', () => {
  const dir = resolve(__dirname, '../../data/archive');
  const datasets = readdirSync(dir)
    .filter((name) => name.endsWith('.json') && name !== 'index.json')
    .map((name) => JSON.parse(readFileSync(resolve(dir, name), 'utf8')) as NewsDataset);
  const events = datasets.flatMap((dataset) => dataset.events);

  it('scores every archived story in range', () => {
    expect(events.length).toBeGreaterThan(100);
    for (const event of events) {
      const score = computeTrustScore(event.sources);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it('never scores a story higher for syndicated copies than for independent reporting', () => {
    for (const event of events) {
      const reports = independentReports(event.sources);
      const domains = new Set(event.sources.map((s) => s.domain)).size;
      expect(reports).toBeLessThanOrEqual(domains);
    }
  });
});
