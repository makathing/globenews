import { existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { SUBAGENTS } from './agents.ts';
import { buildHooks } from './hooks.ts';
import { RunLedger } from './ledger.ts';
import { finalizeDataset } from './finalize.ts';
import { parseStagedOutput, validateDataset } from './schema.ts';
import { STAGING_DIR, writeStagingDebug } from './io.ts';

/**
 * Scoped LIVE test of the full information process — one explorer region,
 * researcher verification of a few candidates, synthesizer staging write —
 * exercising the real coordinator → subagent → hooks → ledger → finalize path
 * at a fraction of the daily batch's size/cost. Prints a findings report.
 *
 *   npx tsx src/probe-pipeline.ts
 */

const STAGING_PATH = resolve(STAGING_DIR, 'probe-events.raw.json');
if (existsSync(STAGING_PATH)) rmSync(STAGING_PATH);

const ledger = new RunLedger();

const prompt = `You are the COORDINATOR of a multi-agent global news radar pipeline (scoped test run). Today is ${new Date().toISOString().slice(0, 10)}.
Do NOT research yourself — delegate to subagents via the Agent tool.

1. Invoke "explorer" ONCE for the region: Asia-Pacific. Ask for its top candidates from the last 24 hours.
2. Pick the 3 most significant candidates and invoke "researcher" ONCE with all 3 (full details) to verify them.
3. Invoke "synthesizer" ONCE with the researcher's verified output, telling it to write the final JSON ({"events": [...]}) to: ${STAGING_PATH}
4. Confirm the file exists, then reply with a short run report: candidates found, verified, discarded (with reasons).`;

const run = query({
  prompt,
  options: {
    model: 'sonnet',
    agents: SUBAGENTS as never,
    allowedTools: ['Agent', 'Read', 'Write', 'WebSearch', 'WebFetch'],
    permissionMode: 'dontAsk',
    maxTurns: 60,
    maxBudgetUsd: 4,
    settingSources: [],
    hooks: buildHooks(ledger) as never,
  },
});

for await (const message of run) {
  if (message.type === 'assistant' && 'message' in message) {
    const content = (message as unknown as { message?: { content?: Array<Record<string, unknown>> } })
      .message?.content;
    for (const block of content ?? []) {
      if (block.type === 'tool_use' && block.name === 'Agent') {
        const input = block.input as { subagent_type?: string; description?: string };
        console.log(`→ Agent tool: ${input.subagent_type} — ${input.description ?? ''}`);
      }
    }
  }
  if (message.type === 'result') {
    console.log('=== RESULT ===');
    console.log('subtype:', message.subtype);
    if ('total_cost_usd' in message) console.log('cost: $', message.total_cost_usd);
    if ('num_turns' in message) console.log('turns:', message.num_turns);
    if ('result' in message) console.log(String(message.result).slice(0, 1200));
  }
}

console.log('\n=== LEDGER ===');
console.log('domains seen:', ledger.uniqueDomains().join(', '));
writeStagingDebug('probe-ledger.json', ledger.toJSON());

if (!existsSync(STAGING_PATH)) {
  console.error('FINDING: synthesizer did not write the staging file!');
  process.exit(2);
}

const raw = readFileSync(STAGING_PATH, 'utf8');
console.log('\n=== STAGED FILE (first 2000 chars) ===');
console.log(raw.slice(0, 2000));

const { staged, dropped, repaired } = parseStagedOutput(raw);
console.log(`\nsalvage: ${staged.events.length} kept, ${repaired} repaired, ${dropped.length} dropped`);
for (const drop of dropped) console.log(`  dropped #${drop.index}: ${drop.reason}`);

const dataset = finalizeDataset(staged, null, 'daily');
validateDataset(dataset);
console.log('\n=== FINALIZED ===');
for (const event of dataset.events) {
  console.log(
    `- [${event.category}/s${event.severity}] trust=${event.trustScore} ${event.locationName} (${event.lat.toFixed(1)},${event.lon.toFixed(1)}) ` +
      `sources=${event.sources.map((s) => `${s.domain}:${s.reliability}${s.unrated ? '*' : ''}`).join(',')} :: ${event.headline}`,
  );
}
