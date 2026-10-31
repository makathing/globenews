import { isStoryImage } from '../../../shared/imageFilters';
import type { NewsEvent } from '../../../shared/news';
import type { LibraryPhoto, PhotoLibrary } from '../../../shared/photoLibrary';
import { CATEGORY_DEFAULT_TOPIC, matchTopic } from '../../../shared/topics';

/**
 * The picture a story gets, as an ordered list of things to try.
 *
 * The story's own art comes first (the event's hero, then each source's
 * article image, minus anything that is really the outlet's logo or share
 * card), then an openly licensed library photo of the story's *topic*, then
 * one for the category's default topic, and last a quiet category-colour
 * panel. Each library photo is offered twice: the copy this site hosts
 * itself, then the Commons thumbnail — so the panel is reached only when even
 * our own file fails. `StoryArt` renders the first candidate that loads and
 * walks down the list on error, timeout, or a picture that turns out to be a
 * logo-sized or banner-shaped image (`judgeLoadedImage`).
 */
export type ArtCandidate =
  | {
      kind: 'source';
      /** Stable key for React and for de-duplication. */
      key: string;
      src: string;
      /** "via reuters.com" */
      credit: string;
    }
  | {
      kind: 'library';
      key: string;
      src: string;
      photo: LibraryPhoto;
      topic: string;
      /** Served from this site (frontend/public/library), not hotlinked. */
      selfHosted: boolean;
    }
  | { kind: 'panel'; key: 'panel' };

/** FNV-1a: small, stable across runs and platforms — the same story always draws the same photo. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * One library photo for a topic: a deterministic draw from the story id over
 * the topic's usable photos, moving on to the next unused one when `avoid`
 * says a nearby card already shows it (and settling for a repeat when every
 * photo is taken).
 */
export function pickLibraryPhoto(
  photos: LibraryPhoto[] | undefined,
  seed: string,
  blocked: ReadonlySet<string>,
  avoid?: ReadonlySet<string>,
): LibraryPhoto | undefined {
  const usable = (photos ?? []).filter((photo) => photo.thumb && !blocked.has(photo.id));
  if (usable.length === 0) return undefined;
  const start = hashString(seed) % usable.length;
  if (avoid && avoid.size > 0) {
    for (let i = 0; i < usable.length; i++) {
      const photo = usable[(start + i) % usable.length];
      if (!avoid.has(photo.id)) return photo;
    }
  }
  return usable[start];
}

type ArtEvent = Pick<NewsEvent, 'id' | 'headline' | 'summary' | 'category' | 'sources' | 'image'>;

/** The site's base path ("./" in the Pages build), for self-hosted library photos. */
const SITE_BASE: string = import.meta.env?.BASE_URL ?? '/';

/** A loaded image narrower than this is a thumbnail or a logo, not a card picture. */
export const MIN_LOADED_WIDTH = 200;
/** Wider than 4:1 (or taller than 1:4) is a banner, a wordmark or a spacer strip. */
export const MAX_ASPECT = 4;

/**
 * Whether a picture that loaded is fit to show. Publishers' "images" include
 * tracking pixels, outlet wordmarks and tiny thumbnails; those load fine, so
 * only their size gives them away.
 */
export function judgeLoadedImage(width: number, height: number): 'ok' | 'too-small' | 'bad-shape' {
  if (!(width >= MIN_LOADED_WIDTH) || !(height > 0)) return 'too-small';
  const ratio = width / height;
  if (ratio > MAX_ASPECT || ratio < 1 / MAX_ASPECT) return 'bad-shape';
  return 'ok';
}

/** Images from another host get no Referer; the site's own files don't need hiding. */
export function isRemoteSrc(src: string): boolean {
  return /^(?:https?:)?\/\//i.test(src);
}

export function artChain(
  event: ArtEvent,
  library: PhotoLibrary,
  avoid?: ReadonlySet<string>,
  base: string = SITE_BASE,
): ArtCandidate[] {
  const chain: ArtCandidate[] = [];
  const seen = new Set<string>();
  const push = (candidate: ArtCandidate & { src: string }) => {
    if (seen.has(candidate.src)) return;
    seen.add(candidate.src);
    chain.push(candidate);
  };

  if (event.image?.url && isStoryImage(event.image.url)) {
    push({
      kind: 'source',
      key: `event:${event.image.url}`,
      src: event.image.url,
      credit: `via ${event.image.domain}`,
    });
  }
  for (const source of event.sources) {
    // an older dataset can still carry an outlet's logo or share card
    if (!source.image || !isStoryImage(source.image)) continue;
    push({
      kind: 'source',
      key: `source:${source.image}`,
      src: source.image,
      credit: `via ${source.domain}`,
    });
  }

  const blocked = new Set(library.blocked);
  const topic = matchTopic(event);
  const fallbackTopic = CATEGORY_DEFAULT_TOPIC[event.category];
  for (const id of topic === fallbackTopic ? [topic] : [topic, fallbackTopic]) {
    const photo = pickLibraryPhoto(library.topics[id], event.id, blocked, avoid);
    if (!photo) continue;
    if (photo.local) {
      push({
        kind: 'library',
        key: `library:${photo.id}:local`,
        src: `${base}${photo.local}`,
        photo,
        topic: id,
        selfHosted: true,
      });
    }
    push({ kind: 'library', key: `library:${photo.id}`, src: photo.thumb, photo, topic: id, selfHosted: false });
  }

  // always last, and only once: reached when even our own copy fails
  chain.push({ kind: 'panel', key: 'panel' });
  return chain;
}

/**
 * Chains for a list of stories in display order, spreading library photos so
 * neighbouring cards don't repeat one. Only stories with no art of their own
 * claim a photo: the others will most likely show their own picture.
 */
export function artChains(
  events: readonly ArtEvent[],
  library: PhotoLibrary,
): Map<string, ArtCandidate[]> {
  const used = new Set<string>();
  const chains = new Map<string, ArtCandidate[]>();
  for (const event of events) {
    const chain = artChain(event, library, used);
    const first = chain[0];
    if (first.kind === 'library') used.add(first.photo.id);
    chains.set(event.id, chain);
  }
  return chains;
}
