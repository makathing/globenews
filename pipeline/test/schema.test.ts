import { describe, expect, it } from 'vitest';
import { finalizeDataset } from '../src/finalize.ts';
import { MOCK_STAGED } from '../src/mock-data.ts';
import { parseStagedOutput, StagedEventSchema, validateDataset } from '../src/schema.ts';

describe('scope and subdivision in the schema', () => {
  const dataset = finalizeDataset(MOCK_STAGED, null, 'daily');
  const event = dataset.events[0];

  it('accepts ISO 3166-2 subdivisions and the known scopes', () => {
    for (const subdivision of ['US-TX', 'US-DC', 'GB-ENG', 'FR-75']) {
      expect(() => validateDataset({ ...dataset, events: [{ ...event, subdivision }] })).not.toThrow();
    }
    expect(() => validateDataset({ ...dataset, events: [{ ...event, scope: 'us' }] })).not.toThrow();
  });

  it('rejects malformed subdivisions and unknown scopes', () => {
    for (const subdivision of ['TX', 'us-tx', 'US_TX', 'US-TEXAS']) {
      expect(() => validateDataset({ ...dataset, events: [{ ...event, subdivision }] })).toThrow();
    }
    expect(() => validateDataset({ ...dataset, events: [{ ...event, scope: 'eu' }] })).toThrow();
  });

  it('caps the dataset at 170 events', () => {
    const many = (n: number) => ({ ...dataset, events: Array.from({ length: n }, () => event) });
    expect(() => validateDataset(many(170))).not.toThrow();
    expect(() => validateDataset(many(171))).toThrow();
  });

  it('never takes a scope from the model', () => {
    const staged = StagedEventSchema.parse({ ...MOCK_STAGED.events[0], scope: 'us' });
    expect('scope' in staged).toBe(false);
  });

  it('salvage fixes the case of a subdivision, and drops one it cannot fix', () => {
    const raw = JSON.stringify({
      events: [
        { ...MOCK_STAGED.events[0], subdivision: 'us-tx' },
        { ...MOCK_STAGED.events[1], subdivision: 'Texas' },
      ],
    });
    const { staged, dropped } = parseStagedOutput(raw);
    expect(dropped).toHaveLength(0);
    expect(staged.events[0].subdivision).toBe('US-TX');
    expect(staged.events[1].subdivision).toBeUndefined();
  });
});
