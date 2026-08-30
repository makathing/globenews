// Copies the latest pipeline dataset into the static assets served by Vite.
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '..', '..', 'data', 'events.json');
const destDir = resolve(here, '..', 'public', 'data');

if (!existsSync(src)) {
  console.error('data/events.json missing — run `npm run pipeline:daily -- --mock` first.');
  process.exit(1);
}
mkdirSync(destDir, { recursive: true });
copyFileSync(src, resolve(destDir, 'events.json'));
console.log('Copied data/events.json → frontend/public/data/events.json');
