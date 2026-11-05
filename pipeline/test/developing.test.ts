import { describe, expect, it } from 'vitest';
import { finalizeScoped, computeHealth } from '../src/finalize.ts';
import { parseStagedOutput, validateDataset } from '../src/schema.ts';
import { activeStorylines, storiesToRecheck, toCurrentStory, updateDeskPrompt } from '../src/agents.ts';
import { MAX_TIMELINE, storylineId, type NewsDataset } from '../../shared/news.ts';
import { STORYLINE_MIN_HOURS } from '../../shared/retention.ts';
import type { StagedEvent } from '../src/schema.ts';

const base = (overrides: Partial<StagedEvent> = {}): StagedEvent => ({
  headline: 'Fighting intensifies around the city of El Fasher',
  summary: 'A summary that is long enough to pass validation.',
  category: 'conflict',
  severity: 2,
  lat: 13.63,
  lon: 25.35,
  locationName: 'El Fasher, Sudan',
  countryCode: 'SD',
  sources: [{ url: 'https://www.reuters.com/world/x' }, { url: 'https://www.bbc.com/news/y' }],
  ...overrides,
});

describe('storyline ids', () => {
  it('slugs labels deterministically', () => {
    expect(storylineId('Sudan war')).toBe('sudan-war');
    expect(storylineId('  US midterms 2026! ')).toBe('us-midterms-2026');
    expect(storylineId('Côte d’Ivoire election')).toBe('cote-d-ivoire-election');
  });
});

describe('developing stories', () => {
  it('keeps a timeline of earlier headlines and records what changed', () => {
    const day1 = finalizeScoped({ events: [base({ storyline: 'Sudan war' })] }, null, 'daily').dataset;
    const id = day1.events[0].id;
    expect(day1.events[0].storyline).toEqual({ id: 'sudan-war', label: 'Sudan war' });
    expect(day1.events[0].timeline).toBeUndefined();
    expect(day1.events[0].whatChanged).toBeUndefined();

    // a later run reports a development
    const day1Shifted: NewsDataset = {
      ...day1,
      events: day1.events.map((e) => ({ ...e, lastUpdated: '2026-11-01T06:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z' })),
    };
    const day2 = finalizeScoped(
      {
        events: [
          base({
            headline: 'RSF forces enter El Fasher as defenders withdraw',
            updates: id,
            whatChanged: 'RSF entered the city; army withdrew to the airport',
          }),
        ],
      },
      day1Shifted,
      'daily',
    ).dataset;
    const story = day2.events[0];
    expect(story.id).toBe(id);
    expect(story.whatChanged).toContain('RSF entered');
    expect(story.timeline).toEqual([
      { at: '2026-11-01T06:00:00.000Z', headline: 'Fighting intensifies around the city of El Fasher' },
    ]);
    // the storyline carries over when the update does not name it
    expect(story.storyline?.id).toBe('sudan-war');
    expect(() => validateDataset(day2)).not.toThrow();
  });

  it('caps the timeline', () => {
    let dataset: NewsDataset | null = null;
    let id: string | undefined;
    for (let i = 0; i < MAX_TIMELINE + 3; i++) {
      const staged = base({ headline: `El Fasher siege update number ${i} with new details`, ...(id ? { updates: id } : {}) });
      dataset = finalizeScoped({ events: [staged] }, dataset, 'daily').dataset;
      id = dataset.events[0].id;
    }
    expect(dataset!.events[0].timeline!.length).toBe(MAX_TIMELINE);
  });

  it('ignores whatChanged on a brand-new story', () => {
    const { dataset } = finalizeScoped({ events: [base({ whatChanged: 'nothing to compare to' })] }, null, 'daily');
    expect(dataset.events[0].whatChanged).toBeUndefined();
  });

  it(`keeps minor storyline stories at least ${STORYLINE_MIN_HOURS}h`, () => {
    const { dataset } = finalizeScoped(
      { events: [base({ severity: 1, storyline: 'Sudan war' }), base({ headline: 'A one-off minor local event elsewhere', severity: 1, lat: 0, lon: 0, locationName: 'Somewhere', countryCode: 'XX' })] },
      null,
      'daily',
    );
    const hours = (e: (typeof dataset.events)[number]) => (Date.parse(e.expiresAt!) - Date.parse(e.lastUpdated)) / 3_600_000;
    const [inStoryline, oneOff] = [dataset.events.find((e) => e.storyline)!, dataset.events.find((e) => !e.storyline)!];
    expect(hours(inStoryline)).toBe(STORYLINE_MIN_HOURS);
    expect(hours(oneOff)).toBe(24);
  });

  it('salvages a storyline written as an object', () => {
    const { staged } = parseStagedOutput(JSON.stringify({ events: [{ ...base(), storyline: { label: 'Sudan war' } }] }));
    expect(staged.events[0].storyline).toBe('Sudan war');
  });
});

describe('update desk', () => {
  const stories = [
    toCurrentStory({ id: 'a', headline: 'Minor thing', locationName: 'X', firstSeen: '2026-11-04T00:00:00Z', lastUpdated: '2026-11-04T00:00:00Z', severity: 1 }),
    toCurrentStory({ id: 'b', headline: 'Big thing', locationName: 'Y', firstSeen: '2026-11-04T00:00:00Z', lastUpdated: '2026-11-04T00:00:00Z', severity: 4 }),
    toCurrentStory({ id: 'c', headline: 'Siege', locationName: 'Z', firstSeen: '2026-11-04T00:00:00Z', lastUpdated: '2026-11-04T00:00:00Z', severity: 2, storyline: { label: 'Sudan war' } }),
    toCurrentStory({ id: 'd', headline: 'Toll rising', locationName: 'W', firstSeen: '2026-11-04T00:00:00Z', lastUpdated: '2026-11-04T00:00:00Z', severity: 2, status: 'developing' }),
  ];

  it('re-checks serious, developing and storyline stories only', () => {
    expect(storiesToRecheck(stories).map((s) => s.id).sort()).toEqual(['b', 'c', 'd']);
    expect(activeStorylines(stories)).toEqual(['Sudan war']);
  });

  it('names the stories and the staging path in its prompt', () => {
    const prompt = updateDeskPrompt('/tmp/update.json', stories);
    expect(prompt).toContain('/tmp/update.json');
    expect(prompt).toContain('Big thing');
    expect(prompt).toContain('ACTIVE STORYLINES');
  });

  it('health: an update pass need not add new stories, but must touch something', () => {
    const now = '2026-11-05T18:00:00.000Z';
    const dataset: NewsDataset = { generatedAt: now, mode: 'daily', events: [] };
    expect(computeHealth(dataset, 'global', 'update').warnings).toContain('the update desk neither updated nor added a story');
  });
});
