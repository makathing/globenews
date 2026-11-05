import { CATEGORIES, type Category } from '../../../shared/news';
import { isRegionId, type RegionId } from './regions';
import type { Follows } from './reader';

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

// ——— reader state: last visit and follows ———

const LAST_VISIT_KEY = 'globenews-last-visit';
const FOLLOWS_KEY = 'globenews-follows';

/** When the reader last left the page (epoch ms), or null on a first visit. */
export function loadLastVisit(storage: Storage | null = defaultStorage(), now = Date.now()): number | null {
  try {
    const raw = storage?.getItem(LAST_VISIT_KEY);
    const value = raw ? Number(raw) : NaN;
    // a value from the future (clock change) would hide every story's badge
    return Number.isFinite(value) && value > 0 && value <= now ? value : null;
  } catch {
    return null;
  }
}

export function storeLastVisit(at: number, storage: Storage | null = defaultStorage()): void {
  try {
    storage?.setItem(LAST_VISIT_KEY, String(Math.round(at)));
  } catch {
    // storage unavailable
  }
}

/** Followed storylines and places; anything malformed is ignored. */
export function loadFollows(storage: Storage | null = defaultStorage()): Follows {
  try {
    const raw = storage?.getItem(FOLLOWS_KEY);
    if (!raw) return { storylines: [], places: [] };
    const parsed = JSON.parse(raw) as Partial<Follows> | null;
    const strings = (value: unknown, pattern: RegExp) =>
      Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && pattern.test(v)).slice(0, 100) : [];
    return {
      storylines: strings(parsed?.storylines, /^[a-z0-9-]{1,60}$/),
      places: strings(parsed?.places, /^[A-Z]{2}(-[A-Z0-9]{1,3})?$/),
    };
  } catch {
    return { storylines: [], places: [] };
  }
}

export function storeFollows(follows: Follows, storage: Storage | null = defaultStorage()): void {
  try {
    storage?.setItem(FOLLOWS_KEY, JSON.stringify(follows));
  } catch {
    // storage unavailable
  }
}
