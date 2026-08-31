import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(here, '..', 'data', 'events.json');

/** Deployed origin — override with SITE_URL when hosting elsewhere. */
const SITE = (process.env.SITE_URL ?? 'https://makathing.github.io/globenews/').replace(/\/?$/, '/');

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function loadDataset() {
  if (!existsSync(DATA)) return { generatedAt: new Date().toISOString(), events: [] };
  try {
    return JSON.parse(readFileSync(DATA, 'utf8'));
  } catch {
    return { generatedAt: new Date().toISOString(), events: [] };
  }
}

/** Top stories drive the description so the snippet reflects today, not boilerplate. */
function describe(events) {
  const top = [...events]
    .sort((a, b) => b.severity - a.severity || b.trustScore - a.trustScore)
    .slice(0, 3)
    .map((e) => e.headline.replace(/\s+/g, ' ').slice(0, 70));
  const base = `${events.length} verified world events on a live 3D globe, each corroborated across independent sources and scored for trust.`;
  return top.length ? `${base} Today: ${top.join(' · ')}` : base;
}

function head({ title, description, url, image, jsonLd }) {
  return [
    `<meta name="description" content="${esc(description)}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="GlobeNews" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
    `<meta name="theme-color" content="#010204" />`,
    `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`,
  ].join('\n    ');
}

/**
 * Everything a crawler or link unfurler sees. The app is client-rendered from
 * data/events.json, so without this the page is an empty div: no headlines
 * indexed, no share card, no per-story link. All generated at build time from
 * the same dataset the globe renders.
 */
export function seoPlugin() {
  return {
    name: 'globenews-seo',
    transformIndexHtml(html) {
      const data = loadDataset();
      const description = describe(data.events);
      const image = `${SITE}og.jpg`;
      const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'GlobeNews — verified world events',
        description,
        numberOfItems: data.events.length,
        itemListElement: data.events.slice(0, 30).map((e, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: `${SITE}s/${e.id}/`,
          name: e.headline,
        })),
      };

      // real text for crawlers that don't execute JS, and for anyone with it off
      const noscript = `<noscript><div class="noscript-feed"><h1>GlobeNews</h1><p>${esc(
        description,
      )}</p><ul>${data.events
        .slice(0, 40)
        .map(
          (e) =>
            `<li><a href="s/${esc(e.id)}/">${esc(e.headline)}</a> — ${esc(
              e.locationName,
            )} · trust ${e.trustScore}/100</li>`,
        )
        .join('')}</ul></div></noscript>`;

      const tags = head({
        title: 'GlobeNews — the world’s news, one globe',
        description,
        url: SITE,
        image,
        jsonLd,
      });

      // strip the static description (it may be wrapped across lines) and put
      // the generated head block in just before </head>
      const withoutStaticDescription = html.replace(
        /<meta\s+name="description"[\s\S]*?\/>/,
        '',
      );
      if (withoutStaticDescription === html) {
        console.warn('[seo] static <meta name="description"> not found — check index.html');
      }
      return withoutStaticDescription
        .replace('</head>', `  ${tags}\n  </head>`)
        .replace('<div id="root"></div>', `<div id="root"></div>\n    ${noscript}`);
    },

    /**
     * One tiny static page per story: gives every story a real URL with its own
     * share card and indexable text, then hands the visitor to the globe with
     * that story already selected.
     */
    closeBundle() {
      const data = loadDataset();
      const outDir = resolve(here, 'dist');
      if (!existsSync(outDir)) return;

      for (const event of data.events) {
        const url = `${SITE}s/${event.id}/`;
        const image = event.image?.url ?? `${SITE}og.jpg`;
        const jsonLd = {
          '@context': 'https://schema.org',
          '@type': 'NewsArticle',
          headline: event.headline,
          description: event.summary,
          datePublished: event.firstSeen,
          dateModified: event.lastUpdated,
          url,
          contentLocation: { '@type': 'Place', name: event.locationName },
          citation: event.sources.map((s) => s.url),
        };
        const page = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(event.headline)} — GlobeNews</title>
    ${head({ title: event.headline, description: event.summary, url, image, jsonLd })}
    <script>location.replace(${JSON.stringify(`${SITE}?event=${event.id}`)});</script>
  </head>
  <body>
    <article>
      <h1>${esc(event.headline)}</h1>
      <p>${esc(event.summary)}</p>
      <p>${esc(event.locationName)} — trust ${event.trustScore}/100 from ${
        event.sources.length
      } independent sources.</p>
      <ul>${event.sources
        .map((s) => `<li><a href="${esc(s.url)}" rel="nofollow noopener">${esc(s.domain)}</a></li>`)
        .join('')}</ul>
      <p><a href="${esc(SITE)}?event=${esc(event.id)}">View on the globe</a></p>
    </article>
  </body>
</html>
`;
        const dir = resolve(outDir, 's', event.id);
        mkdirSync(dir, { recursive: true });
        writeFileSync(resolve(dir, 'index.html'), page);
      }

      const urls = [SITE, ...data.events.map((e) => `${SITE}s/${e.id}/`)];
      writeFileSync(
        resolve(outDir, 'sitemap.xml'),
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
          .map(
            (u) =>
              `  <url><loc>${esc(u)}</loc><lastmod>${esc(
                data.generatedAt.slice(0, 10),
              )}</lastmod></url>`,
          )
          .join('\n')}\n</urlset>\n`,
      );
      writeFileSync(
        resolve(outDir, 'robots.txt'),
        `User-agent: *\nAllow: /\nSitemap: ${SITE}sitemap.xml\n`,
      );
      console.log(`[seo] ${data.events.length} story pages, sitemap and robots.txt written`);
    },
  };
}
