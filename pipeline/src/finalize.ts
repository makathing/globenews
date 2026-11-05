import { createHash } from 'node:crypto';
import {
  CATEGORIES,
  scopeOf,
  type NewsDataset,
  type RunHealth,
  type StoryStatus,
  type NewsEvent,
  type NewsScope,
  type NewsSource,
  type RunStats,
} from '../../shared/news.ts';
import { normalizeDomain, rateDomain } from './source-ratings.ts';
import { reconcileCoordinates, subdivisionFor, US_SUBDIVISIONS } from './gazetteer.ts';
import { computeTrustScore } from './trust.ts';
import { originOf } from './syndication.ts';
import { isHomepage, type StagedOutput } from './schema.ts';
import { expiryIso, isExpired } from '../../shared/retention.ts';
import { crossScopeMatch, matchPrevious } from './retention.ts';
import { AREA_IDS, areaOf } from '../../shared/areas.ts';

export function stableEventId(headline: string, lat: number, lon: number): string {
  const key = `${headline.toLowerCase().replace(/[^a-z0-9]+/g, '-')}|${Math.round(lat)}|${Math.round(lon)}`;
  return createHash('sha1').update(key).digest('hex').slice(0, 12);
}

function buildSources(staged: { url: string; homepage?: boolean; published?: string }[]): NewsSource[] {
  const byDomain = new Map<string, NewsSource>();
  for (const { url, homepage, published } of staged) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      continue; // skip malformed URLs
    }
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const domain = normalizeDomain(host);
    const isHome = homepage === true || isHomepage(parsed);
    const existing = byDomain.get(domain);
    // one row per outlet; the article beats the outlet's front page
    if (existing && !(existing.homepage && !isHome)) continue;
    // rate the full host too: some outlets are rated on a subdomain (news.sky.com)
    const rating = rateDomain(host);
    const origin = isHome ? domain : originOf(url);
    byDomain.set(domain, {
      url,
      domain,
      reliability: rating.reliability,
      bias: rating.bias,
      ...(rating.unrated ? { unrated: true } : {}),
      ...(isHome ? { homepage: true } : {}),
      // only when it differs: most sources are their own newsroom
      ...(origin !== domain ? { origin } : {}),
      ...(published ? { published } : {}),
    });
  }
  return [...byDomain.values()];
}

/**
 * Re-derive what finalize stamps on a source from its URL: origin, and the
 * rating (the table grows). Applied to carried stories so a story added
 * before a scoring change does not keep an outdated trust score for days.
 */
function refreshSource(source: NewsSource): NewsSource {
  const host = (() => {
    try {
      return new URL(source.url).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      return source.domain;
    }
  })();
  const rating = rateDomain(host);
  const origin = source.homepage ? source.domain : originOf(source.url);
  const { origin: _origin, unrated: _unrated, ...rest } = source;
  return {
    ...rest,
    reliability: rating.reliability,
    bias: rating.bias,
    ...(rating.unrated ? { unrated: true } : {}),
    ...(origin !== source.domain ? { origin } : {}),
  };
}

/** A new story whose newest dated source is older than this is background, not news. */
export const STALE_AFTER_HOURS = 72;

/** Whether every source is dated and the newest is older than STALE_AFTER_HOURS. */
export function isStale(sources: NewsSource[], nowMs: number): boolean {
  if (sources.length === 0 || sources.some((source) => !source.published)) return false;
  const newest = Math.max(...sources.map((source) => Date.parse(`${source.published}T23:59:59Z`)));
  return Number.isFinite(newest) && nowMs - newest > STALE_AFTER_HOURS * 3_600_000;
}

/** Schema cap on sources per event; an update keeps its old outlets up to this. */
const MAX_SOURCES = 10;
/**
 * Cap on stories on the map, per scope: each run fills and trims only its own
 * share, so the US desk can never push a world story off the map or the
 * other way round. With lifetimes of one to seven days and ~30 new stories a
 * daily run, global steady state is around 80; the frontend draws three
 * primitives per story, so 160 in all has headroom (the schema allows 170).
 */
