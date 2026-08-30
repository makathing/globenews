import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NewsDataset } from '../../shared/news.ts';
import { validateDataset } from './schema.ts';

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(here, '..', '..');
export const DATA_DIR = resolve(REPO_ROOT, 'data');
export const EVENTS_PATH = resolve(DATA_DIR, 'events.json');
export const ARCHIVE_DIR = resolve(DATA_DIR, 'archive');
export const STAGING_DIR = resolve(REPO_ROOT, 'pipeline', '.staging');

export function readCurrentDataset(): NewsDataset | null {
  if (!existsSync(EVENTS_PATH)) return null;
  try {
    return validateDataset(JSON.parse(readFileSync(EVENTS_PATH, 'utf8')));
  } catch {
    return null;
  }
}

export function writeDataset(dataset: NewsDataset, { archive = false } = {}): void {
  const json = JSON.stringify(dataset, null, 2);
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(EVENTS_PATH, json);
  if (archive) {
    mkdirSync(ARCHIVE_DIR, { recursive: true });
    writeFileSync(resolve(ARCHIVE_DIR, `${dataset.generatedAt.slice(0, 10)}.json`), json);
  }
}

export function writeStagingDebug(name: string, value: unknown): void {
  mkdirSync(STAGING_DIR, { recursive: true });
  writeFileSync(resolve(STAGING_DIR, name), JSON.stringify(value, null, 2));
}

/** Signal to GitHub Actions (and humans) whether data changed. */
export function signalChanged(changed: boolean): void {
  console.log(changed ? '::notice::globenews data changed' : 'No data change this run.');
  if (process.env.GITHUB_OUTPUT) {
    writeFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`, { flag: 'a' });
  }
}
