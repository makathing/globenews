import { readFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { scopeOf, type NewsDataset, type NewsScope } from '../../shared/news.ts';
import { buildHooks } from './hooks.ts';
import { RunLedger } from './ledger.ts';
import { computeHealth, computeStats, countExpired } from './finalize.ts';
import { enrichImages, probeEgress } from './enrich-images.ts';
import {
  parseStagedOutput,
  StagedValidationError,
  validateDataset,
  type SalvageResult,
  type StagedOutput,
} from './schema.ts';
import { gitExec, gitSyncEnabled, syncAndRemerge } from './git-sync.ts';
import {
  REPO_ROOT,
  STAGING_DIR,
  isNonRetryable,
  readOutletIcons,
  signalChanged,
  waitForFile,
  writeDataset,
  writeOutletIcons,
  writeStagingDebug,
} from './io.ts';

/**
 * The parts of a multi-agent batch shared by the worldwide daily run
 * (run-daily.ts) and the US & state run (run-regional.ts): the coordinator
 * call with its retry loop, and the publish step (git re-merge, enrichment,
 * stats, validation, write).
 */

export class PipelineError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/** Default `REGIONAL_MAX_BUDGET_USD`: the US run's five explorers need about what the daily run does. */
export const DEFAULT_REGIONAL_BUDGET_USD = 8;

/** A USD budget from the environment, falling back when unset or not a positive number. */
export function budgetFromEnv(
  name: string,
  fallback: number,
  env: Record<string, string | undefined> = process.env,
): number {
  const value = Number(env[name]);
  return env[name] !== undefined && env[name] !== '' && Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Attempts before the run takes whatever it has. */
export const MAX_ATTEMPTS = 3;

export interface CoordinatorConfig {
  /** Log prefix, e.g. 'daily'. */
  tag: string;
  /** Staging file stem: `<stem>.raw.attempt<N>.json`. */
  stagingStem: string;
  budgetUsd: number;
  agents: unknown;
  /** The coordinator prompt for a given staging path. */
  prompt: (stagingPath: string) => string;
  /** Test seam: the Agent SDK's `query` (default) or a fake that yields messages. */
  query?: (params: { prompt: string; options?: Record<string, unknown> }) => AsyncIterable<CoordinatorMessage>;
  /** Test seam: where staging files go (default pipeline/.staging). */
  stagingDir?: string;
}

/** The subset of an SDK message the coordinator loop reads. */
export interface CoordinatorMessage {
  type: string;
  subtype?: string;
  total_cost_usd?: number;
  result?: unknown;
}

/**
 * Result subtypes where the coordinator was cut off by a cap rather than
 * failing outright. The synthesizer may already have written the staging
 * file by then, so what it staged is worth publishing.
 */
export const SALVAGEABLE_SUBTYPES: ReadonlySet<string> = new Set(['error_max_budget_usd', 'error_max_turns']);

export interface BatchResult {
  staged: StagedOutput;
  severityDefaulted: number;
  /** Set when the coordinator hit a cap after staging: the SDK result subtype. */
  stoppedEarly?: string;
}

/** "sources.3: Invalid input; sources.7: Invalid input" -> "sources.*: Invalid input". */
export function dropReasonKey(reason: string): string {
  const parts = reason.split('; ').map((part) => part.replace(/\.\d+(?=[.:])/g, '.*'));
  return [...new Set(parts)].join('; ');
}

/**
 * Log every dropped staged event and, when anything was dropped, keep the raw
 * staged file as `.staging/<date>[-<stem>].rejected.json` and log one example
 * `sources` value per distinct reason — a run once dropped ~30 stories a day
 * for months with only "Invalid input" to go on.
 */
export function reportDropped(
  tag: string,
  stagingStem: string,
  raw: string,
  dropped: SalvageResult['dropped'],
  dir: string = STAGING_DIR,
): string | undefined {
  for (const drop of dropped) {
    console.warn(`[${tag}] dropped staged event #${drop.index}: ${drop.reason}`);
  }
  if (dropped.length === 0) return undefined;

  const suffix = stagingStem === 'events' ? '' : `-${stagingStem}`;
  const path = resolve(dir, `${new Date().toISOString().slice(0, 10)}${suffix}.rejected.json`);
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, raw);
    console.warn(`[${tag}] ${dropped.length} staged event(s) dropped; raw staged file kept at ${path}`);
  } catch (error) {
    console.warn(`[${tag}] could not keep the rejected staged file: ${String(error)}`);
  }

  const byReason = new Map<string, { count: number; example: SalvageResult['dropped'][number] }>();
  for (const drop of dropped) {
    const key = dropReasonKey(drop.reason);
    const entry = byReason.get(key);
    if (entry) entry.count += 1;
    else byReason.set(key, { count: 1, example: drop });
  }
  for (const [reason, { count, example }] of byReason) {
    const sources = JSON.stringify(example.sources) ?? 'undefined';
    const shown = sources.length > 200 ? `${sources.slice(0, 200)}…` : sources;
    console.warn(`[${tag}]   ${count}× ${reason} — e.g. #${example.index} sources: ${shown}`);
  }
  return path;
}