export const SCOPE_CAPS: Record<NewsScope, number> = { global: 120, us: 40 };

export interface FinalizeOptions {
  /** Which run this is; it only adds, updates or expires stories in this scope. */
  scope?: NewsScope;
  markBreaking?: boolean;
  /** Overrides the cap for this run's own scope. */
  maxEvents?: number;
  retain?: boolean;
}

export interface FinalizeReport {
  dataset: NewsDataset;
  /** Headlines dropped because the story already belongs to another scope. */
  skippedCrossScope: string[];
  /** Headlines dropped because their country or state already had MAX_PER_PLACE stories this run. */
  skippedPerPlace: string[];
  /** New stories dropped because every source was published more than STALE_AFTER_HOURS ago. */
  skippedStale: string[];
}

const bySeverityThenTrust = (a: NewsEvent, b: NewsEvent) =>
  b.severity - a.severity || b.trustScore - a.trustScore;

/** Stories per category guaranteed a place before the cap, when the category has any. */
export const MIN_PER_CATEGORY = 2;

/**
 * The order a scope's stories claim places under its cap: first the top
 * MIN_PER_CATEGORY of every category and the top story of every world area,
 * then everything else by severity and trust. Without the first pass a big
 * news week (a war, an election) fills the cap and science, climate or a
 * whole continent silently drops off the map.
 */
export function balancedOrder(events: NewsEvent[]): NewsEvent[] {
  const sorted = [...events].sort(bySeverityThenTrust);
  const reserved = new Set<NewsEvent>();
  const perCategory = new Map<string, number>();
  const areasSeen = new Set<string>();
  for (const event of sorted) {
    const taken = perCategory.get(event.category) ?? 0;
    if (taken < MIN_PER_CATEGORY) {
      perCategory.set(event.category, taken + 1);
      reserved.add(event);
    }
    const area = areaOf(event);
    if (!areasSeen.has(area)) {
      areasSeen.add(area);
      reserved.add(event);
    }
  }
  return [...sorted.filter((event) => reserved.has(event)), ...sorted.filter((event) => !reserved.has(event))];
}

/** Trim each scope to its own cap, balanced; the result is sorted by severity then trust. */
function capByScope(events: NewsEvent[], caps: Record<NewsScope, number>): NewsEvent[] {
  const byScope = new Map<NewsScope, NewsEvent[]>();
  for (const event of events) {
    const scope = scopeOf(event);
    const list = byScope.get(scope);
    if (list) list.push(event);
    else byScope.set(scope, [event]);
  }
  const kept: NewsEvent[] = [];
  for (const [scope, list] of byScope) {
    kept.push(...(list.length > caps[scope] ? balancedOrder(list).slice(0, caps[scope]) : list));
  }
  return kept.sort(bySeverityThenTrust);
}

/**
 * Most stories one run may add or update for a single country (world desk) or
 * state (US desk). Severity 4-5 stories are never cut by it: a war still gets
 * its coverage, it just cannot also take five more slots with smaller angles.
 */
export const MAX_PER_PLACE = 4;

/** Which bucket MAX_PER_PLACE counts in; undefined means uncounted (multi-country). */
function placeKey(event: { countryCode: string; subdivision?: string }, scope: NewsScope): string | undefined {
  if (scope === 'us') return event.subdivision;
  return event.countryCode === 'XX' ? undefined : event.countryCode;
}

/** Fallback note when a correction arrives without one. */
export const DEFAULT_CORRECTION = 'An earlier version of this story on the map has been corrected.';

/**
 * A story's editorial status after this run. A correction marks the story
 * 'corrected' and keeps that note for the rest of its life on the map, so a
 * later update cannot quietly erase that it was once wrong.
 */
function storyStatus(
  staged: { status?: StoryStatus; correction?: string },
  prev: NewsEvent | undefined,
  isCorrection: boolean,
): Pick<NewsEvent, 'status' | 'correction'> {
  if (isCorrection) return { status: 'corrected', correction: staged.correction ?? DEFAULT_CORRECTION };
  if (prev?.status === 'corrected') {
    return { status: 'corrected', correction: prev.correction ?? DEFAULT_CORRECTION };
  }
  return staged.status && staged.status !== 'corrected' ? { status: staged.status } : {};
}

