import {
  SUBAGENTS,
  US_SUBAGENTS,
  coordinatorPrompt,
  rescuePrompt,
  usCoordinatorPrompt,
  type CurrentStory,
} from './agents.ts';
import {
  DEFAULT_DAILY_BUDGET_USD,
  DEFAULT_REGIONAL_BUDGET_USD,
  budgetFromEnv,
  type CoordinatorConfig,
} from './batch.ts';

/**
 * The coordinator configs of the two batches, in one place so the runners and
 * the tests see the same thing — the tests pin that both keep a rescue and a
 * budget with room for it (test/budget-guard.test.ts).
 */

export const DAILY_BUDGET_ENV = 'PIPELINE_MAX_BUDGET_USD';
export const REGIONAL_BUDGET_ENV = 'REGIONAL_MAX_BUDGET_USD';

export function dailyBatchConfig(
  current: CurrentStory[],
  budgetUsd: number = budgetFromEnv(DAILY_BUDGET_ENV, DEFAULT_DAILY_BUDGET_USD),
): CoordinatorConfig {
  return {
    tag: 'daily',
    stagingStem: 'events',
    budgetUsd,
    agents: SUBAGENTS,
    prompt: (stagingPath) => coordinatorPrompt(stagingPath, current),
    rescuePrompt: (stagingPath, material) =>
      rescuePrompt(SUBAGENTS.synthesizer.prompt, stagingPath, material, current),
  };
}

export function usBatchConfig(
  tag: string,
  stagingStem: string,
  current: CurrentStory[],
  covered: CurrentStory[],
  budgetUsd: number = budgetFromEnv(REGIONAL_BUDGET_ENV, DEFAULT_REGIONAL_BUDGET_USD),
): CoordinatorConfig {
  return {
    tag,
    stagingStem,
    budgetUsd,
    agents: US_SUBAGENTS,
    prompt: (stagingPath) => usCoordinatorPrompt(stagingPath, current, covered),
    rescuePrompt: (stagingPath, material) =>
      rescuePrompt(US_SUBAGENTS.synthesizer.prompt, stagingPath, material, current, covered),
  };
}