/** Parse a staged file, logging repairs and drops; throws when nothing valid is left. */
function parseStaged(config: CoordinatorConfig, raw: string): SalvageResult {
  const { tag } = config;
  const dir = config.stagingDir ?? STAGING_DIR;
  let salvage: SalvageResult;
  try {
    salvage = parseStagedOutput(raw);
  } catch (error) {
    if (error instanceof StagedValidationError) reportDropped(tag, config.stagingStem, raw, error.dropped, dir);
    throw error;
  }
  if (salvage.repaired > 0) console.log(`[${tag}] repaired ${salvage.repaired} event(s) (truncation/clamping)`);
  reportDropped(tag, config.stagingStem, raw, salvage.dropped, dir);
  return salvage;
}

/**
 * The coordinator stopped on a cap. If the staging file is already there with
 * at least one valid event, publish that rather than throw the day away;
 * otherwise rethrow the cap error.
 */
function salvageAfterCap(
  config: CoordinatorConfig,
  stagingPath: string,
  subtype: string,
  capError: PipelineError,
): BatchResult {
  const { tag } = config;
  if (!existsSync(stagingPath)) {
    console.warn(`[${tag}] ${subtype} before the synthesizer wrote ${stagingPath} — nothing to salvage`);
    throw capError;
  }
  let salvage: SalvageResult;
  try {
    salvage = parseStaged(config, readFileSync(stagingPath, 'utf8'));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[${tag}] ${subtype} and the staged file is unusable (${reason}) — nothing to salvage`);
    throw capError;
  }
  const { staged, severityDefaulted } = salvage;
  if (staged.events.length === 0) {
    console.warn(`[${tag}] ${subtype} and the staged file has no events — nothing to salvage`);
    throw capError;
  }
  const what = subtype === 'error_max_turns' ? 'turn limit' : 'budget';
  console.warn(
    `[${tag}] ${what} reached after staging — publishing ${staged.events.length} staged stories ` +
      `(partial run: ${subtype}; the coordinator's final checks did not run)`,
  );
  if (severityDefaulted > 0) {
    console.warn(
      `[${tag}] ${severityDefaulted}/${staged.events.length} event(s) had no severity and took the default`,
    );
  }
  return { staged, severityDefaulted, stoppedEarly: subtype };
}

async function runCoordinator(
  config: CoordinatorConfig,
  ledger: RunLedger,
  attempt: number,
  feedback?: string,
): Promise<BatchResult> {
  const { tag } = config;
  // per-attempt filename: a late background write from a previous attempt can
  // neither satisfy nor corrupt this one
  const stagingDir = config.stagingDir ?? STAGING_DIR;
  const stagingPath = resolve(stagingDir, `${config.stagingStem}.raw.attempt${attempt}.json`);
  if (existsSync(stagingPath)) rmSync(stagingPath);

  let prompt = config.prompt(stagingPath);
  if (feedback) {
    prompt += `\n\nIMPORTANT — the previous attempt produced invalid output. Fix these problems this time:\n${feedback}`;
  }

  let finalReply = '';
  const runQuery = config.query ?? (query as unknown as NonNullable<CoordinatorConfig['query']>);
  const run = runQuery({
    prompt,
    options: {
      model: 'sonnet',
      agents: config.agents as never,
      allowedTools: ['Agent', 'Read', 'Write', 'WebSearch', 'WebFetch'],
      // least-privilege: everything outside allowedTools is denied
      // (bypassPermissions also refuses to run as root, e.g. in containers)
      permissionMode: 'dontAsk',
      maxTurns: 100,
      maxBudgetUsd: config.budgetUsd,
      settingSources: [],
      hooks: buildHooks(ledger) as never,
    },
  });

  try {
    for await (const message of run) {
      if (message.type === 'result') {
        const cost = message.total_cost_usd;
        const subtype = String(message.subtype);
        console.log(`[${tag}] coordinator finished: ${subtype}, cost=$${cost?.toFixed?.(2)}`);
        if (subtype !== 'success') {
          const capError = new PipelineError(`Coordinator run failed: ${subtype}`, !isNonRetryable(subtype));
          if (SALVAGEABLE_SUBTYPES.has(subtype)) return salvageAfterCap(config, stagingPath, subtype, capError);
          throw capError;
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
    console.warn(`[${tag}] staging file missing — recovering JSON from coordinator reply`);
    raw = embedded[0];
  }
  const { staged, severityDefaulted } = parseStaged(config, raw);

  // Severity drives beam height and colour, so a batch where nobody supplied
  // one renders every event identically — the encoding silently dies. Worth a
  // retry: the loop already feeds the reason back to the coordinator, it just
  // never knew about this. On the last attempt take the flat data anyway;
  // current news with poor severity still beats no news.
  if (severityDefaulted > 0) {
    console.warn(
      `[${tag}] ${severityDefaulted}/${staged.events.length} event(s) had no severity and took the default`,
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
  return { staged, severityDefaulted };
}

/** The coordinator with up to MAX_ATTEMPTS tries, feeding each failure back into the next. */
export async function runBatchAgents(config: CoordinatorConfig, ledger: RunLedger): Promise<BatchResult> {
  let attempt = 0;
  let feedback: string | undefined;
  for (;;) {
    try {
      return await runCoordinator(config, ledger, attempt + 1, feedback);
    } catch (error) {
      if (error instanceof PipelineError && !error.retryable) throw error;
      attempt += 1;
      if (attempt >= MAX_ATTEMPTS) throw error;
      feedback = error instanceof Error ? error.message : String(error);
      console.warn(`[${config.tag}] attempt ${attempt} failed, retrying with feedback: ${feedback}`);
    }
  }
}

export interface PublishOptions {
  tag: string;
  scope: NewsScope;
  mock: boolean;
  previous: NewsDataset | null;
  severityDefaulted: number;
  /** The SDK result subtype when the coordinator hit a cap and only its staged stories were published. */
  stoppedEarly?: string;
  /** Appended to the archive name: '' for the daily batch, '-us' for the US run. */
  archiveSuffix: string;
  ledger: RunLedger;
  ledgerName: string;
  /** 'update' for the update desk: no minimum of new stories. Default 'full'. */
  healthMode?: 'full' | 'update';
}

/**
 * Re-merge onto origin (PIPELINE_GIT_SYNC=1), enrich this run's own stories,
 * record stats, validate and write. Stories of other scopes are never
 * enriched or otherwise touched here.
 */
export async function publishDataset(finalized: NewsDataset, opts: PublishOptions): Promise<NewsDataset> {
  const { tag, scope } = opts;
  const dataset = gitSyncEnabled() ? syncAndRemerge(finalized, scope, gitExec(REPO_ROOT)) : finalized;
  const own = dataset.events.filter((event) => scopeOf(event) === scope);

  let enrichment: 'inline' | 'deferred' = 'deferred';
  if (opts.mock) {
    // placeholder previews on a handful of events so the UI (and its
    // no-image fallback) can both be exercised in development
    for (const event of own.slice(0, 6)) {
      event.sources.slice(0, 3).forEach((source, index) => {
        source.image = `https://picsum.photos/seed/${event.id}${index}/320/200`;
      });
      event.image = { url: event.sources[0].image!, domain: event.sources[0].domain };
    }
  } else if (await probeEgress()) {
    // publishers are reachable from here: one pass, art included
    const icons = readOutletIcons();
    const { resolved } = await enrichImages({ ...dataset, events: own }, icons);
    writeOutletIcons(icons);
    enrichment = 'inline';
    console.log(`[${tag}] resolved ${resolved} article preview image(s) inline`);
  } else {
    // Not reachable. Say so and hand off to the deploy's enrichment step
    // rather than spend ~76s of timeouts learning it the slow way.
    console.warn(`[${tag}] publishers unreachable from this environment — deferring images to the build`);
  }
  // recorded in the file, not just the log: enrichment fails silently by
  // design, so a run that resolved nothing has to leave a trace somewhere
  // the site can read
  const stats = computeStats(dataset);
  dataset.stats = {
    ...stats,
    expired: countExpired(opts.previous, dataset, scope),
    severityDefaulted: opts.severityDefaulted,
    enrichment,
    ...(opts.stoppedEarly ? { stoppedEarly: opts.stoppedEarly } : {}),
    health: computeHealth(dataset, scope, opts.healthMode ?? 'full'),
  };
  for (const warning of dataset.stats.health!.warnings) console.warn(`[${tag}] HEALTH WARNING: ${warning}`);
  validateDataset(dataset);
  writeDataset(dataset, { archive: true, archiveSuffix: opts.archiveSuffix });
  writeStagingDebug(opts.ledgerName, opts.ledger.toJSON());
  signalChanged(true);

  const multiSource = dataset.events.filter((event) => event.sources.length >= 2).length;
  console.log(
    `[${tag}] wrote ${dataset.events.length} events (${own.length} ${scope}, ${multiSource} multi-source, ` +
      `${opts.ledger.uniqueDomains().length} domains scored)` +
      (opts.stoppedEarly ? ` — PARTIAL run, coordinator stopped early (${opts.stoppedEarly})` : ''),
  );
  return dataset;
}
