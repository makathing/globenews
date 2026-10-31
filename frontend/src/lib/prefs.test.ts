import { describe, expect, it } from 'vitest';
import { loadHidden, loadRegion, storeHidden, storeRegion } from './prefs';

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

const broken = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

describe('hidden categories', () => {
  it('round-trips in canonical order', () => {
    const storage = memory();
    storeHidden(new Set(['society', 'conflict'] as const), storage);
    expect(storage.data.get('globenews-hidden')).toBe('["conflict","society"]');
    expect([...loadHidden(storage)]).toEqual(['conflict', 'society']);
  });

  it('ignores junk and unknown categories', () => {
    expect(loadHidden(memory({ 'globenews-hidden': 'not json' })).size).toBe(0);
    expect(loadHidden(memory({ 'globenews-hidden': '{"a":1}' })).size).toBe(0);
    expect([...loadHidden(memory({ 'globenews-hidden': '["sports","health",3]' }))]).toEqual(['health']);
    expect(loadHidden(memory()).size).toBe(0);
    expect(loadHidden(null).size).toBe(0);
  });

  it('never restores an empty globe', () => {
    const all = JSON.stringify(['conflict', 'disaster', 'politics', 'economy', 'health', 'science', 'climate', 'society']);
    expect(loadHidden(memory({ 'globenews-hidden': all })).size).toBe(0);
  });

  it('survives storage that throws', () => {
    expect(() => storeHidden(new Set(['health'] as const), broken)).not.toThrow();
    expect(loadHidden(broken).size).toBe(0);
  });
});

describe('region', () => {
  it('round-trips a valid region and rejects others', () => {
    const storage = memory();
    storeRegion('europe', storage);
    expect(loadRegion(storage)).toBe('europe');
    expect(loadRegion(memory({ 'globenews-region': 'atlantis' }))).toBe('world');
    expect(loadRegion(memory())).toBe('world');
    expect(loadRegion(broken)).toBe('world');
    expect(() => storeRegion('us', broken)).not.toThrow();
  });
});
