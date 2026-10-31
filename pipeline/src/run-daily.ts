import { SUBAGENTS, coordinatorPrompt, type CurrentStory } from './agents.ts';
import { RunLedger } from './ledger.ts';
import { MOCK_STAGED } from './mock-data.ts';
import { finalizeScoped } from './finalize.ts';
import { publishDataset, runBatchAgents } from './batch.ts';
import type { StagedOutput } from './schema.ts';
import { authMode, readCurrentDataset, stripHarnessBackgroundEnv } from './io.ts';
import { scopeOf } from '../../shared/news.ts';

const MOCK = process.env.MOCK_MODE === '1' || process.argv.includes('--mock');
const MAX_BUDGET_USD = Number(process.env.PIPELINE_MAX_BUDGET_USD ?? 8);

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

  if (MOCK) {
    console.log('[daily] MOCK_MODE — using bundled sample events');
    staged = MOCK_STAGED;
  } else {
    ({ staged, severityDefaulted } = await runBatchAgents(
      {
        tag: 'daily',
        stagingStem: 'events',
        budgetUsd: MAX_BUDGET_USD,
        agents: SUBAGENTS,
        prompt: (stagingPath) => coordinatorPrompt(stagingPath, current),
      },
      ledger,
    ));
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
    archiveSuffix: '',
    ledger,
    ledgerName: 'ledger.json',
  });
}

main().catch((error) => {
  console.error('[daily] pipeline failed:', error);
  process.exit(1);
});
