import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_REGIONAL_BUDGET_USD,
  PipelineError,
  budgetFromEnv,
  runBatchAgents,
  type CoordinatorConfig,
  type CoordinatorMessage,
} from '../src/batch.ts';
import { RunLedger } from '../src/ledger.ts';
import { RunStatsSchema } from '../src/schema.ts';

const validEvent = {
  headline: 'State legislature passes a significant budget bill in the capital',
  summary:
    'A verified multi-source event summary that is comfortably within limits and describes what happened factually.',
  category: 'politics',
  severity: 2,
  lat: 30.27,
  lon: -97.74,
  locationName: 'Austin, Texas, USA',
  countryCode: 'US',
  subdivision: 'US-TX',
  sources: [{ url: 'https://apnews.com/x' }, { url: 'https://www.texastribune.org/y' }],
};

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'globenews-batch-'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

/**
 * A coordinator that (optionally) writes `staged` to the staging path, then
 * ends with the given result subtype — no network, no SDK.
 */
function fakeConfig(subtype: string, staged?: string) {
  const calls: string[] = [];
  let stagingPath = '';
  const config: CoordinatorConfig = {
    tag: 'us',
    stagingStem: 'us',
    budgetUsd: 8,
    agents: {},
    stagingDir: dir,
    prompt: (path) => {
      stagingPath = path;
      return `write to ${path}`;
    },
    query: ({ prompt }) => {
      calls.push(prompt);
      return (async function* (): AsyncGenerator<CoordinatorMessage> {
        if (staged !== undefined) writeFileSync(stagingPath, staged);
        yield { type: 'result', subtype, total_cost_usd: 8.01 };
      })();
    },
  };
  return { config, calls };
}

describe('runBatchAgents — coordinator stopped by its budget', () => {
  it('publishes what the synthesizer staged before the cap', async () => {
    const { config, calls } = fakeConfig(
      'error_max_budget_usd',
      JSON.stringify({ events: [validEvent, { ...validEvent, headline: 'Second distinct story in a state' }] }),
    );
    const result = await runBatchAgents(config, new RunLedger());
    expect(result.staged.events).toHaveLength(2);
    expect(result.stoppedEarly).toBe('error_max_budget_usd');
    expect(calls).toHaveLength(1);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('[us] budget reached after staging — publishing 2 staged stories'),
    );
  });

  it('keeps the valid events of a partly broken staged file', async () => {
    const broken = { ...validEvent, lat: 999 };
    const { config } = fakeConfig('error_max_budget_usd', JSON.stringify({ events: [validEvent, broken] }));
    const result = await runBatchAgents(config, new RunLedger());
    expect(result.staged.events).toHaveLength(1);
    expect(result.stoppedEarly).toBe('error_max_budget_usd');
  });

  it('throws non-retryable when nothing was staged', async () => {
    const { config, calls } = fakeConfig('error_max_budget_usd');
    const error = await runBatchAgents(config, new RunLedger()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PipelineError);
    expect((error as PipelineError).message).toBe('Coordinator run failed: error_max_budget_usd');
    expect((error as PipelineError).retryable).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it('throws non-retryable when the staged file holds no valid event', async () => {
    for (const staged of ['{"events": [', JSON.stringify({ events: [] }), JSON.stringify({ events: [{ lat: 999 }] })]) {
      const { config, calls } = fakeConfig('error_max_budget_usd', staged);
      const error = await runBatchAgents(config, new RunLedger()).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(PipelineError);
      expect((error as PipelineError).retryable).toBe(false);
      expect(calls).toHaveLength(1);
    }
  });

  it('salvages a turn-limit stop too', async () => {
    const { config } = fakeConfig('error_max_turns', JSON.stringify({ events: [validEvent] }));
    const result = await runBatchAgents(config, new RunLedger());
    expect(result.stoppedEarly).toBe('error_max_turns');
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('turn limit reached after staging'));
  });

  it('does not salvage other failures', async () => {
    const { config, calls } = fakeConfig('error_during_execution', JSON.stringify({ events: [validEvent] }));
    await expect(runBatchAgents(config, new RunLedger())).rejects.toThrow(/error_during_execution/);
    expect(calls.length).toBeGreaterThan(1); // retryable: the normal retry loop ran
  });

  it('records the partial run in the dataset stats schema', () => {
    const stats = RunStatsSchema.parse({
      imagesResolved: 0,
      sourcesWithImages: 0,
      multiSource: 1,
      stoppedEarly: 'error_max_budget_usd',
    });
    expect(stats.stoppedEarly).toBe('error_max_budget_usd');
  });
});

describe('regional budget', () => {
  it('defaults to $8', () => {
    expect(DEFAULT_REGIONAL_BUDGET_USD).toBe(8);
    expect(budgetFromEnv('REGIONAL_MAX_BUDGET_USD', DEFAULT_REGIONAL_BUDGET_USD, {})).toBe(8);
  });
  it('honours an override and ignores junk', () => {
    expect(budgetFromEnv('REGIONAL_MAX_BUDGET_USD', 8, { REGIONAL_MAX_BUDGET_USD: '6.5' })).toBe(6.5);
    expect(budgetFromEnv('REGIONAL_MAX_BUDGET_USD', 8, { REGIONAL_MAX_BUDGET_USD: 'abc' })).toBe(8);
    expect(budgetFromEnv('REGIONAL_MAX_BUDGET_USD', 8, { REGIONAL_MAX_BUDGET_USD: '' })).toBe(8);
  });
});
