import type { LibraryPhoto, PhotoLibrary } from '../../shared/photoLibrary.ts';
import { TOPICS } from '../../shared/topics.ts';

/**
 * The pure half of the illustrative photo library: turning Wikimedia Commons
 * search responses into vetted LibraryPhoto entries, merging them into the
 * committed library, and rendering the review gallery. No network here — the
 * fetching half lives in build-photo-library.ts, so everything that decides
 * *which* photo may stand in for a news story is testable against recorded
 * responses.
 */

export const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
/** Commons asks every client to identify itself; anonymous agents get throttled or blocked. */
export const COMMONS_USER_AGENT = 'GlobeNewsPhotoLibrary/1.0 (https://github.com/makathing/globenews)';
/** Hotlinked thumbnail width: crisp on a story card, light on the wire. */
export const THUMB_WIDTH = 960;
/** Originals narrower than this are usually crops or scans. */
export const MIN_WIDTH = 1200;
/** Cards are landscape; a square or portrait photo crops badly. */
export const MIN_ASPECT = 1.3;
export const PHOTOS_PER_TOPIC = 4;
/** GitHub rejects PR bodies over 65,536 characters; leave headroom. */
export const PR_BODY_LIMIT = 60_000;

const SEARCH_RESULTS = 30;
const ACCEPTED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const FALLBACK_AUTHOR = 'Wikimedia Commons contributor';

/**
 * Words that mark a file as something other than a photograph of the topic —
 * or as a photograph of an identifiable person. Whole words, so "graph" does
 * not reject "photograph".
 */
const REJECT_WORDS =
  /\b(logos?|maps?|flags?|coats? of arms|diagrams?|charts?|graphs?|seals?|portraits?|headshots?|svg|screenshots?|posters?|banners?)\b/i;

/** The Commons search request for one query: bitmaps only, with licence metadata. */
export function commonsSearchUrl(query: string): string {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    generator: 'search',
    gsrnamespace: '6',
    gsrlimit: String(SEARCH_RESULTS),
    gsrsearch: `${query} filetype:bitmap`,
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata|mime',
    iiurlwidth: String(THUMB_WIDTH),
    // ask Commons to refuse us rather than queue us when its replicas lag —
    // the polite-bot convention for non-interactive clients
    maxlag: '5',
  });
  return `${COMMONS_API}?${params.toString()}`;
}

