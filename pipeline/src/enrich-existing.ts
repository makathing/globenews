import { enrichImages } from './enrich-images.ts';
import { computeStats } from './finalize.ts';
import {
  readCurrentDataset,
  readOutletIcons,
  writeDataset,
  writeOutletIcons,
} from './io.ts';
import { validateDataset } from './schema.ts';

/**
 * Image enrichment as a standalone pass over the committed dataset.
 *
 * This exists because resolving previews needs internet, not intelligence:
 * it is `fetch` plus a regex, with no model call and no API key anywhere in
 * the path. The agent pipeline runs on the owner's Claude subscription in an
 * environment that cannot reach news publishers, so the fetching half is
 * split out to run where egress exists (GitHub Actions) while the thinking
 * half stays tokenless.
 *
 * Exits 0 whether or not anything resolved — nothing here is worth failing a
 * workflow over. The counts it prints are the actual signal.
 */

async function main(): Promise<void> {
  const dataset = readCurrentDataset();
  if (!dataset) {
    console.error('[enrich] no readable data/events.json — nothing to enrich');
    return;
  }

  const before = JSON.stringify(dataset);
  const icons = readOutletIcons();
  const iconsBefore = Object.keys(icons).length;

  const { resolved } = await enrichImages(dataset, icons);

  dataset.stats = { ...computeStats(dataset), enrichedAt: new Date().toISOString() };

  const changed = JSON.stringify(dataset) !== before;
  if (changed) {
    // revalidate: enrichment writes into the dataset, and a malformed URL
    // slipping through would break the site rather than just lose an image
    validateDataset(dataset);
    writeDataset(dataset);
  }
  writeOutletIcons(icons);

  const newIcons = Object.keys(icons).length - iconsBefore;
  console.log(
    `[enrich] ${resolved} new hero image(s); ` +
      `${dataset.stats.imagesResolved}/${dataset.events.length} events and ` +
      `${dataset.stats.sourcesWithImages} sources now have art; ` +
      `${newIcons} new outlet icon(s), ${Object.keys(icons).length} known`,
  );
  if (dataset.stats.imagesResolved === 0) {
    console.warn(
      '[enrich] resolved nothing at all — if this repeats, egress to publishers is blocked',
    );
  }
  console.log(`[enrich] dataset ${changed ? 'updated' : 'unchanged'}`);
}

main().catch((error) => {
  console.error('[enrich] failed:', error);
  process.exit(1);
});
