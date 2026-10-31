import { describe, expect, it } from 'vitest';
import { finalizeDataset, finalizeScoped } from '../src/finalize.ts';
import { MOCK_STAGED, MOCK_US_STAGED } from '../src/mock-data.ts';
import {
  gitSyncEnabled,
  parsePorcelain,
  planFastForward,
  syncAndRemerge,
  syncFromRemote,
  type GitExec,
} from '../src/git-sync.ts';

/** A scripted git: responses by argument string; records every call. Never runs real git. */
function fakeGit(responses: Record<string, { ok?: boolean; stdout?: string; stderr?: string }>) {
  const calls: string[] = [];
  const exec: GitExec = (args) => {
    const key = args.join(' ');
    calls.push(key);
    const response = responses[key] ?? { ok: true, stdout: '' };
    return { ok: response.ok ?? true, stdout: response.stdout ?? '', stderr: response.stderr ?? '' };
  };
  return { exec, calls };
}

const world = finalizeDataset(MOCK_STAGED, null, 'daily');

describe('git sync', () => {
  it('is off unless PIPELINE_GIT_SYNC=1', () => {
    expect(gitSyncEnabled({})).toBe(false);
    expect(gitSyncEnabled({ PIPELINE_GIT_SYNC: '1' })).toBe(true);
  });

  it('fast-forwards only a clean checkout with no local commits', () => {
    expect(planFastForward({ ahead: 0, behind: 2, dirty: [] }).fastForward).toBe(true);
    expect(planFastForward({ ahead: 0, behind: 0, dirty: [] }).fastForward).toBe(false);
    expect(planFastForward({ ahead: 1, behind: 2, dirty: [] }).fastForward).toBe(false);
    expect(planFastForward({ ahead: 0, behind: 2, dirty: ['data/events.json'] }).fastForward).toBe(false);
  });

  it('parses porcelain status', () => {
    expect(parsePorcelain(' M data/events.json\n?? data/archive/x.json\n')).toEqual([
      'data/events.json',
      'data/archive/x.json',
    ]);
  });

  it('fetches, fast-forwards and reads the remote dataset', () => {
    const { exec, calls } = fakeGit({
      'rev-list --count origin/main..HEAD': { stdout: '0\n' },
      'rev-list --count HEAD..origin/main': { stdout: '3\n' },
      'status --porcelain': { stdout: '' },
      'show origin/main:data/events.json': { stdout: JSON.stringify(world) },
    });
    const result = syncFromRemote(exec);
    expect(result.fastForwarded).toBe(true);
    expect(result.fresh?.events).toHaveLength(world.events.length);
    expect(calls).toContain('fetch origin main');
    expect(calls).toContain('merge --ff-only origin/main');
    // nothing that writes history or discards work
    expect(calls.some((call) => /^(push|commit|reset|stash|checkout|rebase)/.test(call))).toBe(false);
  });

  it('does not merge a dirty checkout but still reads the remote', () => {
    const { exec, calls } = fakeGit({
      'rev-list --count origin/main..HEAD': { stdout: '0' },
      'rev-list --count HEAD..origin/main': { stdout: '1' },
      'status --porcelain': { stdout: ' M data/events.json' },
      'show origin/main:data/events.json': { stdout: JSON.stringify(world) },
    });
    const result = syncFromRemote(exec);
    expect(result.fastForwarded).toBe(false);
    expect(result.fresh).not.toBeNull();
    expect(calls).not.toContain('merge --ff-only origin/main');
  });

  it('gives up cleanly when fetch fails or the remote file is bad', () => {
    expect(syncFromRemote(fakeGit({ 'fetch origin main': { ok: false, stderr: 'denied' } }).exec).fresh).toBeNull();
    expect(syncFromRemote(fakeGit({ 'show origin/main:data/events.json': { stdout: '{oops' } }).exec).fresh).toBeNull();
    expect(syncFromRemote(fakeGit({ 'rev-parse --is-inside-work-tree': { ok: false } }).exec).fresh).toBeNull();
  });

  it('re-merges the US result onto the remote world, or writes it as is', () => {
    const mine = finalizeScoped(MOCK_US_STAGED, null, 'daily', { scope: 'us' }).dataset;
    const { exec } = fakeGit({ 'show origin/main:data/events.json': { stdout: JSON.stringify(world) } });
    const merged = syncAndRemerge(mine, 'us', exec, () => {});
    expect(merged.events).toHaveLength(mine.events.length + world.events.length);
    const offline = fakeGit({ 'fetch origin main': { ok: false } }).exec;
    expect(syncAndRemerge(mine, 'us', offline, () => {})).toBe(mine);
  });
});
