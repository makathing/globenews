import { SUBAGENTS, coordinatorPrompt, toCurrentStory, updateDeskPrompt, type CurrentStory } from './agents.ts';
import { RunLedger } from './ledger.ts';
import { MOCK_STAGED } from './mock-data.ts';
import { finalizeScoped } from './finalize.ts';
import { budgetFromEnv, publishDataset, runBatchAgents } from './batch.ts';
import type { StagedOutput } from './schema.ts';
import { authMode, readCurrentDataset, stripHarnessBackgroundEnv } from './io.ts';
import { scopeOf } from '../../shared/news.ts';

/**
 * The worldwide desk.
 *
 *   npm run daily -w pipeline                 # morning edition (PIPELINE_MAX_BUDGET_USD, default $10)
 *   npm run daily -w pipeline -- --update     # update desk (UPDATE_MAX_BUDGET_USD, default $4):
 *       re-checks the biggest stories on the map for developments and catches
 *       what broke since the morning, without re-exploring the world
 *   npm run daily -w pipeline -- --mock       # bundled sample events, no API
 */

const MOCK = process.env.MOCK_MODE === '1' || process.argv.includes('--mock');
const UPDATE = process.argv.includes('--update');
export const DEFAULT_DAILY_BUDGET_USD = 10;
export const DEFAULT_UPDATE_BUDGET_USD = 4;
const MAX_BUDGET_USD = UPDATE
  ? budgetFromEnv('UPDATE_MAX_BUDGET_USD', DEFAULT_UPDATE_BUDGET_USD)
  : budgetFromEnv('PIPELINE_MAX_BUDGET_USD', DEFAULT_DAILY_BUDGET_USD);

stripHarnessBackgroundEnv();

async function main(): Promise<void> {
  const tag = UPDATE ? 'update' : 'daily';
  const ledger = new RunLedger();
  if (!MOCK) console.log(`[${tag}] auth: ${authMode()}`);
  // read up front: the agents are told what is already on the map so they
  // report developments as updates instead of near-duplicates. Only the
  // worldwide stories: the US desk's stories are not this run's to update.
  const previous = readCurrentDataset();
  const current: CurrentStory[] = (previous?.events ?? [])
    .filter((event) => scopeOf(event) === 'global')
    .map(toCurrentStory);
  let staged: StagedOutput;
  let severityDefaulted = 0;
  let stoppedEarly: string | undefined;

  if (MOCK) {
    console.log(`[${tag}] MOCK_MODE — using bundled sample events`);
    staged = MOCK_STAGED;
  } else {
    ({ staged, severityDefaulted, stoppedEarly } = await runBatchAgents(
      {
        tag,
        stagingStem: UPDATE ? 'update' : 'events',
        budgetUsd: MAX_BUDGET_USD,
        agents: SUBAGENTS,
        prompt: (stagingPath) =>
          UPDATE ? updateDeskPrompt(stagingPath, current) : coordinatorPrompt(stagingPath, current),
      },
      ledger,
    ));
  }

  const { dataset, skippedCrossScope, skippedPerPlace, skippedStale } = finalizeScoped(staged, previous, 'daily', {
    scope: 'global',
  });
  for (const headline of skippedCrossScope) console.log(`[${tag}] skipped (already a US-desk story): ${headline}`);
  for (const headline of skippedPerPlace) {
    console.log(`[${tag}] skipped (country already has its share this run): ${headline}`);
  }
  for (const headline of skippedStale) console.log(`[${tag}] skipped (all sources older than 72h): ${headline}`);
  await publishDataset(dataset, {
    tag,
    scope: 'global',
    mock: MOCK,
    previous,
    severityDefaulted,
    stoppedEarly,
    archiveSuffix: UPDATE ? '-update' : '',
    ledger,
    ledgerName: UPDATE ? 'update-ledger.json' : 'ledger.json',
    healthMode: UPDATE ? 'update' : 'full',
  });
}

main().catch((error) => {
  console.error(`[${UPDATE ? 'update' : 'daily'}] pipeline failed:`, error);
  process.exit(1);
});
