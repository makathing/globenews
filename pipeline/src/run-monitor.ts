import { readFileSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { MONITOR_PROMPT, SUBAGENTS } from './agents.ts';
import { buildHooks } from './hooks.ts';
import { RunLedger } from './ledger.ts';
import { finalizeDataset } from './finalize.ts';
import { StagedOutputSchema } from './schema.ts';
import {
  STAGING_DIR,
  readCurrentDataset,
  signalChanged,
  writeDataset,
  writeStagingDebug,
} from './io.ts';
import { MIN_SOURCES_FOR_BREAKING } from './trust.ts';

/**
 * Hourly breaking-news monitor. A cheap Haiku sweep decides whether anything
 * of global or entire-US scale happened in the last hour; only then does a
 * scoped researcher+synthesizer pass run and update the dataset.
 */

interface MonitorVerdict {
  breaking: boolean;
  confidence: 'low' | 'medium' | 'high';
  headline: string | null;
  location: string | null;
  reason: string;
}

const STAGING_PATH = resolve(STAGING_DIR, 'breaking.raw.json');
const MONITOR_BUDGET_USD = Number(process.env.MONITOR_MAX_BUDGET_USD ?? 0.5);
const ESCALATION_BUDGET_USD = Number(process.env.ESCALATION_MAX_BUDGET_USD ?? 3);

function parseVerdict(text: string): MonitorVerdict {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Monitor returned no JSON: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(match[0]) as MonitorVerdict;
  if (typeof parsed.breaking !== 'boolean') throw new Error('Monitor verdict missing "breaking"');
  return parsed;
}

async function runQueryToText(prompt: string, options: Record<string, unknown>): Promise<string> {
  const run = query({ prompt, options: options as never });
  let result = '';
  for await (const message of run) {
    if (message.type === 'result') {
      if (message.subtype !== 'success') throw new Error(`Query failed: ${message.subtype}`);
      result = 'result' in message ? String(message.result) : '';
    }
  }
  return result;
}

async function main(): Promise<void> {
  if (process.env.MOCK_MODE === '1' || process.argv.includes('--mock')) {
    console.log('[monitor] MOCK_MODE — verdict: not breaking');
    signalChanged(false);
    return;
  }

  const ledger = new RunLedger();
  const hooks = buildHooks(ledger) as never;

  const verdictText = await runQueryToText(MONITOR_PROMPT, {
    model: 'haiku',
    allowedTools: ['WebSearch'],
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    maxTurns: 10,
    maxBudgetUsd: MONITOR_BUDGET_USD,
    settingSources: [],
    hooks,
  });

  const verdict = parseVerdict(verdictText);
  console.log(`[monitor] verdict:`, verdict);

  if (!verdict.breaking || verdict.confidence === 'low') {
    signalChanged(false);
    return;
  }

  // ——— Escalation: scoped verify-and-synthesize pass on the flagged event ———
  console.log('[monitor] ESCALATING — running scoped verification pass');
  if (existsSync(STAGING_PATH)) rmSync(STAGING_PATH);

  const escalationPrompt = `A breaking-news monitor flagged this potential event:
HEADLINE: ${verdict.headline}
LOCATION: ${verdict.location}
REASON: ${verdict.reason}

1. Invoke the "researcher" subagent to verify this event against multiple independent sources
   (it must confirm with at least ${MIN_SOURCES_FOR_BREAKING} independent reputable sources, or report unverified).
2. If verified, invoke the "synthesizer" subagent with the researcher's findings to write the final
   JSON ({"events": [...]}, 1-3 events max, covering this story and any directly-linked developments)
   to: ${STAGING_PATH}
3. If the researcher could NOT verify it, do not write any file — reply "UNVERIFIED" with the reason.`;

  const escalationResult = await runQueryToText(escalationPrompt, {
    model: 'sonnet',
    agents: {
      researcher: SUBAGENTS.researcher,
      synthesizer: SUBAGENTS.synthesizer,
    },
    allowedTools: ['Agent', 'Read', 'Write', 'WebSearch', 'WebFetch'],
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    maxTurns: 40,
    maxBudgetUsd: ESCALATION_BUDGET_USD,
    settingSources: [],
    hooks,
  });

  if (!existsSync(STAGING_PATH)) {
    console.log(`[monitor] escalation did not verify the event: ${escalationResult.slice(0, 300)}`);
    signalChanged(false);
    return;
  }

  const staged = StagedOutputSchema.parse(JSON.parse(readFileSync(STAGING_PATH, 'utf8')));
  const previous = readCurrentDataset();
  const breakingDataset = finalizeDataset(staged, previous, 'breaking', { markBreaking: true });

  // Multi-source rule is hard-enforced for breaking pushes.
  breakingDataset.events = breakingDataset.events.filter(
    (event) => event.sources.length >= MIN_SOURCES_FOR_BREAKING,
  );
  if (breakingDataset.events.length === 0) {
    console.log('[monitor] escalation produced no multi-source events — not publishing');
    signalChanged(false);
    return;
  }

  // Merge: breaking events first, then existing events (minus superseded ids).
  const breakingIds = new Set(breakingDataset.events.map((event) => event.id));
  const kept = (previous?.events ?? []).filter((event) => !breakingIds.has(event.id));
  breakingDataset.events = [...breakingDataset.events, ...kept].slice(0, 60);

  writeDataset(breakingDataset);
  writeStagingDebug('monitor-ledger.json', ledger.toJSON());
  signalChanged(true);
  console.log(`[monitor] published ${breakingIds.size} breaking event(s)`);
}

main().catch((error) => {
  console.error('[monitor] failed:', error);
  process.exit(1);
});
