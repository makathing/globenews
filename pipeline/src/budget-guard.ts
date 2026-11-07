import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ARCHIVE_DIR } from './io.ts';

/**
 * Early warning before a batch runs out of money.
 *
 * Every run records what it spent and its cap in `stats.costUsd` and
 * `stats.budgetUsd`. A run that spends most of its cap is the run before the
 * one that hits it, so the log says so loudly — both after a run that came
 * close, and before a run whose recent history has been coming close.
 */

/** Share of the cap a run may spend before the log warns. */
export const COST_WARN_RATIO = 0.8;

/** Runs looked back over before a batch starts. */
export const TREND_RUNS = 7;

/** A warning when `costUsd` is at or past COST_WARN_RATIO of `budgetUsd`, else undefined. */
export function costWarning(tag: string, costUsd: number, budgetUsd: number, envVar: string): string | undefined {
  if (!(budgetUsd > 0) || !(costUsd >= 0)) return undefined;
  const ratio = costUsd / budgetUsd;
  if (ratio < COST_WARN_RATIO) return undefined;
  return (
    `[${tag}] BUDGET WARNING: this run cost $${costUsd.toFixed(2)}, ${Math.round(ratio * 100)}% of its ` +
    `$${budgetUsd.toFixed(2)} cap — a busier news day may hit it. Raise ${envVar}.`
  );
}

export interface RunCost {
  date: string;
  costUsd: number;
}

/**
 * The recorded cost of the last `limit` runs of one batch, newest first, from
 * its archives: `<date>.json` for the daily batch, `<date><suffix>.json`
 * otherwise. Archives written before costs were recorded are skipped.
 */
export function recentRunCosts(suffix: string, limit = TREND_RUNS, dir: string = ARCHIVE_DIR): RunCost[] {
  if (!existsSync(dir)) return [];
  const pattern = new RegExp(`^(\\d{4}-\\d{2}-\\d{2})${suffix.replace(/[-.]/g, '\\$&')}\\.json$`);
  const costs: RunCost[] = [];
  for (const name of readdirSync(dir).sort().reverse()) {
    const match = name.match(pattern);
    if (!match) continue;
    try {
      const cost = JSON.parse(readFileSync(resolve(dir, name), 'utf8'))?.stats?.costUsd;
      if (typeof cost === 'number' && Number.isFinite(cost)) costs.push({ date: match[1], costUsd: cost });
    } catch {
      // unreadable archive: not this check's problem
    }
    if (costs.length >= limit) break;
  }
  return costs;
}

/** A warning when any recent run spent COST_WARN_RATIO or more of today's cap, else undefined. */
export function costTrendWarning(
  tag: string,
  costs: RunCost[],
  budgetUsd: number,
  envVar: string,
): string | undefined {
  const close = costs.filter((run) => run.costUsd >= budgetUsd * COST_WARN_RATIO);
  if (close.length === 0) return undefined;
  const worst = close.reduce((a, b) => (b.costUsd > a.costUsd ? b : a));
  return (
    `[${tag}] BUDGET WARNING: ${close.length} of the last ${costs.length} recorded run(s) spent ` +
    `${Math.round(COST_WARN_RATIO * 100)}%+ of today's $${budgetUsd.toFixed(2)} cap ` +
    `(highest $${worst.costUsd.toFixed(2)} on ${worst.date}). Raise ${envVar} before one hits it.`
  );
}

/** Log the trend warning, if any, before a batch starts. */
export function checkBudgetTrend(tag: string, suffix: string, budgetUsd: number, envVar: string): void {
  const warning = costTrendWarning(tag, recentRunCosts(suffix), budgetUsd, envVar);
  if (warning) console.warn(warning);
}
