import { readFileSync } from 'node:fs';
import { parseStagedOutput, validateDataset } from './schema.ts';
import { computeStats, finalizeDataset } from './finalize.ts';
import { enrichImages } from './enrich-images.ts';
import { readCurrentDataset, writeDataset, signalChanged } from './io.ts';

/**
 * Recovery/replay tool: finalize a preserved staging file into data/events.json
 * without re-running any agents (zero model cost).
 *
 *   npx tsx src/replay-staged.ts .staging/events.raw.attempt1.json [--no-images]
 */

const [, , inputPath, ...flags] = process.argv;
if (!inputPath) {
  console.error('usage: npx tsx src/replay-staged.ts <staged-file.json> [--no-images]');
  process.exit(2);
}

const raw = readFileSync(inputPath, 'utf8');
const { staged, dropped, repaired } = parseStagedOutput(raw);
console.log(`[replay] kept ${staged.events.length}, repaired ${repaired}, dropped ${dropped.length}`);
for (const drop of dropped) console.log(`  dropped #${drop.index}: ${drop.reason.slice(0, 140)}`);

const previous = readCurrentDataset();
const dataset = finalizeDataset(staged, previous, 'daily');
if (!flags.includes('--no-images')) {
  const { resolved } = await enrichImages(dataset);
  console.log(`[replay] resolved ${resolved} preview image(s)`);
}
const stats = computeStats(dataset);
dataset.stats = {
  ...stats,
  expired: (previous?.events.length ?? 0) - (stats.carried ?? 0) - (stats.updated ?? 0),
};
validateDataset(dataset);
writeDataset(dataset, { archive: true });
signalChanged(true);
console.log(
  `[replay] wrote ${dataset.events.length} events to data/events.json ` +
    `(${stats.updated} updated, ${stats.carried} carried, ${dataset.stats.expired} expired)`,
);
