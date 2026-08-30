import { readFileSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { SUBAGENTS, coordinatorPrompt } from './agents.ts';
import { buildHooks } from './hooks.ts';
import { RunLedger } from './ledger.ts';
import { MOCK_STAGED } from './mock-data.ts';
import { finalizeDataset } from './finalize.ts';
import { enrichImages } from './enrich-images.ts';
import { parseStagedOutput, validateDataset, type StagedOutput } from './schema.ts';
import {
  STAGING_DIR,
  authMode,
  isNonRetryable,
  readCurrentDataset,
  signalChanged,
  writeDataset,
  writeStagingDebug,
} from './io.ts';

const MOCK = process.env.MOCK_MODE === '1' || process.argv.includes('--mock');
const MAX_BUDGET_USD = Number(process.env.PIPELINE_MAX_BUDGET_USD ?? 8);
const STAGING_PATH = resolve(STAGING_DIR, 'events.raw.json');

class PipelineError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}


async function runCoordinator(ledger: RunLedger, feedback?: string): Promise<StagedOutput> {
  if (existsSync(STAGING_PATH)) rmSync(STAGING_PATH);

  let prompt = coordinatorPrompt(STAGING_PATH);
  if (feedback) {
    prompt += `\n\nIMPORTANT — the previous attempt produced invalid output. Fix these problems this time:\n${feedback}`;
  }

  let finalReply = '';
  const run = query({
    prompt,
    options: {
      model: 'sonnet',
      agents: SUBAGENTS as never,
      allowedTools: ['Agent', 'Read', 'Write', 'WebSearch', 'WebFetch'],
      // least-privilege: everything outside allowedTools is denied
      // (bypassPermissions also refuses to run as root, e.g. in containers)
      permissionMode: 'dontAsk',
      maxTurns: 100,
      maxBudgetUsd: MAX_BUDGET_USD,
      settingSources: [],
      hooks: buildHooks(ledger) as never,
    },
  });

  try {
    for await (const message of run) {
      if (message.type === 'result') {
        const cost = 'total_cost_usd' in message ? message.total_cost_usd : undefined;
        console.log(`[daily] coordinator finished: ${message.subtype}, cost=$${cost?.toFixed?.(2)}`);
        if (message.subtype !== 'success') {
          throw new PipelineError(
            `Coordinator run failed: ${message.subtype}`,
            !isNonRetryable(message.subtype),
          );
        }
        if ('result' in message) finalReply = String(message.result);
      }
    }
  } catch (error) {
    // SDK-thrown errors (e.g. "You've hit your session limit") must be
    // classified too — retrying an exhausted account burns attempts for $0
    if (!(error instanceof PipelineError)) {
      const message = error instanceof Error ? error.message : String(error);
      throw new PipelineError(message, !isNonRetryable(message));
    }
    throw error;
  }

  let raw: string;
  if (existsSync(STAGING_PATH)) {
    raw = readFileSync(STAGING_PATH, 'utf8');
  } else {
    // recovery path: the synthesizer's Write has proven flaky in live runs —
    // fall back to JSON embedded in the coordinator's final reply
    const embedded = finalReply.match(/\{[\s\S]*"events"[\s\S]*\}/);
    if (!embedded) throw new Error('Synthesizer never wrote the staging file.');
    console.warn('[daily] staging file missing — recovering JSON from coordinator reply');
    raw = embedded[0];
  }
  const { staged, dropped, repaired } = parseStagedOutput(raw);
  if (repaired > 0) console.log(`[daily] repaired ${repaired} event(s) (truncation/clamping)`);
  for (const drop of dropped) {
    console.warn(`[daily] dropped staged event #${drop.index}: ${drop.reason}`);
  }
  return staged;
}

async function main(): Promise<void> {
  const ledger = new RunLedger();
  if (!MOCK) console.log(`[daily] auth: ${authMode()}`);
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
        if (error instanceof PipelineError && !error.retryable) throw error;
        attempt += 1;
        if (attempt > 2) throw error;
        feedback = error instanceof Error ? error.message : String(error);
        console.warn(`[daily] attempt ${attempt} failed, retrying with feedback: ${feedback}`);
      }
    }
  }

  const previous = readCurrentDataset();
  const dataset = finalizeDataset(staged, previous, 'daily');
  if (MOCK) {
    // placeholder previews on a handful of events so the UI (and its
    // no-image fallback) can both be exercised in development
    for (const event of dataset.events.slice(0, 6)) {
      event.image = {
        url: `https://picsum.photos/seed/${event.id}/640/360`,
        domain: event.sources[0].domain,
      };
    }
  } else {
    const { resolved } = await enrichImages(dataset);
    console.log(`[daily] resolved ${resolved} article preview image(s)`);
  }
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
