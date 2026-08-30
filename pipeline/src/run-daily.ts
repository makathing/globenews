import { readFileSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { SUBAGENTS, coordinatorPrompt } from './agents.ts';
import { buildHooks } from './hooks.ts';
import { RunLedger } from './ledger.ts';
import { MOCK_STAGED } from './mock-data.ts';
import { finalizeDataset } from './finalize.ts';
import { StagedOutputSchema, validateDataset, type StagedOutput } from './schema.ts';
import {
  STAGING_DIR,
  readCurrentDataset,
  signalChanged,
  writeDataset,
  writeStagingDebug,
} from './io.ts';

const MOCK = process.env.MOCK_MODE === '1' || process.argv.includes('--mock');
const MAX_BUDGET_USD = Number(process.env.PIPELINE_MAX_BUDGET_USD ?? 8);
const STAGING_PATH = resolve(STAGING_DIR, 'events.raw.json');

async function runCoordinator(ledger: RunLedger, feedback?: string): Promise<StagedOutput> {
  if (existsSync(STAGING_PATH)) rmSync(STAGING_PATH);

  let prompt = coordinatorPrompt(STAGING_PATH);
  if (feedback) {
    prompt += `\n\nIMPORTANT — the previous attempt produced invalid output. Fix these problems this time:\n${feedback}`;
  }

  const run = query({
    prompt,
    options: {
      model: 'sonnet',
      agents: SUBAGENTS as never,
      allowedTools: ['Agent', 'Read', 'Write', 'WebSearch', 'WebFetch'],
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      maxTurns: 100,
      maxBudgetUsd: MAX_BUDGET_USD,
      settingSources: [],
      hooks: buildHooks(ledger) as never,
    },
  });

  for await (const message of run) {
    if (message.type === 'result') {
      const cost = 'total_cost_usd' in message ? message.total_cost_usd : undefined;
      console.log(`[daily] coordinator finished: ${message.subtype}, cost=$${cost?.toFixed?.(2)}`);
      if (message.subtype !== 'success') {
        throw new Error(`Coordinator run failed: ${message.subtype}`);
      }
    }
  }

  if (!existsSync(STAGING_PATH)) {
    throw new Error('Synthesizer never wrote the staging file.');
  }
  const raw = readFileSync(STAGING_PATH, 'utf8');
  return StagedOutputSchema.parse(JSON.parse(raw));
}

async function main(): Promise<void> {
  const ledger = new RunLedger();
  let staged: StagedOutput;

  if (MOCK) {
    console.log('[daily] MOCK_MODE — using bundled sample events');
    staged = MOCK_STAGED;
  } else {
    let attempt = 0;
    let feedback: string | undefined;
    for (;;) {
      try {
        staged = await runCoordinator(ledger, feedback);
        break;
      } catch (error) {
        attempt += 1;
        if (attempt > 2) throw error;
        feedback = error instanceof Error ? error.message : String(error);
        console.warn(`[daily] attempt ${attempt} failed, retrying with feedback: ${feedback}`);
      }
    }
  }

  const previous = readCurrentDataset();
  const dataset = finalizeDataset(staged, previous, 'daily');
  validateDataset(dataset);
  writeDataset(dataset, { archive: true });
  writeStagingDebug('ledger.json', ledger.toJSON());
  signalChanged(true);

  const multiSource = dataset.events.filter((event) => event.sources.length >= 2).length;
  console.log(
    `[daily] wrote ${dataset.events.length} events (${multiSource} multi-source, ` +
      `${ledger.uniqueDomains().length} domains scored)`,
  );
}

main().catch((error) => {
  console.error('[daily] pipeline failed:', error);
  process.exit(1);
});
