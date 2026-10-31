// Copies the latest pipeline dataset, and the archived daily snapshots the
// timeline reads, into the static assets served by Vite. Both land under
// frontend/public/data/, which is gitignored: they are build outputs. The
// archive is fetched at runtime one day at a time and never imported, so it
// adds nothing to the JS bundle.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildArchiveIndex, indexEntry, planArchive } from './archive-index.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, '..', '..', 'data');
const src = resolve(dataDir, 'events.json');
const destDir = resolve(here, '..', 'public', 'data');

if (!existsSync(src)) {
  console.error('data/events.json missing — run `npm run pipeline:daily -- --mock` first.');
  process.exit(1);
}
mkdirSync(destDir, { recursive: true });
copyFileSync(src, resolve(destDir, 'events.json'));
console.log('Copied data/events.json → frontend/public/data/events.json');

// — timeline snapshots —
const archiveSrc = resolve(dataDir, 'archive');
const archiveDest = resolve(destDir, 'archive');
// start clean so a day that left the window (or a renamed file) doesn't linger
rmSync(archiveDest, { recursive: true, force: true });
mkdirSync(archiveDest, { recursive: true });
const plan = existsSync(archiveSrc) ? planArchive(readdirSync(archiveSrc)) : [];
const entries = [];
let bytes = 0;
for (const { date, file } of plan) {
  const from = resolve(archiveSrc, file);
  let dataset;
  try {
    dataset = JSON.parse(readFileSync(from, 'utf8'));
  } catch {
    console.warn(`  skipped archive/${file}: not valid JSON`);
    continue;
  }
  const entry = indexEntry(date, dataset);
  if (!entry) {
    console.warn(`  skipped archive/${file}: not a dataset`);
    continue;
  }
  copyFileSync(from, resolve(archiveDest, file));
  bytes += statSync(from).size;
  entries.push(entry);
}
writeFileSync(resolve(archiveDest, 'index.json'), JSON.stringify(buildArchiveIndex(entries)));
console.log(
  `Copied ${entries.length} archived day(s) → frontend/public/data/archive/ (${(bytes / 1024 / 1024).toFixed(1)} MB)`,
);
