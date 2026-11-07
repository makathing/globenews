import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  COST_WARN_RATIO,
  costTrendWarning,
  costWarning,
  recentRunCosts,
} from '../src/budget-guard.ts';
import { dailyBatchConfig, usBatchConfig } from '../src/batch-configs.ts';
import {
  DEFAULT_DAILY_BUDGET_USD,
  RESCUE_RESERVE_USD,
  coordinatorBudget,
  type CoordinatorConfig,
} from '../src/batch.ts';
import { RunStatsSchema } from '../src/schema.ts';

/**
 * The guards against a batch running out of money before it publishes
 * anything (it happened on 2026-11-07). If one of these fails, a change has
 * removed a guard — put it back rather than loosen the test.
 */

describe('both batches keep their guards', () => {
  const configs: [string, CoordinatorConfig][] = [
    ['daily', dailyBatchConfig([])],
    ['us', usBatchConfig('us', 'us', [], [])],
  ];

  it.each(configs)('%s: rescues what was found when the cap hits before staging', (_, config) => {
    expect(config.rescuePrompt).toBeTypeOf('function');
    const prompt = config.rescuePrompt!('/tmp/out.json', { basis: 'researcher', text: 'MATERIAL' });
    expect(prompt).toContain('/tmp/out.json');
    expect(prompt).toContain('MATERIAL');
  });

  it.each(configs)('%s: holds the rescue reserve back from the coordinator', (_, config) => {
    expect(coordinatorBudget(config)).toBeLessThanOrEqual(config.budgetUsd - RESCUE_RESERVE_USD);
    expect(coordinatorBudget(config)).toBeGreaterThan(0);
  });

  it.each(configs)('%s: tells the coordinator to stop researching in time', (_, config) => {
    const prompt = config.prompt('/tmp/out.json');
    expect(prompt).toContain('BUDGET RULE');
    expect(prompt).toMatch(/60% of your effort/);
  });

  it('gives the daily batch at least $12 by default', () => {
    expect(DEFAULT_DAILY_BUDGET_USD).toBeGreaterThanOrEqual(12);
    expect(dailyBatchConfig([], DEFAULT_DAILY_BUDGET_USD).budgetUsd).toBeGreaterThanOrEqual(12);
  });
});

describe('cost warnings', () => {
  it('warns when a run spends 80% or more of its cap', () => {
    expect(COST_WARN_RATIO).toBe(0.8);
    expect(costWarning('daily', 7.5, 12, 'PIPELINE_MAX_BUDGET_USD')).toBeUndefined();
    const warning = costWarning('daily', 10.2, 12, 'PIPELINE_MAX_BUDGET_USD');
    expect(warning).toContain('BUDGET WARNING');
    expect(warning).toContain('85%');
    expect(warning).toContain('PIPELINE_MAX_BUDGET_USD');
  });

  it('ignores missing or nonsensical numbers', () => {
    expect(costWarning('daily', 5, 0, 'X')).toBeUndefined();
    expect(costWarning('daily', Number.NaN, 12, 'X')).toBeUndefined();
  });

  it('records cost and cap in the dataset stats', () => {
    const stats = { imagesResolved: 0, sourcesWithImages: 0, multiSource: 1, costUsd: 6.94, budgetUsd: 12 };
    // zod strips undeclared keys, so this also proves the fields survive a read
    expect(RunStatsSchema.parse(stats)).toMatchObject({ costUsd: 6.94, budgetUsd: 12 });
    expect(RunStatsSchema.safeParse({ ...stats, costUsd: -1 }).success).toBe(false);
  });
});

describe('cost trend from the archives', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'globenews-costs-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const archive = (name: string, costUsd?: number) =>
    writeFileSync(join(dir, name), JSON.stringify({ stats: costUsd === undefined ? {} : { costUsd } }));

  it('reads recorded costs per batch, newest first, skipping archives without one', () => {
    archive('2026-11-05.json', 6.1);
    archive('2026-11-06.json'); // before costs were recorded
    archive('2026-11-07.json', 9.9);
    archive('2026-11-07-us.json', 4.5);
    expect(recentRunCosts('', 7, dir)).toEqual([
      { date: '2026-11-07', costUsd: 9.9 },
      { date: '2026-11-05', costUsd: 6.1 },
    ]);
    expect(recentRunCosts('-us', 7, dir)).toEqual([{ date: '2026-11-07', costUsd: 4.5 }]);
    expect(recentRunCosts('', 1, dir)).toHaveLength(1);
  });

  it('warns before a run when recent runs came close to the cap', () => {
    const costs = [
      { date: '2026-11-07', costUsd: 9.9 },
      { date: '2026-11-06', costUsd: 6.0 },
    ];
    const warning = costTrendWarning('daily', costs, 12, 'PIPELINE_MAX_BUDGET_USD');
    expect(warning).toContain('1 of the last 2');
    expect(warning).toContain('$9.90 on 2026-11-07');
    expect(costTrendWarning('daily', [{ date: '2026-11-06', costUsd: 6.0 }], 12, 'X')).toBeUndefined();
    expect(costTrendWarning('daily', [], 12, 'X')).toBeUndefined();
  });

  it('is quiet on a missing archive directory', () => {
    expect(recentRunCosts('', 7, join(dir, 'nope'))).toEqual([]);
  });
});