/**
 * The state a US story is in: what the place name says, else the model's
 * (if it is a real US code), else the nearest known city's.
 */
function resolveSubdivision(
  countryCode: string,
  locationName: string,
  lat: number,
  lon: number,
  fromName: string | undefined,
  fromModel: string | undefined,
): string | undefined {
  if (countryCode !== 'US') {
    return fromModel?.startsWith(`${countryCode}-`) ? fromModel : undefined;
  }
  if (fromName) return fromName;
  if (fromModel && US_SUBDIVISIONS.has(fromModel)) return fromModel;
  return subdivisionFor(locationName, lat, lon);
}

/**
 * Deterministic post-processing of agent output: source ratings, trust scores,
 * coordinate reconciliation, stable ids, and continuity with the previous
 * run — a re-reported story keeps its id and its added time, and a story
 * nobody re-reported stays until its severity-scaled lifetime runs out.
 * Nothing here trusts a number the model produced except lat/lon
 * (gazetteer-checked), severity, and the text fields.
 *
 * Scoped: a run matches, updates, carries and caps only the stories of its
 * own scope. Every other story is carried through untouched (the very same
 * object), except that anything past its expiry is dropped by every run.
 */
export function finalizeDataset(
  staged: StagedOutput,
  previous: NewsDataset | null,
  mode: 'daily' | 'breaking',
  opts: FinalizeOptions = {},
): NewsDataset {
  return finalizeScoped(staged, previous, mode, opts).dataset;
}

