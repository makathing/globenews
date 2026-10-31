import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { US_SUBAGENTS, usCoordinatorPrompt, type CurrentStory } from './agents.ts';
import { RunLedger } from './ledger.ts';
import { MOCK_US_STAGED } from './mock-data.ts';
import { finalizeScoped, keepInRegion, remergeScope } from './finalize.ts';
import { publishDataset, runBatchAgents } from './batch.ts';
import { gitExec, gitSyncEnabled, syncFromRemote } from './git-sync.ts';
import { validateDataset, type StagedOutput } from './schema.ts';
import {
  REPO_ROOT,
  STAGING_DIR,
  authMode,
  readCurrentDataset,
  signalChanged,
  stripHarnessBackgroundEnv,
  writeDataset,
  writeStagingDebug,
} from './io.ts';
import { scopeOf, type NewsEvent, type NewsScope } from '../../shared/news.ts';

/**
 * Regional batch: a second daily run with its own scope and budget, so a
 * region gets depth without crowding the worldwide batch. Today only `us`
 * (US & state news): it adds, updates and expires stories with
 * `"scope": "us"` and never touches a worldwide one.
 *
 *   npm run regional:us -w pipeline                 # live (REGIONAL_MAX_BUDGET_USD, default $5)
 *   npm run regional:us -w pipeline -- --mock       # bundled sample stories, no API
 *   npm run regional:us -w pipeline -- --remerge-only
 *       re-merge the last finished result (pipeline/.staging/us.final.json) onto the
 *       current data/events.json (or origin's, with PIPELINE_GIT_SYNC=1) without
 *       running any agents — for a push that lost a race with another run
 */

interface RegionConfig {
  scope: NewsScope;
  countryCode: string;
  label: string;
}

const REGIONS: Record<string, RegionConfig> = {
  us: { scope: 'us', countryCode: 'US', label: 'US & state' },
};

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index >= 0) return process.argv[index + 1];
  const inline = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  return inline?.slice(flag.length + 1);
}

const MOCK = process.env.MOCK_MODE === '1' || process.argv.includes('--mock');
const REMERGE_ONLY = process.argv.includes('--remerge-only');
const MAX_BUDGET_USD = Number(process.env.REGIONAL_MAX_BUDGET_USD ?? 5);

stripHarnessBackgroundEnv();

const toStory = (event: NewsEvent): CurrentStory => ({
  id: event.id,
  headline: event.headline,
  locationName: event.locationName,
  firstSeen: event.firstSeen,
});

async function remergeOnly(region: RegionConfig, tag: string, finalPath: string): Promise<void> {
  if (!existsSync(finalPath)) throw new Error(`nothing to re-merge: ${finalPath} is missing`);
  const mine = validateDataset(JSON.parse(readFileSync(finalPath, 'utf8')));
  let base = readCurrentDataset();
  if (gitSyncEnabled()) {
    const { fresh, log } = syncFromRemote(gitExec(REPO_ROOT));
    for (const line of log) console.log(`[git-sync] ${line}`);
    if (fresh) base = fresh;
  }
  const merged = remergeScope(base, mine, region.scope);
  validateDataset(merged);
  writeDataset(merged, { archive: true, archiveSuffix: `-${region.scope}` });
  signalChanged(true);
  console.log(
    `[${tag}] re-merged ${merged.events.filter((e) => scopeOf(e) === region.scope).length} ` +
      `${region.scope} stories onto ${base?.events.length ?? 0} existing (${merged.events.length} total)`,
  );
}

async function main(): Promise<void> {
  const name = argValue('--region');
  const region = name ? REGIONS[name] : undefined;
  if (!region) {
    console.error(
      `[regional] unknown or missing --region "${name ?? ''}". Supported: ${Object.keys(REGIONS).join(', ')}`,
    );
    process.exit(1);
  }
  const tag = region.scope;
  const finalPath = resolve(STAGING_DIR, `${region.scope}.final.json`);
  if (REMERGE_ONLY) return remergeOnly(region, tag, finalPath);

  const ledger = new RunLedger();
  if (!MOCK) console.log(`[${tag}] auth: ${authMode()}`);
  const previous = readCurrentDataset();
  const events = previous?.events ?? [];
  // this desk's own stories may be updated; the world desk's stories in the
  // region are listed only so the agents leave them alone
  const current = events.filter((event) => scopeOf(event) === region.scope).map(toStory);
  const covered = events
    .filter((event) => scopeOf(event) !== region.scope && event.countryCode === region.countryCode)
    .map(toStory);

  let staged: StagedOutput;
  let severityDefaulted = 0;
  if (MOCK) {
    console.log(`[${tag}] MOCK_MODE — using bundled sample ${region.label} events`);
    staged = MOCK_US_STAGED;
  } else {
    ({ staged, severityDefaulted } = await runBatchAgents(
      {
        tag,
        stagingStem: region.scope,
        budgetUsd: MAX_BUDGET_USD,
        agents: US_SUBAGENTS,
        prompt: (stagingPath) => usCoordinatorPrompt(stagingPath, current, covered),
      },
      ledger,
    ));
  }

  const { kept, dropped } = keepInRegion(staged, region.countryCode);
  for (const line of dropped) console.warn(`[${tag}] dropped (outside the region): ${line}`);
  const { dataset, skippedCrossScope } = finalizeScoped(kept, previous, 'daily', { scope: region.scope });
  for (const headline of skippedCrossScope) {
    console.log(`[${tag}] skipped (already a world-desk story): ${headline}`);
  }
  const published = await publishDataset(dataset, {
    tag,
    scope: region.scope,
    mock: MOCK,
    previous,
    severityDefaulted,
    archiveSuffix: `-${region.scope}`,
    ledger,
    ledgerName: `${region.scope}-ledger.json`,
  });
  // kept for --remerge-only, should the push lose a race with another run
  writeStagingDebug(`${region.scope}.final.json`, published);
}

main().catch((error) => {
  console.error('[regional] pipeline failed:', error);
  process.exit(1);
});
