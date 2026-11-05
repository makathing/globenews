import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { REPO_ROOT } from './io.ts';
import { normalizeDomain, rateDomain } from './source-ratings.ts';

/**
 * Which outlets the agents actually cite that the ratings table does not
 * know, ranked by how often. Unrated domains score a flat 50, which drags
 * down every story they carry — mostly regional and non-US outlets — so this
 * is the to-do list for source-ratings.ts.
 *
 *   npm run report-unrated -w pipeline [-- --top 50]
 */

interface Dataset {
  events: { id: string; sources: { url: string; domain: string }[] }[];
}

const DATA_DIR = resolve(REPO_ROOT, 'data');

export function countUnrated(datasets: Dataset[]): Map<string, { stories: number; example: string }> {
  const counts = new Map<string, { stories: Set<string>; example: string }>();
  for (const dataset of datasets) {
    for (const event of dataset.events) {
      for (const source of event.sources) {
        let host: string;
        try {
          host = new URL(source.url).hostname.toLowerCase().replace(/^www\./, '');
        } catch {
          continue;
        }
        if (!rateDomain(host).unrated) continue;
        const domain = normalizeDomain(host);
        const entry = counts.get(domain) ?? { stories: new Set<string>(), example: source.url };
        entry.stories.add(event.id);
        counts.set(domain, entry);
      }
    }
  }
  return new Map([...counts].map(([domain, { stories, example }]) => [domain, { stories: stories.size, example }]));
}

function main(): void {
  const topIndex = process.argv.indexOf('--top');
  const top = topIndex >= 0 ? Number(process.argv[topIndex + 1]) || 40 : 40;
  const files = [
    resolve(DATA_DIR, 'events.json'),
    ...readdirSync(resolve(DATA_DIR, 'archive'))
      .filter((name) => name.endsWith('.json') && name !== 'index.json')
      .map((name) => resolve(DATA_DIR, 'archive', name)),
  ];
  const datasets = files.map((file) => JSON.parse(readFileSync(file, 'utf8')) as Dataset);
  const ranked = [...countUnrated(datasets)].sort((a, b) => b[1].stories - a[1].stories);
  console.log(`${ranked.length} unrated domains across ${files.length} files; top ${top}:`);
  for (const [domain, { stories, example }] of ranked.slice(0, top)) {
    console.log(`${String(stories).padStart(4)}  ${domain.padEnd(32)} ${example}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
