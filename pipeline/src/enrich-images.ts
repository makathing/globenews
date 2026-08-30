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

async function resolveEventImage(event: NewsEvent): Promise<NewsImage | undefined> {
  // best sources first; skip low-reliability outlets — their preview art
  // shouldn't front a verified story
  const candidates = [...event.sources]
    .filter((source) => source.reliability >= 50)
    .sort((a, b) => b.reliability - a.reliability)
    .slice(0, 3);

  for (const source of candidates) {
    const html = await fetchHtml(source.url);
    if (!html) continue;
    const imageUrl = extractOgImage(html);
    if (imageUrl) {
      return { url: imageUrl, domain: normalizeDomain(new URL(source.url).hostname) };
    }
  }
  return undefined;
}

/** Mutates the dataset in place, attaching preview images where resolvable. */
export async function enrichImages(dataset: NewsDataset): Promise<{ resolved: number }> {
  let resolved = 0;
  const queue = [...dataset.events];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const event = queue.shift();
      if (!event) return;
      if (event.image) continue; // carried over from a previous run
      const image = await resolveEventImage(event);
      if (image) {
        event.image = image;
        resolved += 1;
      }
    }
  });
  await Promise.all(workers);
  return { resolved };
}