export function finalizeScoped(
  staged: StagedOutput,
  previous: NewsDataset | null,
  mode: 'daily' | 'breaking',
  opts: FinalizeOptions = {},
): FinalizeReport {
  const now = new Date().toISOString();
  const nowMs = Date.parse(now);
  const scope = opts.scope ?? 'global';
  const retain = opts.retain ?? true;
  const previousEvents = previous?.events ?? [];
  const own = previousEvents.filter((event) => scopeOf(event) === scope);
  const others = previousEvents.filter((event) => scopeOf(event) !== scope);
  const prevById = new Map<string, NewsEvent>(own.map((event) => [event.id, event]));
  /** Previous ids that a staged event continued this run. */
  const continued = new Set<string>();
  const skippedCrossScope: string[] = [];

  const events: NewsEvent[] = [];
  const skippedPerPlace: string[] = [];
  const skippedStale: string[] = [];
  const placeCounts = new Map<string, number>();
  // strongest first, so the per-place limit cuts the smallest angles
  const ordered = [...staged.events].sort((a, b) => b.severity - a.severity);
  for (const stagedEvent of ordered) {
    const sources = buildSources(stagedEvent.sources);
    if (sources.length === 0) continue;

    const coords = reconcileCoordinates(stagedEvent.locationName, stagedEvent.lat, stagedEvent.lon);
    const ownId = stableEventId(stagedEvent.headline, coords.lat, coords.lon);
    if (crossScopeMatch(stagedEvent, coords, others, ownId)) {
      skippedCrossScope.push(stagedEvent.headline);
      continue;
    }
    // a correction names the story it replaces; otherwise the usual continuity match
    const corrected = stagedEvent.corrects ? prevById.get(stagedEvent.corrects) : undefined;
    let prev = corrected ?? (retain ? matchPrevious(stagedEvent, coords, own, ownId) : prevById.get(ownId));
    // two staged events claiming the same story: the first is the update,
    // the second stands on its own
    if (prev && continued.has(prev.id)) prev = undefined;
    if (!prev && isStale(sources, nowMs)) {
      skippedStale.push(stagedEvent.headline);
      continue;
    }
    if (prev) continued.add(prev.id);
    const id = prev?.id ?? ownId;

    // reuse preview images already resolved for the same article URLs
    const previousImages = new Map(
      (prev?.sources ?? []).filter((s) => s.image).map((s) => [s.url, s.image!]),
    );
    for (const source of sources) {
      const carried = previousImages.get(source.url);
      if (carried) source.image = carried;
    }
    // an update keeps the outlets that reported the earlier chapter
    if (prev) {
      const domains = new Set(sources.map((source) => source.domain));
      for (const source of prev.sources) {
        if (sources.length >= MAX_SOURCES) break;
        if (domains.has(source.domain)) continue;
        domains.add(source.domain);
        sources.push({ ...source });
      }
    }

    const countryCode = (coords.cc ?? stagedEvent.countryCode ?? 'XX').toUpperCase();
    const subdivision = resolveSubdivision(
      countryCode,
      stagedEvent.locationName,
      coords.lat,
      coords.lon,
      coords.sub,
      stagedEvent.subdivision,
    );
    const place = placeKey({ countryCode, subdivision }, scope);
    if (place && stagedEvent.severity < 4) {
      const count = placeCounts.get(place) ?? 0;
      if (count >= MAX_PER_PLACE) {
        if (prev) continued.delete(prev.id);
        skippedPerPlace.push(`${stagedEvent.headline} (${place})`);
        continue;
      }
      placeCounts.set(place, count + 1);
    }
    events.push({
      id,
      headline: stagedEvent.headline,
      summary: stagedEvent.summary,
      category: stagedEvent.category,
      severity: stagedEvent.severity,
      lat: coords.lat,
      lon: coords.lon,
      locationName: stagedEvent.locationName,
      countryCode,
      // global stories carry no scope key, so the worldwide file stays byte-stable
      ...(scope !== 'global' ? { scope } : {}),
      ...(subdivision ? { subdivision } : {}),
      sources,
      // carry a previously-resolved preview image forward; enrichment fills gaps
      ...(prev?.image ? { image: prev.image } : {}),
      trustScore: computeTrustScore(sources),
      firstSeen: prev?.firstSeen ?? now,
      lastUpdated: now,
      expiresAt: expiryIso(stagedEvent.severity, now),
      isBreaking: opts.markBreaking ?? false,
      ...storyStatus(stagedEvent, prev, corrected !== undefined),
    });
  }

  if (retain) {
    for (const event of own) {
      if (continued.has(event.id) || isExpired(event, nowMs)) continue;
      const sources = event.sources.map(refreshSource);
      events.push({
        ...event,
        sources,
        trustScore: computeTrustScore(sources),
        expiresAt: event.expiresAt ?? expiryIso(event.severity, event.lastUpdated),
        // breaking means "this hour"; the next daily batch is when it stops being that
        isBreaking: mode === 'daily' ? false : event.isBreaking,
      });
    }
  }
  // another run's stories: never edited, only dropped once expired
  for (const event of others) {
    if (!isExpired(event, nowMs)) events.push(event);
  }

  const caps = { ...SCOPE_CAPS, ...(opts.maxEvents !== undefined ? { [scope]: opts.maxEvents } : {}) };
  return {
    dataset: { generatedAt: now, mode, events: capByScope(events, caps) },
    skippedCrossScope,
    skippedPerPlace,
    skippedStale,
  };
}

/**
 * Re-merge a finished run onto a fresher copy of the dataset (another run may
 * have pushed while this one was researching): this run's scope comes from
 * its own result, every other scope from `fresh`. On an id collision the
 * fresh other-scope story wins. Pure; `generatedAt`, `mode` and `stats` are
 * this run's.
 */
export function remergeScope(fresh: NewsDataset | null, mine: NewsDataset, scope: NewsScope): NewsDataset {
  const nowMs = Date.parse(mine.generatedAt);
  const theirs = (fresh?.events ?? []).filter(
    (event) => scopeOf(event) !== scope && !isExpired(event, nowMs),
  );
  const theirIds = new Set(theirs.map((event) => event.id));
  const ours = mine.events.filter((event) => scopeOf(event) === scope && !theirIds.has(event.id));
  return { ...mine, events: capByScope([...ours, ...theirs], SCOPE_CAPS) };
}

