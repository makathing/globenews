import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { LibraryPhoto, PhotoLibrary } from '../../shared/photoLibrary.ts';

/**
 * Self-hosting the illustrative photo library.
 *
 * A library photo is the last real picture a story can show before the
 * plain category panel, so it must not depend on a third party agreeing to
 * be hotlinked from a reader's phone. Each selected photo's Commons thumbnail
 * is downloaded once (in CI, where Commons is reachable), shrunk to a card-
 * sized WebP, and committed under frontend/public/library/. The frontend
 * tries that copy first and the Commons thumbnail second.
 *
 * Network and image codec are injected, so everything that decides which
 * files exist, which are reused and which are deleted is testable offline.
 */

/** Served path prefix, relative to the site base; also the folder under frontend/public/. */
export const LIBRARY_PUBLIC_PREFIX = 'library';
/** Width of the self-hosted copy: a card is at most ~420 CSS px wide, so 640 covers 1.5× screens. */
export const LOCAL_WIDTH = 640;
export const LOCAL_QUALITY = 72;

/** frontend/public/library/<sha1(id)[0..16]>.webp — stable per photo id, safe as a file name. */
export function localFileName(id: string): string {
  return `${createHash('sha1').update(id).digest('hex').slice(0, 16)}.webp`;
}

export function localPath(id: string): string {
  return `${LIBRARY_PUBLIC_PREFIX}/${localFileName(id)}`;
}

/** Download one image; resolve to its bytes or throw. */
export type ImageFetcher = (url: string) => Promise<Uint8Array>;
/** Turn downloaded bytes into the stored WebP. */
export type ImageConverter = (input: Uint8Array) => Promise<Uint8Array>;

export interface LocaliseOptions {
  /** Absolute path of frontend/public/library. */
  dir: string;
  fetchImage: ImageFetcher;
  convert: ImageConverter;
  /** Called between downloads, to keep the load on Commons polite. */
  pause?: () => Promise<void>;
  log?: (line: string) => void;
}

export interface LocaliseResult {
  library: PhotoLibrary;
  downloaded: number;
  reused: number;
  failed: string[];
  removed: string[];
}

/**
 * Give every photo in the library a self-hosted copy, returning a new
 * library whose photos carry `local` exactly when their file exists.
 *
 *  - a file already on disk is reused, never re-downloaded;
 *  - a photo whose download or conversion fails keeps no `local` (the
 *    frontend then hotlinks its Commons thumbnail) — it is never fatal;
 *  - .webp files no photo points at any more are deleted, so a refresh that
 *    swaps photos leaves no orphans behind.
 */
export async function localiseLibrary(library: PhotoLibrary, options: LocaliseOptions): Promise<LocaliseResult> {
  const { dir, fetchImage, convert, pause, log = () => {} } = options;
  mkdirSync(dir, { recursive: true });

  const wanted = new Set<string>();
  const failed: string[] = [];
  let downloaded = 0;
  let reused = 0;
  let requests = 0;
  // one photo can only be in one topic, but don't fetch twice if a hand edit duplicated it
  const done = new Map<string, boolean>();

  const topics: Record<string, LibraryPhoto[]> = {};
  for (const [topic, photos] of Object.entries(library.topics)) {
    const out: LibraryPhoto[] = [];
    for (const photo of photos) {
      const file = localFileName(photo.id);
      wanted.add(file);
      const target = resolve(dir, file);
      let ok = done.get(photo.id);
      if (ok === undefined) {
        if (existsSync(target) && statSync(target).size > 0) {
          ok = true;
          reused += 1;
        } else {
          try {
            if (requests++ > 0 && pause) await pause();
            const bytes = await convert(await fetchImage(photo.thumb));
            if (bytes.length === 0) throw new Error('converter produced an empty file');
            writeFileSync(target, bytes);
            ok = true;
            downloaded += 1;
          } catch (error) {
            ok = false;
            failed.push(photo.id);
            log(`[photo-library] could not self-host ${photo.id}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        done.set(photo.id, ok);
      }
      const { local: _previous, ...rest } = photo;
      out.push(ok ? { ...rest, local: localPath(photo.id) } : rest);
    }
    topics[topic] = out;
  }

  const removed: string[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.webp') || wanted.has(name)) continue;
    rmSync(resolve(dir, name), { force: true });
    removed.push(name);
  }

  return { library: { ...library, topics }, downloaded, reused, failed, removed };
}

/** The production codec: sharp, loaded lazily so tests and type-checks never need its native binary. */
export async function sharpConverter(): Promise<ImageConverter> {
  const { default: sharp } = await import('sharp');
  return async (input) =>
    new Uint8Array(
      await sharp(input)
        .rotate()
        .resize({ width: LOCAL_WIDTH, withoutEnlargement: true })
        .webp({ quality: LOCAL_QUALITY })
        .toBuffer(),
    );
}

/**
 * A fetcher for Commons thumbnails: identifies itself (Commons throttles
 * anonymous agents), times out, retries 429/503 once after the delay asked.
 * The thumb URL in the library is a standard Commons size (960px), which
 * Commons has pre-rendered and cached; it is shrunk to LOCAL_WIDTH locally
 * rather than asking Commons to render a non-standard width.
 */
export function commonsImageFetcher(userAgent: string, timeoutMs = 30_000): ImageFetcher {
  return async (url) => {
    for (let attempt = 1; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, { signal: controller.signal, headers: { 'user-agent': userAgent, accept: 'image/*' } });
        if ((res.status === 429 || res.status === 503) && attempt < 3) {
          const wait = Number(res.headers.get('retry-after')) || 5;
          await new Promise((r) => setTimeout(r, wait * 1000));
          continue;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const type = res.headers.get('content-type') ?? '';
        if (!type.startsWith('image/')) throw new Error(`not an image (${type || 'no content-type'})`);
        return new Uint8Array(await res.arrayBuffer());
      } finally {
        clearTimeout(timer);
      }
    }
  };
}
