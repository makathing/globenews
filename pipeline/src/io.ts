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
export const OUTLET_ICONS_PATH = resolve(DATA_DIR, 'outlet-icons.json');
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

/**
 * Domain -> outlet icon URL, committed so a domain resolved on one run keeps
 * working on a later run whose fetch failed. Never fatal: a missing or corrupt
 * cache just means every icon gets rediscovered.
 */
export function readOutletIcons(): Record<string, string> {
  if (!existsSync(OUTLET_ICONS_PATH)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(OUTLET_ICONS_PATH, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        ([, value]) => typeof value === 'string' && value.startsWith('https://'),
      ),
    ) as Record<string, string>;
  } catch {
    return {};
  }
}

export function writeOutletIcons(icons: Record<string, string>): void {
  mkdirSync(DATA_DIR, { recursive: true });
  // sorted so a run that discovers nothing produces a byte-identical file and
  // the workflow's "did anything change" check stays meaningful
  const sorted = Object.fromEntries(Object.entries(icons).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(OUTLET_ICONS_PATH, JSON.stringify(sorted, null, 2) + '\n');
}

export function writeStagingDebug(name: string, value: unknown): void {
  mkdirSync(STAGING_DIR, { recursive: true });
  writeFileSync(resolve(STAGING_DIR, name), JSON.stringify(value, null, 2));
}

/** Which credential the underlying CLI will resolve (API key outranks OAuth token). */
export function authMode(): string {
  if (process.env.ANTHROPIC_API_KEY) return 'metered API key (ANTHROPIC_API_KEY)';
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) return 'Claude subscription (CLAUDE_CODE_OAUTH_TOKEN)';
  return 'ambient CLI credentials';
}

/**
 * Harness environments can force the Agent tool to auto-background subagents,
 * racing file writes against the end of the query stream (verified live:
 * "Async agent launched" despite background:false). Strip the override.
 */
export function stripHarnessBackgroundEnv(): void {
  delete process.env.CLAUDE_AUTO_BACKGROUND_TASKS;
}

const sleep = (ms: number) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

/** Wait out a late background-subagent write before declaring a file missing. */
export async function waitForFile(path: string, timeoutMs = 150_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(path)) return true;
    await sleep(5_000);
  }
  return existsSync(path);
}

/** Errors where a retry can only waste money: budget caps and account limits. */
export function isNonRetryable(message: string): boolean {
  return /budget|session limit|usage limit|rate limit|credit balance/i.test(message);
}

/** Signal to GitHub Actions (and humans) whether data changed. */
export function signalChanged(changed: boolean): void {
  console.log(changed ? '::notice::globenews data changed' : 'No data change this run.');
  if (process.env.GITHUB_OUTPUT) {
    writeFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`, { flag: 'a' });
  }
}
