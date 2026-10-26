import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATEGORIES, type NewsDataset } from '../../shared/news.ts';
import { CATEGORY_DEFAULT_TOPIC, TOPICS, TOPIC_IDS, isTopicId, matchTopic } from '../../shared/topics.ts';
import { EVENTS_PATH } from '../src/io.ts';

const dataset = JSON.parse(readFileSync(resolve(EVENTS_PATH), 'utf8')) as NewsDataset;

// The named cases below are real stories frozen from the 2026-10-25 batch: the
// live dataset turns over daily, so looking them up there broke the moment the
// next batch landed.
type TopicStory = Pick<NewsDataset['events'][number], 'headline' | 'summary' | 'category'>;
const stories = JSON.parse(
  readFileSync(resolve(import.meta.dirname, 'fixtures/topic-stories.json'), 'utf8'),
) as TopicStory[];

function topicOf(headlineStart: string): string {
  const story = stories.find((s) => s.headline.startsWith(headlineStart));
  if (!story) throw new Error(`no story in fixtures/topic-stories.json starting "${headlineStart}"`);
  return matchTopic(story);
}

describe('TOPICS', () => {
  it('has unique ids and two or three Commons searches each', () => {
    expect(new Set(TOPIC_IDS).size).toBe(TOPICS.length);
    for (const topic of TOPICS) {
      expect(topic.search.length, topic.id).toBeGreaterThanOrEqual(2);
      expect(topic.search.length, topic.id).toBeLessThanOrEqual(3);
      expect(topic.keywords.length, topic.id).toBeGreaterThan(0);
    }
  });

  it('defaults every category to a real topic', () => {
    for (const category of CATEGORIES) expect(isTopicId(CATEGORY_DEFAULT_TOPIC[category])).toBe(true);
  });
});

describe('matchTopic', () => {
  it('maps every story in the committed dataset to a known topic', () => {
    expect(dataset.events.length).toBeGreaterThan(0);
    for (const event of dataset.events) expect(isTopicId(matchTopic(event))).toBe(true);
  });

  it.each([
    ['Magnitude 7.0 Earthquake Kills', 'earthquake'],
    ['Hurricane Vance Holds at Category 2', 'storm'],
    ['Typhoon Rosal', 'storm'],
    ['Bay of Bengal Depression Forecast to Strengthen Into Cyclone', 'storm'],
    ['Nigeria Confirms Bundibugyo Ebola Strain', 'outbreak'],
    ['China Reports Two More Human H9N2 Avian Flu Cases', 'outbreak'],
    ['Houthi Missile Strike', 'airstrike'],
    ['Russia Strikes Kyiv With Three Waves of Ballistic Missiles', 'airstrike'],
    ['France Deploys 70,000 Police', 'protest'],
    ['Hundreds of Thousands Join Coordinated Cost-of-Living Protests', 'protest'],
    // a cancelled investment conference is a business story, not a summit;
    // the summary's missile mentions must not drag it to airstrike
    ['Saudi Arabia Postpones Flagship FII Investment Conference', 'markets'],
    ["Brazil's Runoff Polls Close", 'election'],
    // a rally *before an election* is election coverage
    ['150,000 Rally in Belgrade', 'election'],
    ['Putin Agrees to Resume Trilateral Ukraine Peace Talks', 'ceasefire'],
    ['CENTCOM Marks 100 Days of Naval Blockade', 'naval'],
    ['Islamic State-Linked Fighters Kill', 'combat'],
    ['Armed Men Storm', 'combat'],
    ["Senegal's 72-Hour General Strike", 'labour'],
    ['Argentine Judge Dismisses Fraud Probe', 'court'],
    ['18-Floor Unfinished Building Collapses', 'emergency'],
    ['India Issues Red Alert for Kerala', 'flood'],
    ['Philippine Peso Hits', 'central-bank'],
    ['Shooting Outside Memphis', 'crime'],
  ])('"%s…" → %s', (headline, topic) => {
    expect(topicOf(headline)).toBe(topic);
  });
});

describe('matchTopic scoring rules', () => {
  it('matches whole words only', () => {
    // "fire" inside "ceasefire" is not a fire
    expect(matchTopic({ headline: 'Ceasefire holds', category: 'conflict' })).toBe('ceasefire');
    expect(matchTopic({ headline: 'Report on the port city', category: 'society' })).toBe('society');
  });

  it('is case-insensitive and tolerates plurals', () => {
    expect(matchTopic({ headline: 'FLOODS SWEEP VALLEY', category: 'disaster' })).toBe('flood');
  });

  it('weighs the headline above the summary', () => {
    const event = {
      headline: 'Earthquake shakes capital',
      summary: 'Officials said a vote on the budget, the election calendar and the ballot design would follow.',
      category: 'politics' as const,
    };
    expect(matchTopic(event)).toBe('earthquake');
  });

  it('lets a phrase outweigh a loose word', () => {
    expect(matchTopic({ headline: 'General strike shuts ports', category: 'conflict' })).toBe('labour');
  });

  it('breaks ties with the category bonus, then TOPICS order', () => {
    // "storm" and "flood" both hit once: the category bonus does not apply
    // (both are disaster topics), so the earlier topic in TOPICS wins
    expect(matchTopic({ headline: 'Storm brings flood', category: 'disaster' })).toBe('flood');
    // "rally" (protest, society) vs "election" (politics) in a politics story
    expect(matchTopic({ headline: 'Rally before election', category: 'politics' })).toBe('election');
  });

  it('falls back to the category default when nothing matches', () => {
    for (const category of CATEGORIES) {
      expect(matchTopic({ headline: 'Something happened somewhere', category })).toBe(
        CATEGORY_DEFAULT_TOPIC[category],
      );
    }
  });

  it('is deterministic', () => {
    const event = dataset.events[0];
    expect(matchTopic(event)).toBe(matchTopic({ ...event }));
  });
});
