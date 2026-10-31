import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PHOTO_GALLERY_PATH, PHOTO_LIBRARY_LOCAL_DIR, PHOTO_LIBRARY_PATH, STAGING_DIR, signalChanged } from './io.ts';
import { commonsImageFetcher, localiseLibrary, sharpConverter } from './localise-photos.ts';
import { COMMONS_USER_AGENT, parseLibraryFile, prBody, renderGallery } from './photo-library.ts';

/**
 * Self-host the photos already in data/photo-library.json — no Commons
 * search, no change to which photos are in the library. A one-off for
 * libraries built before photos were self-hosted; afterwards the full refresh
 * (build-photo-library.ts) keeps the files in step by itself.
 *
 * Runs in GitHub Actions (photo-library.yml, on a pushed branch named
 * photo-library/localise*), which can reach Commons. Exits non-zero only when
 * the library has photos and not one of them could be self-hosted — that is
 * a blocked runner, not a partial success.
 */

const REQUEST_DELAY_MS = 400;
const PR_BODY_PATH = resolve(STAGING_DIR, 'photo-library-pr.md');

async function main(): Promise<void> {
  if (!existsSync(PHOTO_LIBRARY_PATH)) {
    console.error('[photo-library] no data/photo-library.json — nothing to self-host');
    process.exit(1);
  }
  const before = readFileSync(PHOTO_LIBRARY_PATH, 'utf8');
  const existing = parseLibraryFile(JSON.parse(before));
  const total = Object.values(existing.topics).reduce((sum, photos) => sum + photos.length, 0);

  const result = await localiseLibrary(existing, {
    dir: PHOTO_LIBRARY_LOCAL_DIR,
    fetchImage: commonsImageFetcher(COMMONS_USER_AGENT),
    convert: await sharpConverter(),
    pause: () => new Promise<void>((r) => setTimeout(r, REQUEST_DELAY_MS)),
    log: (line) => console.warn(line),
  });

  const json = JSON.stringify(result.library, null, 2) + '\n';
  writeFileSync(PHOTO_LIBRARY_PATH, json);
  const gallery = renderGallery(result.library);
  writeFileSync(PHOTO_GALLERY_PATH, gallery);
  mkdirSync(STAGING_DIR, { recursive: true });
  writeFileSync(PR_BODY_PATH, prBody(gallery));

  console.log(
    `[photo-library] ${total} photo(s): ${result.downloaded} downloaded, ${result.reused} already local, ` +
      `${result.failed.length} failed, ${result.removed.length} orphan file(s) removed`,
  );
  signalChanged(json !== before || result.downloaded > 0 || result.removed.length > 0);

  if (total > 0 && result.downloaded + result.reused === 0) {
    console.error('::error::[photo-library] could not self-host a single photo — is Commons reachable?');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[photo-library] failed:', error);
  process.exit(1);
});
