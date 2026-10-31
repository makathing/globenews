/**
 * Which "story images" are really an outlet's branding.
 *
 * Plenty of publishers fill og:image with a site-wide default — a logo, a
 * share card, an emblem — on every article that has no photo of its own. To a
 * reader that is not a picture of the story; it looks like "just an icon".
 * The enrichment pass (pipeline/src/enrich-images.ts) drops these before they
 * reach the dataset, and the frontend checks again so an older dataset can't
 * show one either. A story left with no image falls through to an
 * illustrative library photo, which is the better picture.
 *
 * Pure string work: no DOM, no Node APIs, so both sides import it.
 */

/**
 * File-name tokens (split on anything not a letter or digit) that mark site
 * furniture rather than a story photo. Whole tokens, so "defaulting-debt.jpg"
 * or "iconic-bridge.jpg" are not caught.
 */
const BRANDING_TOKENS = new Set([
  'logo',
  'logos',
  'emblem',
  'emblems',
  'favicon',
  'favicons',
  'default',
  'defaults',
  'placeholder',
  'placeholders',
  'fallback',
  'sprite',
  'sprites',
  'icon',
  'icons',
  'avatar',
  'avatars',
  'tmpl',
  'themes',
  'wordmark',
  'masthead',
]);

/**
 * The same idea for the folders above the file. Narrower: image CDNs put
 * words like "default" in every URL (AP's "/dims4/default/…", Cloudinary's
 * "t_default"), so only words no story-photo folder would carry.
 */
const BRANDING_DIRS = new Set([
  'logo',
  'logos',
  'emblem',
  'emblems',
  'favicon',
  'favicons',
  'icons',
  'sprites',
  'avatars',
  'placeholder',
  'placeholders',
  'tmpl',
  'themes',
]);

/** Substrings in the *file name* that are branding however they're glued ("nprlogo.png"). */
const BRANDING_FILE_SUBSTRINGS = ['logo', 'favicon', 'emblem', 'placeholder'];

/** Adjacent token pairs that name a share card: "social-share", "share_og", "og-default"… */
const SHARE_CARD = /(?:^|-)(?:social-share|share-card|share-og|share-image|og-share|og-default|default-og|og-image-default|site-share)(?:-|$)/;

/** Site-wide asset folders: "/include/images/" (npr.org) and its kin. */
const SITE_ASSET_DIR = /\/(?:include|includes|assets\/brand|static\/brand|brand|branding)\/(?:images?|img)\//;

/** Anything narrower than this is a thumbnail, a logo or an icon — never a hero. */
export const MIN_STORY_IMAGE_WIDTH = 400;

/**
 * Long top-level domains that do turn up on news and image CDNs. Anything
 * else longer than four letters is treated as a broken host — that is what a
 * page base glued to a relative path produces ("news.un.org" + "internal/…"
 * → "news.un.orginternal").
 */
const LONG_TLDS = new Set([
  'africa',
  'agency',
  'asia',
  'berlin',
  'cloud',
  'digital',
  'global',
  'group',
  'jobs',
  'live',
  'london',
  'media',
  'museum',
  'network',
  'news',
  'online',
  'paris',
  'photo',
  'photos',
  'press',
  'scot',
  'site',
  'space',
  'store',
  'studio',
  'systems',
  'tech',
  'today',
  'tokyo',
  'video',
  'wales',
  'website',
  'world',
]);

/** A real-looking public hostname: dotted labels and a plausible top-level domain. */
export function isPlausibleHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!host.includes('.')) return false;
  const labels = host.split('.');
  if (labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return false;
  const tld = labels[labels.length - 1];
  if (tld.startsWith('xn--')) return true;
  if (!/^[a-z]{2,}$/.test(tld)) return false;
  return tld.length <= 4 || LONG_TLDS.has(tld);
}

/** "phys_308px.png" → 308; "?w=320" → 320. The width an image URL itself admits to, if any. */
export function widthHint(url: URL): number | null {
  const file = url.pathname.split('/').pop() ?? '';
  const px = file.match(/(?:^|[^a-z0-9])(\d{2,4})px(?:[^a-z0-9]|$)/i) ?? file.match(/(?:^|[_-])(\d{2,4})x\d{2,4}(?:[^a-z0-9]|$)/i);
  if (px) return Number(px[1]);
  for (const key of ['w', 'width']) {
    const value = url.searchParams.get(key);
    if (value && /^\d{2,4}$/.test(value)) return Number(value);
  }
  return null;
}

/**
 * Why an image URL is not a story photo, or null if it may be one. `width`
 * is the size the page declared (og:image:width), when it declared one.
 */
export function imageRejectionReason(raw: string, width?: number | null): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 'not a URL';
  }
  if (url.protocol !== 'https:') return 'not https';
  if (!isPlausibleHostname(url.hostname)) return `implausible host "${url.hostname}"`;

  let path: string;
  try {
    path = decodeURIComponent(url.pathname).toLowerCase();
  } catch {
    path = url.pathname.toLowerCase();
  }
  const file = path.split('/').pop() ?? '';
  const stem = file.replace(/\.[a-z0-9]+$/, '');
  // compare share-card pairs with every separator flattened to "-"
  const flatStem = stem.replace(/[^a-z0-9]+/g, '-');
  const fileTokens = stem.split(/[^a-z0-9]+/).filter(Boolean);
  const dirTokens = path.slice(0, path.length - file.length).split(/[^a-z0-9]+/).filter(Boolean);

  const token = fileTokens.find((t) => BRANDING_TOKENS.has(t));
  if (token) return `branding "${token}" in file name`;
  const dir = dirTokens.find((t) => BRANDING_DIRS.has(t));
  if (dir) return `branding folder "${dir}"`;
  const glued = BRANDING_FILE_SUBSTRINGS.find((s) => stem.includes(s));
  if (glued) return `branding "${glued}" in file name`;
  if (SHARE_CARD.test(flatStem)) return 'share card';
  if (SITE_ASSET_DIR.test(path)) return 'site-wide asset folder';

  const declared = width ?? widthHint(url);
  if (declared != null && declared > 0 && declared < MIN_STORY_IMAGE_WIDTH) return `too small (${declared}px)`;
  return null;
}

export function isStoryImage(raw: string, width?: number | null): boolean {
  return imageRejectionReason(raw, width) === null;
}
