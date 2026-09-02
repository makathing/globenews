import type { NewsDataset, NewsEvent, NewsImage } from '../../shared/news.ts';
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

/** Pull og:image / twitter:image out of an HTML head. Order-tolerant. */
export function extractOgImage(html: string): string | null {
  const head = html.slice(0, MAX_HTML_BYTES);
  const patterns = [
    /<meta[^>]+(?:property|name)=["'](?:og:image|og:image:secure_url|twitter:image)["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|og:image:secure_url|twitter:image)["']/i,
  ];
  for (const pattern of patterns) {
    const match = head.match(pattern);
    if (!match) continue;
    const raw = match[1].replace(/&amp;/g, '&').trim();
    try {
      const url = new URL(raw);
      if (url.protocol !== 'https:') continue;
      return url.toString();
    } catch {
      continue;
    }
  }
  return null;
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
  // shouldn't front a verified story
  const candidates = [...event.sources]
    .filter((source) => source.reliability >= 50 && !source.image)
    .sort((a, b) => b.reliability - a.reliability)
    .slice(0, MAX_PREVIEWS);

  await Promise.all(
    candidates.map(async (source) => {
      const html = await fetchHtml(source.url);
      if (!html) return;
      const imageUrl = extractOgImage(html);
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

/** Mutates the dataset in place, attaching preview images where resolvable. */
export async function enrichImages(
  dataset: NewsDataset,
  icons: OutletIcons = {},
): Promise<{ resolved: number; icons: OutletIcons }> {
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
  return { resolved, icons };
}
