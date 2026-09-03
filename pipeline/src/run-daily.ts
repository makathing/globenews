import { readFileSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { SUBAGENTS, coordinatorPrompt } from './agents.ts';
import { buildHooks } from './hooks.ts';
import { RunLedger } from './ledger.ts';
import { MOCK_STAGED } from './mock-data.ts';
import { finalizeDataset, computeStats } from './finalize.ts';
import { enrichImages, probeEgress } from './enrich-images.ts';
import { parseStagedOutput, validateDataset, type StagedOutput } from './schema.ts';
import {
  STAGING_DIR,
  authMode,
  isNonRetryable,
  readCurrentDataset,
  signalChanged,
  stripHarnessBackgroundEnv,
  waitForFile,
  writeDataset,
  writeStagingDebug,
  readOutletIcons,
  writeOutletIcons,
} from './io.ts';

const MOCK = process.env.MOCK_MODE === '1' || process.argv.includes('--mock');
const MAX_BUDGET_USD = Number(process.env.PIPELINE_MAX_BUDGET_USD ?? 8);

stripHarnessBackgroundEnv();

class PipelineError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}


async function runCoordinator(
  ledger: RunLedger,
  attempt: number,
  feedback?: string,
): Promise<StagedOutput> {
  // per-attempt filename: a late background write from a previous attempt can
  // neither satisfy nor corrupt this one
  const stagingPath = resolve(STAGING_DIR, `events.raw.attempt${attempt}.json`);
  if (existsSync(stagingPath)) rmSync(stagingPath);

  let prompt = coordinatorPrompt(stagingPath);
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
  if (await waitForFile(stagingPath)) {
    raw = readFileSync(stagingPath, 'utf8');
  } else {
    // recovery path: fall back to JSON embedded in the coordinator's final reply
    const embedded = finalReply.match(/\{[\s\S]*"events"[\s\S]*\}/);
    if (!embedded) throw new Error('Synthesizer never wrote the staging file.');
    console.warn('[daily] staging file missing — recovering JSON from coordinator reply');
    raw = embedded[0];
  }
  const { staged, dropped, repaired, severityDefaulted } = parseStagedOutput(raw);
  if (repaired > 0) console.log(`[daily] repaired ${repaired} event(s) (truncation/clamping)`);
  for (const drop of dropped) {
    console.warn(`[daily] dropped staged event #${drop.index}: ${drop.reason}`);
  }

  // Severity drives beam height and colour, so a batch where nobody supplied
  // one renders every event identically — the encoding silently dies. Worth a
  // retry: the loop already feeds the reason back to the coordinator, it just
  // never knew about this. On the last attempt take the flat data anyway;
  // current news with poor severity still beats no news.
  if (severityDefaulted > 0) {
    console.warn(
      `[daily] ${severityDefaulted}/${staged.events.length} event(s) had no severity and took the default`,
    );
  }
  if (severityDefaulted === staged.events.length && attempt < MAX_ATTEMPTS) {
    throw new PipelineError(
      `No staged event carried a "severity" field (${staged.events.length} events). ` +
        'Every event object MUST include "severity": an integer 1-5, alongside ' +
        'headline, summary, category, lat, lon, locationName and countryCode.',
      true,
    );
  }
  lastSeverityDefaulted = severityDefaulted;
  return staged;
}

/** Attempts before the run takes whatever it has. */
const MAX_ATTEMPTS = 3;
/** Carried from the winning attempt into the dataset's stats. */
let lastSeverityDefaulted = 0;

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
        staged = await runCoordinator(ledger, attempt + 1, feedback);
        break;
      } catch (error) {
        if (error instanceof PipelineError && !error.retryable) throw error;
        attempt += 1;
        if (attempt >= MAX_ATTEMPTS) throw error;
        feedback = error instanceof Error ? error.message : String(error);
        console.warn(`[daily] attempt ${attempt} failed, retrying with feedback: ${feedback}`);
      }
    }
  }

  const previous = readCurrentDataset();
  const dataset = finalizeDataset(staged, previous, 'daily');
  let enrichment: 'inline' | 'deferred' = 'deferred';
  if (MOCK) {
    // placeholder previews on a handful of events so the UI (and its
    // no-image fallback) can both be exercised in development
    for (const event of dataset.events.slice(0, 6)) {
      event.sources.slice(0, 3).forEach((source, index) => {
        source.image = `https://picsum.photos/seed/${event.id}${index}/320/200`;
      });
      event.image = { url: event.sources[0].image!, domain: event.sources[0].domain };
    }
  } else if (await probeEgress()) {
    // publishers are reachable from here: one pass, art included
    const icons = readOutletIcons();
    const { resolved } = await enrichImages(dataset, icons);
    writeOutletIcons(icons);
    enrichment = 'inline';
    console.log(`[daily] resolved ${resolved} article preview image(s) inline`);
  } else {
    // Not reachable. Say so and hand off to the deploy's enrichment step
    // rather than spend ~76s of timeouts learning it the slow way.
    console.warn(
      '[daily] publishers unreachable from this environment — deferring images to the build',
    );
  }
  // recorded in the file, not just the log: enrichment fails silently by
  // design, so a run that resolved nothing has to leave a trace somewhere
  // the site can read
  dataset.stats = {
    ...computeStats(dataset),
    severityDefaulted: lastSeverityDefaulted,
    enrichment,
  };
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