/** Staged events outside the region are not this run's to publish. */
export function keepInRegion(staged: StagedOutput, countryCode: string): {
  kept: StagedOutput;
  dropped: string[];
} {
  const dropped: string[] = [];
  const events = staged.events.filter((event) => {
    const cc = (reconcileCoordinates(event.locationName, event.lat, event.lon).cc ?? event.countryCode).toUpperCase();
    if (cc === countryCode) return true;
    dropped.push(`${event.headline} (${event.locationName}, ${cc})`);
    return false;
  });
  return { kept: { events }, dropped };
}

/**
 * Recount a dataset's headline numbers from the dataset itself, so what the
 * file claims can never drift from what it contains. Recorded on every run
 * because image enrichment fails silently by design: without this, a run that
 * resolved nothing looks exactly like one that had nothing to resolve.
 */
export function computeStats(dataset: NewsDataset): RunStats {
  const sources = dataset.events.flatMap((event) => event.sources);
  const thisRun = (event: NewsEvent) => event.lastUpdated === dataset.generatedAt;
  return {
    imagesResolved: dataset.events.filter((event) => event.image).length,
    sourcesWithImages: sources.filter((source) => source.image).length,
    multiSource: dataset.events.filter((event) => event.sources.length >= 2).length,
    carried: dataset.events.filter((event) => !thisRun(event)).length,
    updated: dataset.events.filter((event) => thisRun(event) && event.firstSeen !== event.lastUpdated)
      .length,
  };
}

/** The least a healthy run adds to its scope; fewer means something went wrong upstream. */
export const MIN_NEW_STORIES: Record<NewsScope, number> = { global: 15, us: 8 };
/** World desk: this many categories with no live story is a lopsided map. */
export const MAX_MISSING_CATEGORIES = 2;
/** World desk: at least this many of the seven areas should have a live story. */
export const MIN_AREAS = 6;

/**
 * Check a finished run's own scope against what a normal day looks like.
 * Pure. A warning is not an error here: the dataset is still written, and the
 * Routine's pre-commit check decides what to do with it.
 */
export function computeHealth(dataset: NewsDataset, scope: NewsScope): RunHealth {
  const own = dataset.events.filter((event) => scopeOf(event) === scope);
  const thisRun = own.filter((event) => event.lastUpdated === dataset.generatedAt);
  const newStories = thisRun.filter((event) => event.firstSeen === event.lastUpdated).length;
  const updatedStories = thisRun.length - newStories;
  const categories = new Set(own.map((event) => event.category));
  const areas = new Set(own.map((event) => areaOf(event)));

  const warnings: string[] = [];
  if (newStories < MIN_NEW_STORIES[scope]) {
    warnings.push(`only ${newStories} new ${scope} stories (expected at least ${MIN_NEW_STORIES[scope]})`);
  }
  if (scope === 'global') {
    const missing = CATEGORIES.filter((category) => !categories.has(category));
    if (missing.length > MAX_MISSING_CATEGORIES) {
      warnings.push(`no live stories in ${missing.length} categories: ${missing.join(', ')}`);
    }
    if (areas.size < MIN_AREAS) {
      const absent = AREA_IDS.filter((area) => !areas.has(area));
      warnings.push(`only ${areas.size}/${AREA_IDS.length} world areas covered; missing ${absent.join(', ')}`);
    }
  }
  return {
    scope,
    newStories,
    updatedStories,
    categoriesCovered: categories.size,
    areasCovered: areas.size,
    warnings,
  };
}

/**
 * Stories of `scope` on the previous map that are gone from the new one —
 * expired or capped out. Counted per scope: another run's stories leaving is
 * not this run's doing.
 */
export function countExpired(previous: NewsDataset | null, next: NewsDataset, scope: NewsScope): number {
  const ids = new Set(next.events.map((event) => event.id));
  return (previous?.events ?? []).filter((event) => scopeOf(event) === scope && !ids.has(event.id)).length;
}
