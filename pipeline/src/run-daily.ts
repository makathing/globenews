import type { CurrentStory } from './agents.ts';
import { RunLedger } from './ledger.ts';
import { MOCK_STAGED } from './mock-data.ts';
import { finalizeScoped } from './finalize.ts';
import { publishDataset, runBatchAgents } from './batch.ts';
import { DAILY_BUDGET_ENV, dailyBatchConfig } from './batch-configs.ts';
import { checkBudgetTrend } from './budget-guard.ts';
import type { StagedOutput } from './schema.ts';
import { authMode, readCurrentDataset, stripHarnessBackgroundEnv } from './io.ts';
import { scopeOf } from '../../shared/news.ts';

const MOCK = process.env.MOCK_MODE === '1' || process.argv.includes('--mock');

stripHarnessBackgroundEnv();

async function main(): Promise<void> {
  const ledger = new RunLedger();
  if (!MOCK) console.log(`[daily] auth: ${authMode()}`);
  // read up front: the agents are told what is already on the map so they
  // report developments as updates instead of near-duplicates. Only the
  // worldwide stories: the US desk's stories are not this run's to update.
  const previous = readCurrentDataset();
  const current: CurrentStory[] = (previous?.events ?? [])
    .filter((event) => scopeOf(event) === 'global')
    .map((event) => ({
      id: event.id,
      headline: event.headline,
      locationName: event.locationName,
      firstSeen: event.firstSeen,
    }));
  let staged: StagedOutput;
  let severityDefaulted = 0;
  let stoppedEarly: string | undefined;
  let costUsd: number | undefined;
  let budgetUsd: number | undefined;

  if (MOCK) {
    console.log('[daily] MOCK_MODE — using bundled sample events');
    staged = MOCK_STAGED;
  } else {
    const config = dailyBatchConfig(current);
    budgetUsd = config.budgetUsd;
    checkBudgetTrend('daily', '', budgetUsd, DAILY_BUDGET_ENV);
    ({ staged, severityDefaulted, stoppedEarly, costUsd } = await runBatchAgents(config, ledger));
  }

  const { dataset, skippedCrossScope } = finalizeScoped(staged, previous, 'daily', { scope: 'global' });
  for (const headline of skippedCrossScope) {
    console.log(`[daily] skipped (already a US-desk story): ${headline}`);
  }
  await publishDataset(dataset, {
    tag: 'daily',
    scope: 'global',
    mock: MOCK,
    previous,
    severityDefaulted,
    stoppedEarly,
    costUsd,
    budgetUsd,
    budgetEnv: DAILY_BUDGET_ENV,
    archiveSuffix: '',
    ledger,
    ledgerName: 'ledger.json',
  });
}

main().catch((error) => {
  console.error('[daily] pipeline failed:', error);
  process.exit(1);
});