/** A search hit with the facts needed to vet it, before it becomes a LibraryPhoto. */
export interface Candidate {
  photo: LibraryPhoto;
  mime: string;
  /** Plain-text file description, checked for the reject words too. */
  description: string;
  /** Size of the original file — the size filters apply to this, not the thumbnail. */
  originalWidth: number;
  originalHeight: number;
  /** Commons marked it featured, quality or valued. */
  assessed: boolean;
  /** extmetadata NonFree: Commons' own flag for files it hosts under a non-free exception. */
  nonFree: boolean;
  /** Search relevance rank (lower is better). */
  index: number;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** extmetadata values are HTML fragments; credits and titles must be plain text. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
      if (body[0] === '#') {
        const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
      }
      return ENTITIES[body.toLowerCase()] ?? entity;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Only licences that allow reuse on a public site with attribution: CC0,
 * public domain (including the PD-* family), CC BY and CC BY-SA. Anything
 * else — GFDL-only, NC/ND variants, fair use, missing — is refused.
 */
export function isAcceptedLicense(shortName: string): boolean {
  const name = shortName.trim();
  return (
    /^cc0\b/i.test(name) ||
    /^public domain\b/i.test(name) ||
    /^pd(\b|-)/i.test(name) ||
    // "CC BY 4.0", "CC BY-SA 3.0 de", "CC BY-SA 2.5,2.0,1.0" — but not BY-NC / BY-ND
    /^cc[ -]by(-sa)?(\s|$)/i.test(name)
  );
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function meta(extmetadata: Record<string, unknown>, key: string): string {
  const entry = extmetadata[key];
  if (entry && typeof entry === 'object' && 'value' in entry) {
    const value = (entry as { value: unknown }).value;
    return typeof value === 'string' ? value : value == null ? '' : String(value);
  }
  return '';
}

/** "File:Flooded street, Jakarta.jpg" → "Flooded street, Jakarta" */
function titleFromFileName(fileTitle: string): string {
  return fileTitle.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ').trim();
}

/**
 * Turn one `generator=search&prop=imageinfo` response (formatversion=2) into
 * candidates. Tolerant of partial pages — a hit missing its imageinfo or
 * thumbnail is skipped, not fatal. An API-level error throws, so the caller
 * can tell "Commons said no" from "Commons found nothing".
 */
export function parseCommonsResponse(json: unknown): Candidate[] {
  if (!json || typeof json !== 'object') throw new Error('Commons response is not an object');
  const body = json as { error?: { code?: unknown; info?: unknown }; query?: { pages?: unknown } };
  if (body.error) throw new Error(`Commons API error: ${str(body.error.code)} ${str(body.error.info)}`.trim());
  const pages = Array.isArray(body.query?.pages) ? (body.query.pages as unknown[]) : [];

  const candidates: Candidate[] = [];
  pages.forEach((raw, position) => {
    if (!raw || typeof raw !== 'object') return;
    const page = raw as { title?: unknown; index?: unknown; imageinfo?: unknown };
    const id = str(page.title);
    const info = Array.isArray(page.imageinfo) ? (page.imageinfo[0] as Record<string, unknown> | undefined) : undefined;
    if (!id || !info) return;

    const thumb = absoluteUrl(str(info.thumburl) || str(info.url));
    const pageUrl = str(info.descriptionurl);
    if (!thumb || !pageUrl) return;
    const extmetadata =
      info.extmetadata && typeof info.extmetadata === 'object'
        ? (info.extmetadata as Record<string, unknown>)
        : {};

    const assessments = meta(extmetadata, 'Assessments').toLowerCase();
    const author = stripHtml(meta(extmetadata, 'Artist')).slice(0, 160).trim();
    const licenseUrl = meta(extmetadata, 'LicenseUrl').trim();
    const title = stripHtml(meta(extmetadata, 'ObjectName')) || titleFromFileName(id);
    const width = Number(info.thumbwidth ?? info.width) || 0;
    const height = Number(info.thumbheight ?? info.height) || 0;

    candidates.push({
      photo: {
        id,
        thumb,
        page: absoluteUrl(pageUrl),
        title,
        author: author || FALLBACK_AUTHOR,
        license: stripHtml(meta(extmetadata, 'LicenseShortName')),
        ...(licenseUrl ? { licenseUrl: absoluteUrl(licenseUrl) } : {}),
        width,
        height,
      },
      mime: str(info.mime),
      description: stripHtml(meta(extmetadata, 'ImageDescription')),
      originalWidth: Number(info.width) || 0,
      originalHeight: Number(info.height) || 0,
      assessed: /featured|quality|valued/.test(assessments),
      nonFree: /^(true|1|yes)$/i.test(meta(extmetadata, 'NonFree').trim()),
      index: typeof page.index === 'number' ? page.index : position + 1,
    });
  });
  return candidates;
}

/** The API hands back protocol-relative URLs ("//upload…") in places; pin them to https. */
function absoluteUrl(url: string): string {
  return url.startsWith('//') ? `https:${url}` : url;
}

/** Hotlinks only from Wikimedia's own hosts (upload.wikimedia.org and kin). */
function isWikimediaHttps(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'https:' && (hostname === 'wikimedia.org' || hostname.endsWith('.wikimedia.org'));
  } catch {
    return false;
  }
}

/** Why a candidate may not appear on the site, or null if it may. */
export function rejectionReason(candidate: Candidate, blocked: ReadonlySet<string>): string | null {
  const { photo } = candidate;
  if (blocked.has(photo.id)) return 'blocked by a reviewer';
  if (!isAcceptedLicense(photo.license)) return `licence "${photo.license || 'none'}"`;
  if (candidate.nonFree) return 'non-free';
  if (!ACCEPTED_MIME.has(candidate.mime)) return `type ${candidate.mime || 'unknown'}`;
  if (candidate.originalWidth < MIN_WIDTH) return 'too small';
  if (candidate.originalWidth < MIN_ASPECT * candidate.originalHeight) return 'not landscape';
  if (!isWikimediaHttps(photo.thumb)) return 'thumbnail not a Wikimedia https URL';
  for (const text of [photo.id, photo.title, candidate.description]) {
    const word = text.replace(/_/g, ' ').match(REJECT_WORDS);
    if (word) return `"${word[1].toLowerCase()}" in title/description`;
  }
  return null;
}

export function acceptPhoto(candidate: Candidate, blocked: ReadonlySet<string>): boolean {
  return rejectionReason(candidate, blocked) === null;
}

/**
 * Pick a topic's photos from its queries' results: assessed (featured /
 * quality / valued) first, then by search rank, interleaving the queries so
 * one query cannot fill every slot. Skips anything already used by an
 * earlier topic — the same photo on two topics would make unrelated stories
 * look like one — and records what it takes in `used`.
 */
export function selectTopicPhotos(
  resultsPerQuery: readonly Candidate[][],
  blocked: ReadonlySet<string>,
  used: Set<string>,
  limit = PHOTOS_PER_TOPIC,
): LibraryPhoto[] {
  const ranked = resultsPerQuery
    .flatMap((candidates, query) => candidates.map((candidate) => ({ candidate, query })))
    .sort(
      (a, b) =>
        Number(b.candidate.assessed) - Number(a.candidate.assessed) ||
        a.candidate.index - b.candidate.index ||
        a.query - b.query,
    );

  const picked: LibraryPhoto[] = [];
  for (const { candidate } of ranked) {
    if (picked.length >= limit) break;
    if (used.has(candidate.photo.id) || !acceptPhoto(candidate, blocked)) continue;
    used.add(candidate.photo.id);
    picked.push(candidate.photo);
  }
  return picked;
}

export function emptyLibrary(): PhotoLibrary {
  return { version: 1, builtAt: null, topics: {}, blocked: [] };
}

function isPhoto(value: unknown): value is LibraryPhoto {
  if (!value || typeof value !== 'object') return false;
  const photo = value as Record<string, unknown>;
  return (
    ['id', 'thumb', 'page', 'title', 'author', 'license'].every((key) => typeof photo[key] === 'string') &&
    typeof photo.width === 'number' &&
    typeof photo.height === 'number' &&
    (photo.local === undefined || (typeof photo.local === 'string' && /^library\/[a-f0-9]{16}\.webp$/.test(photo.local)))
  );
}

/**
 * Read the committed library strictly. A corrupt file throws rather than
 * falling back to empty: an empty fallback would silently drop the
 * reviewers' `blocked` list and bring rejected photos straight back.
 */
export function parseLibraryFile(json: unknown): PhotoLibrary {
  if (!json || typeof json !== 'object') throw new Error('photo library is not an object');
  const raw = json as Record<string, unknown>;
  if (raw.version !== 1) throw new Error(`unsupported photo library version ${String(raw.version)}`);
  if (!raw.topics || typeof raw.topics !== 'object' || Array.isArray(raw.topics)) {
    throw new Error('photo library "topics" must be an object');
  }
  if (!Array.isArray(raw.blocked) || !raw.blocked.every((id) => typeof id === 'string')) {
    throw new Error('photo library "blocked" must be a list of ids');
  }
  const topics: Record<string, LibraryPhoto[]> = {};
  for (const [topic, photos] of Object.entries(raw.topics as Record<string, unknown>)) {
    if (!Array.isArray(photos) || !photos.every(isPhoto)) {
      throw new Error(`photo library topic "${topic}" has a malformed photo`);
    }
    topics[topic] = photos;
  }
  return {
    version: 1,
    builtAt: typeof raw.builtAt === 'string' ? raw.builtAt : null,
    topics,
    blocked: raw.blocked as string[],
  };
}

/**
 * Fold a refresh into the committed library. `fetched[topic]` is the new
 * selection, or null/absent when that topic's searches failed. A failed or
 * empty topic keeps what it had — a network error must never wipe reviewed
 * photos — minus anything since blocked. `blocked` is carried over as is.
 * `builtAt` only moves when the photos actually changed, so a refresh that
 * finds nothing new leaves the file byte-identical and opens no PR.
 */
export function mergeLibrary(
  existing: PhotoLibrary,
  fetched: Readonly<Record<string, LibraryPhoto[] | null | undefined>>,
  now: string,
): PhotoLibrary {
  const blocked = [...new Set(existing.blocked)];
  const blockedSet = new Set(blocked);
  // a photo Commons hands back again keeps its self-hosted copy: search
  // results never carry `local`, and losing it would churn every refresh
  const localById = new Map<string, string>();
  for (const photos of Object.values(existing.topics)) {
    for (const photo of photos) if (photo.local) localById.set(photo.id, photo.local);
  }
  const keep = (photos: LibraryPhoto[] | undefined) =>
    (photos ?? [])
      .filter((photo) => !blockedSet.has(photo.id))
      .map((photo) => {
        const local = photo.local ?? localById.get(photo.id);
        return local ? { ...photo, local } : photo;
      });

  const topics: Record<string, LibraryPhoto[]> = {};
  // known topics in TOPICS order, so the file diffs cleanly between refreshes
  for (const { id } of TOPICS) {
    const fresh = fetched[id];
    const photos = fresh && fresh.length > 0 ? keep(fresh) : keep(existing.topics[id]);
    if (photos.length > 0) topics[id] = photos;
  }
  // a topic since removed from TOPICS is left as it was, not deleted
  for (const [id, photos] of Object.entries(existing.topics)) {
    if (id in topics) continue;
    const kept = keep(photos);
    if (kept.length > 0) topics[id] = kept;
  }

  // key order is not a change: the seed or a hand edit may order topics differently
  const canonical = (record: Record<string, LibraryPhoto[]>) =>
    JSON.stringify(Object.entries(record).sort(([x], [y]) => x.localeCompare(y)));
  const changed = canonical(topics) !== canonical(existing.topics);
  return {
    version: 1,
    builtAt: changed ? now : existing.builtAt,
    topics,
    blocked,
  };
}

/** Text that is safe inside a markdown table cell. Commons titles are untrusted. */
function cell(text: string): string {
  return text
    .replace(/[\r\n]+/g, ' ')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/([|[\]\\`*_])/g, '\\$1');
}

function attr(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export const REVIEW_INSTRUCTION =
  'To reject a photo, add its id to `blocked` in data/photo-library.json (or delete it) before merging.';

/**
 * The human review gallery (data/photo-library.md): every topic, every photo
 * as a small thumbnail with its title, author, licence and Commons page.
 * It doubles as the refresh PR's body, so a reviewer sees the pictures
 * without opening a single JSON line.
 */
export function renderGallery(library: PhotoLibrary): string {
  const labels = new Map<string, string>(TOPICS.map((topic) => [topic.id, topic.label]));
  const total = Object.values(library.topics).reduce((sum, photos) => sum + photos.length, 0);
  const lines = [
    '# Illustrative photo library',
    '',
    `${total} photo(s) across ${Object.keys(library.topics).length} topic(s), from Wikimedia Commons` +
      (library.builtAt ? `, refreshed ${library.builtAt}.` : '.'),
    '',
    'A story whose own sources have no usable picture shows one of these instead, ' +
      'labelled **Illustrative** and credited. Only CC0, public-domain, CC BY and CC BY-SA files are accepted.',
    '',
    `> **Review:** ${REVIEW_INSTRUCTION}`,
    '',
  ];

  const ids = [...TOPICS.map((topic) => topic.id as string), ...Object.keys(library.topics)];
  for (const id of new Set(ids)) {
    const photos = library.topics[id] ?? [];
    lines.push(`## ${labels.get(id) ?? id} — \`${id}\``, '');
    if (photos.length === 0) {
      lines.push('_No photos — stories on this topic show no illustrative picture._', '');
      continue;
    }
    lines.push('| Photo | Details |', '| --- | --- |');
    for (const photo of photos) {
      const licence = photo.licenseUrl ? `[${cell(photo.license)}](${photo.licenseUrl})` : cell(photo.license);
      lines.push(
        `| <img src="${attr(photo.thumb)}" width="200" alt=""> ` +
          `| **[${cell(photo.title)}](${photo.page})**<br>${cell(photo.author)} · ${licence}<br>\`${photo.id.replace(/`/g, "'")}\` |`,
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * The gallery cut to fit a PR description. GitHub refuses bodies over 65,536
 * characters; cut at a line boundary and point at the full file, which is
 * committed on the same branch.
 */
export function prBody(gallery: string, limit = PR_BODY_LIMIT): string {
  if (gallery.length <= limit) return gallery;
  const note =
    '\n\n_The gallery is truncated here — GitHub caps PR descriptions at 65,536 characters. ' +
    'The full gallery is `data/photo-library.md` on this branch._\n';
  const cut = gallery.lastIndexOf('\n', limit - note.length);
  return gallery.slice(0, cut > 0 ? cut : limit - note.length) + note;
}
