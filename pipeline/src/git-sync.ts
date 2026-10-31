import { spawnSync } from 'node:child_process';
import type { NewsDataset, NewsScope } from '../../shared/news.ts';
import { remergeScope } from './finalize.ts';
import { validateDataset } from './schema.ts';

/**
 * Git-safe write for scheduled runs (`PIPELINE_GIT_SYNC=1`).
 *
 * Two runs (the worldwide daily batch and the US & state batch) write the same
 * data/events.json. Each takes up to 40 minutes, so the file it read at the
 * start may be stale by the time it writes. Just before writing, the run
 * fetches origin, fast-forwards a clean checkout, and re-merges: its own
 * scope from its own result, everything else from the fresh main
 * (`remergeScope`). The Routine session still does the commit and push.
 *
 * Git runs through an injectable `exec`, so tests never touch a real repo.
 * Nothing here commits, pushes, stashes, resets or force-anything.
 */

export interface ExecResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}
export type GitExec = (args: string[]) => ExecResult;

export function gitExec(cwd: string): GitExec {
  return (args) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    return {
      ok: result.status === 0,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? (result.error ? String(result.error) : ''),
    };
  };
}

export function gitSyncEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PIPELINE_GIT_SYNC === '1';
}

export interface RepoState {
  /** Commits on HEAD that the remote branch lacks. */
  ahead: number;
  /** Commits on the remote branch that HEAD lacks. */
  behind: number;
  /** Paths `git status --porcelain` reports (tracked changes and untracked files). */
  dirty: string[];
}

/**
 * Whether to fast-forward the checkout before writing. Only a clean checkout
 * with no local commits moves; anything else is left alone (the re-merge
 * still happens, against the fetched file).
 */
export function planFastForward(state: RepoState): { fastForward: boolean; reason: string } {
  if (state.behind === 0) return { fastForward: false, reason: 'already up to date' };
  if (state.ahead > 0) return { fastForward: false, reason: `${state.ahead} local commit(s) not on the remote` };
  if (state.dirty.length > 0) {
    return { fastForward: false, reason: `uncommitted changes (${state.dirty.slice(0, 3).join(', ')})` };
  }
  return { fastForward: true, reason: `${state.behind} new commit(s) on the remote` };
}

export function parsePorcelain(stdout: string): string[] {
  return stdout
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => line.slice(3).trim());
}

export interface SyncResult {
  /** The remote's current dataset, or null when it could not be read (then do not re-merge). */
  fresh: NewsDataset | null;
  fastForwarded: boolean;
  log: string[];
}

/** Fetch the remote branch, fast-forward if safe, and read its events.json. */
export function syncFromRemote(
  exec: GitExec,
  { remote = 'origin', branch = 'main', path = 'data/events.json' } = {},
): SyncResult {
  const log: string[] = [];
  const fail = (message: string): SyncResult => {
    log.push(message);
    return { fresh: null, fastForwarded: false, log };
  };
  if (!exec(['rev-parse', '--is-inside-work-tree']).ok) return fail('not a git work tree');
  const fetched = exec(['fetch', remote, branch]);
  if (!fetched.ok) return fail(`git fetch ${remote} ${branch} failed: ${fetched.stderr.trim()}`);
  const upstream = `${remote}/${branch}`;

  let fastForwarded = false;
  const ahead = exec(['rev-list', '--count', `${upstream}..HEAD`]);
  const behind = exec(['rev-list', '--count', `HEAD..${upstream}`]);
  const status = exec(['status', '--porcelain']);
  if (ahead.ok && behind.ok && status.ok) {
    const plan = planFastForward({
      ahead: Number(ahead.stdout.trim()),
      behind: Number(behind.stdout.trim()),
      dirty: parsePorcelain(status.stdout),
    });
    if (plan.fastForward) {
      const merged = exec(['merge', '--ff-only', upstream]);
      fastForwarded = merged.ok;
      log.push(merged.ok ? `fast-forwarded: ${plan.reason}` : `fast-forward failed: ${merged.stderr.trim()}`);
    } else {
      log.push(`no fast-forward: ${plan.reason}`);
    }
  }

  const shown = exec(['show', `${upstream}:${path}`]);
  if (!shown.ok) return fail(`could not read ${upstream}:${path}: ${shown.stderr.trim()}`);
  try {
    return { fresh: validateDataset(JSON.parse(shown.stdout)), fastForwarded, log };
  } catch (error) {
    return fail(`${upstream}:${path} is not a valid dataset: ${String(error).slice(0, 200)}`);
  }
}

/**
 * The dataset to write: `mine` re-merged onto the remote's latest when sync is
 * on and the remote could be read, else `mine` unchanged.
 */
export function syncAndRemerge(
  mine: NewsDataset,
  scope: NewsScope,
  exec: GitExec,
  log: (line: string) => void = console.log,
): NewsDataset {
  const { fresh, log: lines } = syncFromRemote(exec);
  for (const line of lines) log(`[git-sync] ${line}`);
  if (!fresh) {
    log('[git-sync] writing this run\'s result without a re-merge');
    return mine;
  }
  const merged = remergeScope(fresh, mine, scope);
  log(`[git-sync] re-merged ${scope} stories onto origin's latest (${merged.events.length} events)`);
  return merged;
}
