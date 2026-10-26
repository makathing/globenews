import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { LibraryPhoto, PhotoLibrary } from '../../shared/photoLibrary.ts';
import { TOPICS } from '../../shared/topics.ts';
import { PHOTO_GALLERY_PATH, PHOTO_LIBRARY_PATH, STAGING_DIR, signalChanged } from './io.ts';
import {
  COMMONS_API,
  type Candidate,
  commonsSearchUrl,
  emptyLibrary,
  mergeLibrary,
  parseCommonsResponse,
  parseLibraryFile,
  prBody,
  rejectionReason,
  renderGallery,
  selectTopicPhotos,
} from './photo-library.ts';

/**
 * Refresh the illustrative photo library from Wikimedia Commons.
 *
 * Runs in GitHub Actions (`photo-library.yml`), which has the egress the
 * pipeline's own environment lacks, and never lands anything by itself: the
 * workflow opens a pull request whose body is the rendered gallery, and a
 * person reviews the pictures before they can appear next to a news story.
 *
 * Writes data/photo-library.json, data/photo-library.md (the gallery), and
 * pipeline/.staging/photo-library-pr.md (the gallery cut to GitHub's PR body
 * limit). Exits non-zero, writing nothing, when Commons is unreachable — a
 * manually dispatched refresh that silently did nothing would look like one
 * that found nothing new.
 */

/** Commons asks every client to identify itself; anonymous agents get throttled or blocked. */
const UA = 'GlobeNewsPhotoLibrary/1.0 (https://github.com/makathing/globenews)';
const FETCH_TIMEOUT_MS = 20_000;
/** Sequential with a pause: ~100 requests over a couple of minutes is a polite load. */
const REQUEST_DELAY_MS = 750;
const MAX_ATTEMPTS = 3;
const PR_BODY_PATH = resolve(STAGING_DIR, 'photo-library-pr.md');

const sleep = (ms: number) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

/**
 * One Commons API GET. Retries what Commons asks to be retried — maxlag
 * refusals and 429/503 — after the delay it names; anything else throws.
 */
async function fetchCommons(url: string): Promise<unknown> {
  for (let attempt = 1; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'user-agent': UA, accept: 'application/json' },
      });
      const retryAfter = Number(res.headers.get('retry-after')) || 5;
      if (res.status === 429 || res.status === 503) {
        if (attempt >= MAX_ATTEMPTS) throw new Error(`HTTP ${res.status} after ${attempt} attempts`);
        await sleep(retryAfter * 1000);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { error?: { code?: string } };
      if (json.error?.code === 'maxlag' && attempt < MAX_ATTEMPTS) {
        await sleep(retryAfter * 1000);
        continue;
      }
      return json;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Can this process reach Commons at all? One cheap request before ~100 real ones. */
async function probeCommons(): Promise<string | null> {
  try {
    await fetchCommons(`${COMMONS_API}?action=query&meta=siteinfo&format=json&formatversion=2`);
    return null;
  } catch (error) {
    return describe(error);
  }
}

function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? `: ${error.cause.message}` : '';
  return `${error.message}${cause}`;
}

function readLibrary(): PhotoLibrary {
  if (!existsSync(PHOTO_LIBRARY_PATH)) return emptyLibrary();
  // parseLibraryFile throws on a corrupt file, on purpose: falling back to
  // empty would drop the reviewers' blocked list
  return parseLibraryFile(JSON.parse(readFileSync(PHOTO_LIBRARY_PATH, 'utf8')));
}

async function main(): Promise<void> {
  const existing = readLibrary();
  const blocked = new Set(existing.blocked);

  const unreachable = await probeCommons();
  if (unreachable) {
    console.error(`::error::[photo-library] Wikimedia Commons is unreachable (${unreachable}).`);
    console.error('[photo-library] nothing fetched; data/photo-library.json left untouched');
    process.exit(1);
  }

  // fetch everything first, select after: de-duplication across topics needs
  // to know which topics failed and are keeping their old photos
  const results = new Map<string, Candidate[][] | null>();
  const rejected = new Map<string, number>();
  let requests = 0;
  let failures = 0;
  for (const topic of TOPICS) {
    const perQuery: Candidate[][] = [];
    for (const query of topic.search) {
      if (requests++ > 0) await sleep(REQUEST_DELAY_MS);
      try {
        const candidates = parseCommonsResponse(await fetchCommons(commonsSearchUrl(query)));
        perQuery.push(candidates);
        for (const candidate of candidates) {
          const reason = rejectionReason(candidate, blocked);
          if (reason) rejected.set(reason, (rejected.get(reason) ?? 0) + 1);
        }
      } catch (error) {
        failures += 1;
        console.warn(`[photo-library] ${topic.id}: "${query}" failed — ${describe(error)}`);
      }
    }
    // a topic with at least one answered query is refreshed from what came back
    results.set(topic.id, perQuery.length > 0 ? perQuery : null);
  }

  if ([...results.values()].every((value) => value === null)) {
    console.error(`::error::[photo-library] all ${requests} Commons searches failed.`);
    console.error('[photo-library] data/photo-library.json left untouched');
    process.exit(1);
  }

  // photos a failed topic keeps may not be handed to another topic too
  const used = new Set<string>();
  for (const [id, perQuery] of results) {
    if (perQuery === null) for (const photo of existing.topics[id] ?? []) used.add(photo.id);
  }
  const fetched: Record<string, LibraryPhoto[] | null> = {};
  for (const [id, perQuery] of results) {
    fetched[id] = perQuery === null ? null : selectTopicPhotos(perQuery, blocked, used);
  }

  const library = mergeLibrary(existing, fetched, new Date().toISOString());
  const changed = JSON.stringify(library) !== JSON.stringify(existing);
  const gallery = renderGallery(library);

  writeFileSync(PHOTO_LIBRARY_PATH, JSON.stringify(library, null, 2) + '\n');
  writeFileSync(PHOTO_GALLERY_PATH, gallery);
  mkdirSync(STAGING_DIR, { recursive: true });
  writeFileSync(PR_BODY_PATH, prBody(gallery));

  for (const topic of TOPICS) {
    const fresh = fetched[topic.id];
    const kept = library.topics[topic.id]?.length ?? 0;
    const note =
      fresh === null
        ? ' (searches failed — kept previous photos)'
        : fresh.length === 0
          ? ' (nothing acceptable — kept previous photos)'
          : '';
    console.log(`[photo-library] ${topic.id.padEnd(16)} ${kept} photo(s)${note}`);
  }
  // the commonest reasons say whether a filter is too strict or a query too poor
  const reasons = [...rejected]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([reason, n]) => `${reason} ×${n}`);
  console.log(`[photo-library] top rejections: ${reasons.join(', ') || 'none'}`);
  console.log(`[photo-library] ${requests} searches, ${failures} failed; library ${changed ? 'updated' : 'unchanged'}`);
  signalChanged(changed);
}

main().catch((error) => {
  console.error('[photo-library] failed:', error);
  process.exit(1);
});
