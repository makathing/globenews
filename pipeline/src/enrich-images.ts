import type { NewsDataset, NewsEvent, NewsImage } from '../../shared/news.ts';
import { imageRejectionReason, isPlausibleHostname } from '../../shared/imageFilters.ts';
import { normalizeDomain } from './source-ratings.ts';

/**
 * Article preview enrichment: resolve each event's Open Graph image by
 * fetching source article HTML and extracting og:image / twitter:image.
 * Deterministic, zero model cost. Failures skip silently — many news sites
 * block non-browser fetches, so an image is a bonus, never a requirement.
 */

const FETCH_TIMEOUT_MS = 8_000;
const MAX_HTML_BYTES = 200_000;
const CONCURRENCY = 6;
/** How many sources per event get their own preview image. */
const MAX_PREVIEWS = 3;
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/**
 * Resolve an og:image value against the article it came from. Relative
 * values are legal and common ("/img/a.jpg"); resolving them against the
 * page — never by string concatenation — is what keeps "news.un.org" +
 * "internal/…" from becoming the host "news.un.orginternal". The result must
 * be https on a plausible public hostname.
 */
export function resolveImageUrl(raw: string, pageUrl?: string): string | null {
  const value = raw.replace(/&amp;/g, '&').trim();
  if (!value) return null;
  try {
    const url = pageUrl ? new URL(value, pageUrl) : new URL(value);
    if (url.protocol !== 'https:') return null;
    if (!isPlausibleHostname(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

const OG_IMAGE_PATTERNS = [
  /<meta[^>]+(?:property|name)=["'](?:og:image|og:image:secure_url|og:image:url|twitter:image|twitter:image:src)["'][^>]*content=["']([^"']+)["']/gi,
  /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|og:image:secure_url|og:image:url|twitter:image|twitter:image:src)["']/gi,
];

/**
 * Pull og:image / twitter:image out of an HTML head. Order-tolerant. With
 * `pageUrl`, relative values resolve against the article; without it only
 * absolute URLs count. Returns the first usable value.
 */
export function extractOgImage(html: string, pageUrl?: string): string | null {
  const head = html.slice(0, MAX_HTML_BYTES);
  for (const pattern of OG_IMAGE_PATTERNS) {
    for (const match of head.matchAll(pattern)) {
      const url = resolveImageUrl(match[1], pageUrl);
      if (url) return url;
    }
  }
  return null;
}

/** The og:image:width the page declares, when it declares one. */
export function extractOgImageWidth(html: string): number | null {
  const head = html.slice(0, MAX_HTML_BYTES);
  const match =
    head.match(/<meta[^>]+(?:property|name)=["']og:image:width["'][^>]*content=["'](\d+)["']/i) ??
    head.match(/<meta[^>]+content=["'](\d+)["'][^>]*(?:property|name)=["']og:image:width["']/i);
  return match ? Number(match[1]) : null;
}

/**
 * The article's story photo, or null when it has none — including when the
 * only og:image is the outlet's logo, share card or a thumbnail.
 */
export function extractStoryImage(html: string, pageUrl: string): string | null {
  const url = extractOgImage(html, pageUrl);
  if (!url) return null;
  return imageRejectionReason(url, extractOgImageWidth(html)) === null ? url : null;
}

/**
 * Pull the site's own icon out of an HTML head, absolute-ised against the page
 * it came from. This is the fallback art for a story whose article has no
 * og:image, or whose publisher refuses a hotlinked one — taken from the same
 * fetch rather than a third-party favicon service, which would hand every
 * viewer's reading list to another host.
 */
export function extractIconHref(html: string, pageUrl: string): string | null {
  const head = html.slice(0, MAX_HTML_BYTES);
  // apple-touch-icon first: it is a real bitmap at a useful size, where
  // rel="icon" is often a 16px .ico that looks like mud in a preview tile
  const patterns = [
    /<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]*href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]*rel=["'][^"']*apple-touch-icon[^"']*["']/i,
    /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i,
  ];
  for (const pattern of patterns) {
    const match = head.match(pattern);
    if (!match) continue;
    const raw = match[1].replace(/&amp;/g, '&').trim();
    try {
      const url = new URL(raw, pageUrl);
      if (url.protocol !== 'https:') continue;
      return url.toString();
    } catch {
      continue;
    }
  }
  return null;
}

async function fetchHtml(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
    });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html')) return null;
    const reader = res.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    await reader.cancel().catch(() => {});
    return Buffer.concat(chunks).toString('utf8');
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve a preview image per source (up to MAX_PREVIEWS), so the UI can show
 * several outlets' art side by side rather than one hero. Sets `source.image`
 * in place and returns the first hit for the event-level hero.
 */
async function resolveEventImages(
  event: NewsEvent,
  icons: OutletIcons,
): Promise<NewsImage | undefined> {
  // best sources first; skip low-reliability outlets — their preview art
  // shouldn't front a verified story. A homepage's og:image is the outlet's
  // generic banner, not this story's art.
  const candidates = [...event.sources]
    .filter((source) => source.reliability >= 50 && !source.image && !source.homepage)
    .sort((a, b) => b.reliability - a.reliability)
    .slice(0, MAX_PREVIEWS);

  await Promise.all(
    candidates.map(async (source) => {
      const html = await fetchHtml(source.url);
      if (!html) return;
      const imageUrl = extractStoryImage(html, source.url);
      if (imageUrl) source.image = imageUrl;
      // one fetch, two answers: the article's art and the outlet's mark
      const domain = normalizeDomain(new URL(source.url).hostname);
      if (!icons[domain]) {
        const icon = extractIconHref(html, source.url);
        if (icon) icons[domain] = icon;
      }
    }),
  );

  // stamp every source from the cache, including ones we never fetched and
  // ones whose fetch failed today but succeeded on an earlier run
  for (const source of event.sources) {
    const domain = normalizeDomain(new URL(source.url).hostname);
    if (icons[domain]) source.icon = icons[domain];
  }

  const hero = event.sources.find((source) => source.image);
  return hero?.image
    ? { url: hero.image, domain: normalizeDomain(new URL(hero.url).hostname) }
    : undefined;
}

/** Domain -> the outlet's own icon URL, cached across runs in data/outlet-icons.json. */
export type OutletIcons = Record<string, string>;

/** Well-known publishers used only to test whether publishers are reachable at all. */
export const PROBE_HOSTS = ['https://www.reuters.com/', 'https://apnews.com/', 'https://www.bbc.co.uk/'];
const PROBE_TIMEOUT_MS = 5_000;

/**
 * Can this process reach news publishers? The pipeline's own environment
 * often cannot — every publisher 403s at an egress proxy — and enrichment
 * fails silently by design, so without this a blocked run looks identical to
 * a run where no article had an og:image. It also spent ~76s of fetch
 * timeouts finding that out. Ask up front, once, in parallel; any 2xx/3xx
 * from any host is enough. `fetchImpl` is injectable for tests.
 */
export async function probeEgress(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const attempts = PROBE_HOSTS.map(async (url) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      const res = await fetchImpl(url, {
        method: 'HEAD',
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'user-agent': UA },
      });
      return res.status >= 200 && res.status < 400;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  });
  return (await Promise.all(attempts)).some(Boolean);
}

/**
 * How many different stories one outlet may illustrate with the very same
 * image URL before that image counts as the outlet's default art.
 */
export const SHARED_IMAGE_LIMIT = 1;

/**
 * Drop images that are not pictures of their story, in place: anything the
 * branding rules reject (shared/imageFilters.ts), and any image one outlet
 * uses on more than SHARED_IMAGE_LIMIT different stories in the dataset —
 * which is its site-wide default whatever the file is called. The hero is
 * re-picked from what remains, or removed, so the frontend falls through to
 * an illustrative library photo rather than an outlet's logo.
 *
 * Runs over images already in the dataset as well as freshly resolved ones:
 * an inline run, or an earlier dataset, may carry images from before these
 * rules existed. Returns how many image references it removed.
 */
export function scrubStoryImages(dataset: NewsDataset): number {
  const domainOf = (url: string) => {
    try {
      return normalizeDomain(new URL(url).hostname);
    } catch {
      return '';
    }
  };

  // outlet|image → the stories it appears on
  const usage = new Map<string, Set<string>>();
  const note = (domain: string, image: string, eventId: string) => {
    const key = `${domain}|${image}`;
    let events = usage.get(key);
    if (!events) usage.set(key, (events = new Set()));
    events.add(eventId);
  };
  for (const event of dataset.events) {
    for (const source of event.sources) {
      if (source.image) note(domainOf(source.url), source.image, event.id);
    }
    if (event.image?.url) note(event.image.domain, event.image.url, event.id);
  }
  const shared = (domain: string, image: string) =>
    (usage.get(`${domain}|${image}`)?.size ?? 0) > SHARED_IMAGE_LIMIT;

  let removed = 0;
  for (const event of dataset.events) {
    for (const source of event.sources) {
      if (!source.image) continue;
      if (imageRejectionReason(source.image) || shared(domainOf(source.url), source.image)) {
        delete source.image;
        removed += 1;
      }
    }
    const hero = event.image;
    if (hero && (imageRejectionReason(hero.url) || shared(hero.domain, hero.url))) {
      removed += 1;
      const replacement = event.sources.find((source) => source.image);
      if (replacement?.image) {
        event.image = { url: replacement.image, domain: domainOf(replacement.url) };
      } else {
        delete event.image;
      }
    }
  }
  return removed;
}

/** Mutates the dataset in place, attaching preview images where resolvable. */
export async function enrichImages(
  dataset: NewsDataset,
  icons: OutletIcons = {},
): Promise<{ resolved: number; scrubbed: number; icons: OutletIcons }> {
  let resolved = 0;
  const queue = [...dataset.events];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const event = queue.shift();
      if (!event) return;
      const image = await resolveEventImages(event, icons);
      if (image && !event.image) {
        event.image = image;
        resolved += 1;
      }
    }
  });
  await Promise.all(workers);
  const before = dataset.events.filter((event) => event.image).length;
  const scrubbed = scrubStoryImages(dataset);
  // a hero that was only an outlet's default art was never really resolved
  resolved = Math.max(0, resolved - (before - dataset.events.filter((event) => event.image).length));
  return { resolved, scrubbed, icons };
}
