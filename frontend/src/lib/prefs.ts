import { CATEGORIES, type Category } from '../../../shared/news';
import { isRegionId, type RegionId } from './regions';

/**
 * The viewer's remembered list settings: which categories they hid and which
 * region they were looking at. Same contract as the theme (themes.ts): any
 * storage failure (private mode, quota, disabled) falls back to the default,
 * and anything unrecognised in storage is ignored rather than trusted.
 * `storage` is injectable for tests.
 */

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

const HIDDEN_KEY = 'globenews-hidden';
const REGION_KEY = 'globenews-region';

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadHidden(storage: Storage | null = defaultStorage()): Set<Category> {
  try {
    const raw = storage?.getItem(HIDDEN_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    const hidden = parsed.filter((c): c is Category => (CATEGORIES as readonly unknown[]).includes(c));
    // hiding everything would greet a returning viewer with an empty globe
    return hidden.length >= CATEGORIES.length ? new Set() : new Set(hidden);
  } catch {
    return new Set();
  }
}

export function storeHidden(hidden: ReadonlySet<Category>, storage: Storage | null = defaultStorage()): void {
  try {
    storage?.setItem(HIDDEN_KEY, JSON.stringify(CATEGORIES.filter((c) => hidden.has(c))));
  } catch {
    // storage unavailable
  }
}

export function loadRegion(storage: Storage | null = defaultStorage()): RegionId {
  try {
    const stored = storage?.getItem(REGION_KEY);
    if (isRegionId(stored)) return stored;
  } catch {
    // storage unavailable
  }
  return 'world';
}

export function storeRegion(region: RegionId, storage: Storage | null = defaultStorage()): void {
  try {
    storage?.setItem(REGION_KEY, region);
  } catch {
    // storage unavailable
  }
}
