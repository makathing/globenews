import { query } from '@anthropic-ai/claude-agent-sdk';
import { expiryIso } from '../../shared/retention.ts';
import type { NewsEvent } from '../../shared/news.ts';
import { computeStats } from './finalize.ts';
import { readCurrentDataset, writeDataset, authMode, signalChanged } from './io.ts';
import { validateDataset } from './schema.ts';

/**
 * Assign severity to events that shipped without one.
 *
 * The salvage path defaults a missing severity to 3, which is right per-event
 * and ruinous per-batch: a live run whose synthesizer omitted the field
 * entirely produced 19 events all at 3, and since severity drives beam height
 * and colour, the globe rendered nineteen identical shafts.
 *
 * Re-running the whole cycle to recover one integer per event costs about $12.
 * This reads the events already verified and written, and asks once for a
 * rating against the same scale the synthesizer is given. No subagents, no
 * tools, no web access — text in, JSON out.
 *
 * The result is a post-hoc judgement over the headline, not the synthesizer's
 * reading of the sources, so it is counted in `stats.severityBackfilled`
 * rather than passed off as equivalent.
 *
 *   npm run pipeline:backfill-severity [-- --all]
 *
 * By default only events currently sitting at the default 3 are rated;
 * `--all` re-rates everything.
 */

const MAX_BUDGET_USD = 0.5;
/** Same wording the coordinator gets, so both sides apply one scale. */
const SCALE =
  '5 = historic global impact, 4 = major international, 3 = significant national, 2 = notable, 1 = minor';

interface Rating {
  id: string;
  severity: number;
}

function buildPrompt(events: NewsEvent[]): string {
  const lines = events.map(
    (e) => `${e.id} | ${e.category} | ${e.locationName} | ${e.headline}`,
  );
  return `Rate the news severity of each event below on a 1-5 scale, where ${SCALE}.

Judge the event's real-world consequence — lives affected, geographic reach,
whether it changes anything durable — not how dramatic the wording is. Use the
full range: most days have very few 5s, and a routine national story is a 3.

Events, as "id | category | location | headline":
${lines.join('\n')}

Reply with ONLY a JSON object, no prose or code fences:
{"ratings":[{"id":"<id exactly as given>","severity":<1-5>}]}
Include every id exactly once.`;
}

function extractRatings(reply: string): Rating[] {
  // tolerate a code fence or stray prose around the object
  const match = reply.match(/\{[\s\S]*"ratings"[\s\S]*\}/);
  if (!match) throw new Error(`No ratings JSON in reply: ${reply.slice(0, 300)}`);
  const parsed = JSON.parse(match[0]) as { ratings?: unknown };
  if (!Array.isArray(parsed.ratings)) throw new Error('Reply has no "ratings" array');
  return parsed.ratings.flatMap((row) => {
    if (typeof row !== 'object' || row === null) return [];
    const { id, severity } = row as Record<string, unknown>;
    if (typeof id !== 'string' || typeof severity !== 'number') return [];
    return [{ id, severity }];
  });
}

async function main(): Promise<void> {
  const all = process.argv.includes('--all');
  const dataset = readCurrentDataset();
  if (!dataset) {
    console.error('[severity] no readable data/events.json');
    process.exit(1);
  }

  const targets = all
    ? dataset.events
    : dataset.events.filter((e) => e.severity === 3);
  if (targets.length === 0) {
    console.log('[severity] nothing to rate');
    return;
  }
  console.log(`[severity] auth: ${authMode()}`);
  console.log(`[severity] rating ${targets.length} of ${dataset.events.length} event(s)`);

  let reply = '';
  const run = query({
    prompt: buildPrompt(targets),
    options: {
      model: 'haiku',
      allowedTools: [],
      permissionMode: 'dontAsk',
      maxTurns: 2,
      maxBudgetUsd: MAX_BUDGET_USD,
      settingSources: [],
    },
  });
  for await (const message of run) {
    if (message.type === 'result') {
      const cost = 'total_cost_usd' in message ? message.total_cost_usd : undefined;
      console.log(`[severity] finished: ${message.subtype}, cost=$${cost?.toFixed?.(4)}`);
      if (message.subtype !== 'success') throw new Error(`rating run failed: ${message.subtype}`);
      if ('result' in message && typeof message.result === 'string') reply = message.result;
    }
  }

  const byId = new Map(extractRatings(reply).map((r) => [r.id, r.severity]));
  const before = new Map(dataset.events.map((e) => [e.id, e.severity]));
  let changed = 0;
  for (const event of targets) {
    const rated = byId.get(event.id);
    if (typeof rated !== 'number') continue;
    const clamped = Math.min(5, Math.max(1, Math.round(rated))) as NewsEvent['severity'];
    if (clamped !== event.severity) changed += 1;
    event.severity = clamped;
    // lifetime follows severity, so a re-rated story gets a re-set clock
    event.expiresAt = expiryIso(clamped, event.lastUpdated);
  }

  const unrated = targets.filter((e) => !byId.has(e.id));
  if (unrated.length > 0) {
    console.warn(`[severity] ${unrated.length} event(s) came back unrated, left as-is`);
  }

  const spread = (get: (e: NewsEvent) => number) => {
    const counts = new Map<number, number>();
    for (const e of dataset.events) counts.set(get(e), (counts.get(get(e)) ?? 0) + 1);
    return [...counts.entries()].sort(([a], [b]) => a - b).map(([s, n]) => `${s}:${n}`).join(' ');
  };
  console.log(`[severity] before ${spread((e) => before.get(e.id) ?? 0)}`);
  console.log(`[severity] after  ${spread((e) => e.severity)}  (${changed} changed)`);

  dataset.stats = {
    ...computeStats(dataset),
    ...(dataset.stats?.enrichedAt ? { enrichedAt: dataset.stats.enrichedAt } : {}),
    severityBackfilled: changed,
  };
  validateDataset(dataset);
  // re-archive so the day's snapshot matches what actually ships
  writeDataset(dataset, { archive: true });
  signalChanged(true);
  console.log(`[severity] wrote ${dataset.events.length} events`);
}

main().catch((error) => {
  console.error('[severity] failed:', error);
  process.exit(1);
});
