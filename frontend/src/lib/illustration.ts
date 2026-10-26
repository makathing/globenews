import type { NewsEvent } from '../../../shared/news';
import type { LibraryPhoto, PhotoLibrary } from '../../../shared/photoLibrary';
import { CATEGORY_DEFAULT_TOPIC, matchTopic } from '../../../shared/topics';

/**
 * The picture a story gets, as an ordered list of things to try.
 *
 * The story's own art comes first (the event's hero, then each source's
 * article image), then an openly licensed library photo of the story's
 * *topic*, then one for the category's default topic, and last a quiet
 * category-colour panel. `StoryArt` renders the first candidate that loads
 * and walks down the list on `onError`, because publishers routinely refuse a
 * hotlinked og:image.
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

export function artChain(
  event: ArtEvent,
  library: PhotoLibrary,
  avoid?: ReadonlySet<string>,
): ArtCandidate[] {
  const chain: ArtCandidate[] = [];
  const seen = new Set<string>();
  const push = (candidate: ArtCandidate & { src: string }) => {
    if (seen.has(candidate.src)) return;
    seen.add(candidate.src);
    chain.push(candidate);
  };

  if (event.image?.url) {
    push({
      kind: 'source',
      key: `event:${event.image.url}`,
      src: event.image.url,
      credit: `via ${event.image.domain}`,
    });
  }
  for (const source of event.sources) {
    if (!source.image) continue;
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
    if (photo) push({ kind: 'library', key: `library:${photo.id}`, src: photo.thumb, photo, topic: id });
  }

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
