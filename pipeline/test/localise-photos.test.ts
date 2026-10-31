import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LibraryPhoto, PhotoLibrary } from '../../shared/photoLibrary.ts';
import { localFileName, localPath, localiseLibrary, sharpConverter } from '../src/localise-photos.ts';
import { mergeLibrary, parseLibraryFile } from '../src/photo-library.ts';

const photo = (id: string, extra: Partial<LibraryPhoto> = {}): LibraryPhoto => ({
  id,
  thumb: `https://upload.wikimedia.org/thumb/${encodeURIComponent(id)}/960px-x.jpg`,
  page: `https://commons.wikimedia.org/wiki/${encodeURIComponent(id)}`,
  title: id,
  author: 'A. Photographer',
  license: 'CC BY 4.0',
  width: 960,
  height: 640,
  ...extra,
});

const library = (topics: Record<string, LibraryPhoto[]>): PhotoLibrary => ({
  version: 1,
  builtAt: '2026-10-01T00:00:00Z',
  topics,
  blocked: [],
});

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'library-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const bytesOf = (url: string) => new TextEncoder().encode(`img:${url}`);

describe('localFileName', () => {
  it('is a stable 16-hex WebP name per id', () => {
    const name = localFileName('File:Flooded street.jpg');
    expect(name).toMatch(/^[a-f0-9]{16}\.webp$/);
    expect(localFileName('File:Flooded street.jpg')).toBe(name);
    expect(localFileName('File:Other.jpg')).not.toBe(name);
    expect(localPath('File:Flooded street.jpg')).toBe(`library/${name}`);
  });
});

describe('localiseLibrary', () => {
  it('downloads, converts and records `local` for every photo', async () => {
    const fetched: string[] = [];
    const result = await localiseLibrary(library({ flood: [photo('File:A.jpg'), photo('File:B.jpg')] }), {
      dir,
      fetchImage: async (url) => {
        fetched.push(url);
        return bytesOf(url);
      },
      convert: async (input) => new Uint8Array([...new TextEncoder().encode('webp:'), ...input]),
    });
    expect(result.downloaded).toBe(2);
    expect(fetched).toHaveLength(2);
    const [a, b] = result.library.topics.flood;
    expect(a.local).toBe(localPath('File:A.jpg'));
    expect(b.local).toBe(localPath('File:B.jpg'));
    expect(readFileSync(join(dir, localFileName('File:A.jpg')), 'utf8')).toMatch(/^webp:img:/);
  });

  it('reuses files already on disk without fetching', async () => {
    writeFileSync(join(dir, localFileName('File:A.jpg')), 'existing');
    let calls = 0;
    const result = await localiseLibrary(library({ flood: [photo('File:A.jpg')] }), {
      dir,
      fetchImage: async (url) => {
        calls += 1;
        return bytesOf(url);
      },
      convert: async (input) => input,
    });
    expect(calls).toBe(0);
    expect(result.reused).toBe(1);
    expect(result.library.topics.flood[0].local).toBe(localPath('File:A.jpg'));
    expect(readFileSync(join(dir, localFileName('File:A.jpg')), 'utf8')).toBe('existing');
  });

  it('leaves a failed photo on its hotlink, dropping a stale `local`', async () => {
    const stale = photo('File:Gone.jpg', { local: localPath('File:Gone.jpg') });
    const result = await localiseLibrary(library({ flood: [stale, photo('File:Ok.jpg')] }), {
      dir,
      fetchImage: async (url) => {
        if (url.includes('Gone')) throw new Error('HTTP 404');
        return bytesOf(url);
      },
      convert: async (input) => input,
    });
    expect(result.failed).toEqual(['File:Gone.jpg']);
    expect(result.library.topics.flood[0]).not.toHaveProperty('local');
    expect(result.library.topics.flood[0].thumb).toBe(stale.thumb);
    expect(result.library.topics.flood[1].local).toBe(localPath('File:Ok.jpg'));
  });

  it('treats an empty conversion as a failure', async () => {
    const result = await localiseLibrary(library({ flood: [photo('File:A.jpg')] }), {
      dir,
      fetchImage: async (url) => bytesOf(url),
      convert: async () => new Uint8Array(),
    });
    expect(result.failed).toEqual(['File:A.jpg']);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('deletes orphaned WebPs of photos no longer in the library, and nothing else', async () => {
    writeFileSync(join(dir, localFileName('File:Old.jpg')), 'old');
    writeFileSync(join(dir, 'README.txt'), 'keep me');
    const result = await localiseLibrary(library({ flood: [photo('File:A.jpg')] }), {
      dir,
      fetchImage: async (url) => bytesOf(url),
      convert: async (input) => input,
    });
    expect(result.removed).toEqual([localFileName('File:Old.jpg')]);
    expect(readdirSync(dir).sort()).toEqual([localFileName('File:A.jpg'), 'README.txt'].sort());
  });

  it('pauses between downloads, not before the first', async () => {
    let pauses = 0;
    await localiseLibrary(library({ a: [photo('File:1.jpg'), photo('File:2.jpg')], b: [photo('File:3.jpg')] }), {
      dir,
      fetchImage: async (url) => bytesOf(url),
      convert: async (input) => input,
      pause: async () => {
        pauses += 1;
      },
    });
    expect(pauses).toBe(2);
  });

  it('produces a library that still parses', async () => {
    const result = await localiseLibrary(library({ flood: [photo('File:A.jpg')] }), {
      dir,
      fetchImage: async (url) => bytesOf(url),
      convert: async (input) => input,
    });
    expect(parseLibraryFile(JSON.parse(JSON.stringify(result.library)))).toEqual(result.library);
  });
});

describe('mergeLibrary and self-hosted copies', () => {
  it('carries `local` onto the same photo coming back from a refresh', () => {
    const existing = library({ flood: [photo('File:A.jpg', { local: localPath('File:A.jpg') })] });
    const merged = mergeLibrary(existing, { flood: [photo('File:A.jpg')] }, '2026-11-01T00:00:00Z');
    expect(merged.topics.flood[0].local).toBe(localPath('File:A.jpg'));
    // unchanged photos: builtAt doesn't move, so no PR is opened for nothing
    expect(merged.builtAt).toBe(existing.builtAt);
  });

  it('rejects a malformed `local` path', () => {
    const bad = library({ flood: [photo('File:A.jpg', { local: '../../etc/passwd' })] });
    expect(() => parseLibraryFile(bad)).toThrow(/malformed/);
  });
});

describe('sharpConverter', () => {
  it('turns a JPEG into a WebP no wider than 640px', async () => {
    const { default: sharp } = await import('sharp');
    const jpeg = await sharp({ create: { width: 960, height: 640, channels: 3, background: '#357' } }).jpeg().toBuffer();
    const webp = await (await sharpConverter())(new Uint8Array(jpeg));
    const meta = await sharp(webp).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(640);
    expect(existsSync(dir)).toBe(true);
  });
});
