import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LibraryPhoto, PhotoLibrary } from '../../shared/photoLibrary.ts';
import {
  type Candidate,
  REVIEW_INSTRUCTION,
  acceptPhoto,
  commonsSearchUrl,
  emptyLibrary,
  isAcceptedLicense,
  mergeLibrary,
  parseCommonsResponse,
  parseLibraryFile,
  prBody,
  rejectionReason,
  renderGallery,
  selectTopicPhotos,
  stripHtml,
} from '../src/photo-library.ts';

// A hand-written response in the shape of a real
// generator=search&prop=imageinfo&formatversion=2 answer: one hit per filter
const fixture: unknown = JSON.parse(
  readFileSync(resolve(import.meta.dirname, 'fixtures', 'commons-search-flood.json'), 'utf8'),
);
const candidates = parseCommonsResponse(fixture);
const byId = (id: string): Candidate => {
  const found = candidates.find((candidate) => candidate.photo.id === id);
  if (!found) throw new Error(`fixture has no ${id}`);
  return found;
};
const none = new Set<string>();

function photo(id: string): LibraryPhoto {
  return {
    id,
    thumb: `https://upload.wikimedia.org/thumb/${id}`,
    page: `https://commons.wikimedia.org/wiki/${id}`,
    title: id,
    author: 'Someone',
    license: 'CC0',
    width: 960,
    height: 640,
  };
}

describe('commonsSearchUrl', () => {
  it('asks for bitmaps with licence metadata, a 960px thumbnail and maxlag', () => {
    const url = new URL(commonsSearchUrl('flooded street'));
    expect(url.origin + url.pathname).toBe('https://commons.wikimedia.org/w/api.php');
    expect(url.searchParams.get('gsrsearch')).toBe('flooded street filetype:bitmap');
    expect(url.searchParams.get('gsrnamespace')).toBe('6');
    expect(url.searchParams.get('iiprop')).toBe('url|size|extmetadata|mime');
    expect(url.searchParams.get('iiurlwidth')).toBe('960');
    expect(url.searchParams.get('formatversion')).toBe('2');
    expect(url.searchParams.get('maxlag')).toBe('5');
  });
});

describe('parseCommonsResponse', () => {
  it('reads every hit with its thumbnail, page, size and licence', () => {
    expect(candidates).toHaveLength(14);
    const jakarta = byId('File:Flooded street in Jakarta.jpg');
    expect(jakarta.photo).toMatchObject({
      thumb: expect.stringMatching(/^https:\/\/upload\.wikimedia\.org\/.+960px-/),
      page: 'https://commons.wikimedia.org/wiki/File:Flooded_street_in_Jakarta.jpg',
      title: 'Flooded street in Jakarta',
      license: 'CC0',
      licenseUrl: 'http://creativecommons.org/publicdomain/zero/1.0/deed.en',
      width: 960,
      height: 640,
    });
    expect(jakarta.originalWidth).toBe(3000);
    expect(jakarta.index).toBe(1);
  });

  it('strips HTML from the author and decodes entities', () => {
    expect(byId('File:Flooded street in Jakarta.jpg').photo.author).toBe('Ex&ample Photographer');
    expect(byId('File:Flooded town, aerial view.jpg').photo.author).toBe('Max Mustermann');
  });

  it('falls back to a generic credit when Artist is missing', () => {
    expect(byId('File:Flood water around houses.png').photo.author).toBe('Wikimedia Commons contributor');
  });

  it('omits licenseUrl when Commons gives none', () => {
    expect(byId('File:Flood water around houses.png').photo).not.toHaveProperty('licenseUrl');
  });

  it('reads Assessments as a ranking signal', () => {
    expect(byId('File:Flooded town, aerial view.jpg').assessed).toBe(true);
    expect(byId('File:Flooded street in Jakarta.jpg').assessed).toBe(false);
  });

  it('throws on an API error so a refusal is not mistaken for "no results"', () => {
    expect(() =>
      parseCommonsResponse({ error: { code: 'maxlag', info: 'Waiting for a database server' } }),
    ).toThrow(/maxlag/);
  });

  it('treats a response without pages as no results', () => {
    expect(parseCommonsResponse({ batchcomplete: true })).toEqual([]);
  });
});

describe('stripHtml', () => {
  it('drops tags, decodes entities and collapses whitespace', () => {
    expect(stripHtml('<a href="x">A&nbsp;B</a>\n &#169; <b>C&#x27;s</b>')).toBe("A B © C's");
  });
});

describe('licence filter', () => {
  it.each(['CC0', 'CC0 1.0', 'Public domain', 'PD-USGov', 'PD-self', 'CC BY 2.0', 'CC BY-SA 4.0', 'CC BY-SA 3.0 de', 'CC BY-SA 2.5,2.0,1.0'])(
    'accepts %s',
    (licence) => expect(isAcceptedLicense(licence)).toBe(true),
  );

  it.each(['GFDL', 'CC BY-NC-SA 2.0', 'CC BY-ND 4.0', 'Fair use', 'Copyrighted', 'Attribution', ''])(
    'rejects %s',
    (licence) => expect(isAcceptedLicense(licence)).toBe(false),
  );

  it('rejects GFDL-only and non-commercial files from the fixture', () => {
    expect(rejectionReason(byId('File:Flood in Bavaria (GFDL).jpg'), none)).toMatch(/licence "GFDL"/);
    expect(rejectionReason(byId('File:River flood noncommercial.jpg'), none)).toMatch(/licence/);
    expect(acceptPhoto(byId('File:Flood news still.jpg'), none)).toBe(false);
  });
});

describe('title and description filter', () => {
  it('rejects maps, logos and the like', () => {
    expect(rejectionReason(byId('File:Flood map of the Elbe 2002.png'), none)).toMatch(/"map"/);
    // the word is in the description, not the title
    expect(rejectionReason(byId('File:Relief agency at the flood.jpg'), none)).toMatch(/"logo"/);
  });

  it('matches whole words: a "photograph" is not a "graph"', () => {
    expect(acceptPhoto(byId('File:Photograph of a flooded road.jpg'), none)).toBe(true);
  });
});

describe('orientation, size and type', () => {
  it('rejects portrait and near-square originals', () => {
    expect(rejectionReason(byId('File:Flooded alley (vertical).jpg'), none)).toBe('not landscape');
    expect(rejectionReason(byId('File:Square flood.jpg'), none)).toBe('not landscape');
  });

  it('rejects originals narrower than 1200px', () => {
    expect(rejectionReason(byId('File:Small flood photo.jpg'), none)).toBe('too small');
  });

  it('rejects types a browser may not render', () => {
    expect(rejectionReason(byId('File:Flood scan.tif'), none)).toMatch(/image\/tiff/);
  });

  it('accepts png as well as jpeg', () => {
    expect(acceptPhoto(byId('File:Flood water around houses.png'), none)).toBe(true);
  });
});

describe('thumbnail host', () => {
  const base = byId('File:Flooded street in Jakarta.jpg');
  const withThumb = (thumb: string): Candidate => ({ ...base, photo: { ...base.photo, thumb } });

  it('accepts any https Wikimedia host', () => {
    expect(rejectionReason(withThumb('https://upload.wikimedia.org/a.jpg'), none)).toBeNull();
    expect(rejectionReason(withThumb('https://commons.wikimedia.org/w/thumb.php?f=a.jpg'), none)).toBeNull();
  });

  it('rejects other hosts and plain http', () => {
    expect(rejectionReason(withThumb('https://example.com/a.jpg'), none)).toMatch(/Wikimedia/);
    expect(rejectionReason(withThumb('http://upload.wikimedia.org/a.jpg'), none)).toMatch(/Wikimedia/);
    expect(rejectionReason(withThumb('https://wikimedia.org.evil.example/a.jpg'), none)).toMatch(/Wikimedia/);
  });

  it('pins protocol-relative URLs from the API to https', () => {
    const relative = JSON.parse(JSON.stringify(fixture).replaceAll('"https://upload.wikimedia.org', '"//upload.wikimedia.org'));
    const parsed = parseCommonsResponse(relative);
    expect(parsed.length).toBeGreaterThan(0);
    for (const candidate of parsed) expect(candidate.photo.thumb.startsWith('https://upload.wikimedia.org/')).toBe(true);
  });
});

describe('selectTopicPhotos', () => {
  it('keeps the best four, assessed first, then by search rank, skipping blocked ids', () => {
    const blocked = new Set(['File:Rejected by reviewer flood.jpg']);
    const picked = selectTopicPhotos([candidates], blocked, new Set());
    expect(picked.map((p) => p.id)).toEqual([
      'File:Flooded town, aerial view.jpg', // quality image, rank 5
      'File:Flooded street in Jakarta.jpg',
      'File:Flood water around houses.png',
      'File:Photograph of a flooded road.jpg',
    ]);
  });

  it('would have taken the blocked photo had nobody blocked it', () => {
    const picked = selectTopicPhotos([candidates], none, new Set());
    expect(picked.map((p) => p.id)).toContain('File:Rejected by reviewer flood.jpg');
  });

  it('never repeats a photo across topics', () => {
    const used = new Set<string>();
    const first = selectTopicPhotos([candidates], none, used);
    const second = selectTopicPhotos([candidates], none, used);
    expect(first).toHaveLength(4);
    expect(first.map((p) => p.id)).toContain('File:Rejected by reviewer flood.jpg');
    expect(second.map((p) => p.id)).toEqual(['File:Photograph of a flooded road.jpg']);
  });

  it('interleaves queries so one query cannot fill every slot', () => {
    const jakarta = byId('File:Flooded street in Jakarta.jpg');
    const other = { ...jakarta, photo: { ...jakarta.photo, id: 'File:Other query top hit.jpg' } };
    const picked = selectTopicPhotos([candidates.filter((c) => !c.assessed), [other]], none, new Set(), 2);
    expect(picked.map((p) => p.id)).toEqual(['File:Flooded street in Jakarta.jpg', 'File:Other query top hit.jpg']);
  });
});

describe('mergeLibrary', () => {
  const existing: PhotoLibrary = {
    version: 1,
    builtAt: '2026-01-01T00:00:00.000Z',
    topics: {
      flood: [photo('File:Old flood.jpg')],
      earthquake: [photo('File:Old quake.jpg'), photo('File:Bad quake.jpg')],
    },
    blocked: ['File:Bad quake.jpg'],
  };
  const now = '2026-10-26T12:00:00.000Z';

  it('replaces a topic whose searches succeeded', () => {
    const merged = mergeLibrary(existing, { flood: [photo('File:New flood.jpg')] }, now);
    expect(merged.topics.flood.map((p) => p.id)).toEqual(['File:New flood.jpg']);
    expect(merged.builtAt).toBe(now);
  });

  it('keeps a topic whose searches failed — a network error never wipes the library', () => {
    const merged = mergeLibrary(existing, { flood: null, earthquake: null }, now);
    expect(merged.topics.flood.map((p) => p.id)).toEqual(['File:Old flood.jpg']);
    // …minus anything a reviewer has since blocked
    expect(merged.topics.earthquake.map((p) => p.id)).toEqual(['File:Old quake.jpg']);
  });

  it('keeps a topic whose searches found nothing acceptable', () => {
    expect(mergeLibrary(existing, { flood: [] }, now).topics.flood).toHaveLength(1);
  });

  it('preserves the blocked list and drops blocked photos from fresh results too', () => {
    const merged = mergeLibrary(existing, { earthquake: [photo('File:Bad quake.jpg'), photo('File:New quake.jpg')] }, now);
    expect(merged.blocked).toEqual(['File:Bad quake.jpg']);
    expect(merged.topics.earthquake.map((p) => p.id)).toEqual(['File:New quake.jpg']);
  });

  it('keeps builtAt when nothing changed, so an idle refresh opens no PR', () => {
    const clean: PhotoLibrary = { ...existing, blocked: [] };
    const merged = mergeLibrary(clean, { flood: [photo('File:Old flood.jpg')] }, now);
    expect(merged.builtAt).toBe(existing.builtAt);
    expect(merged.topics).toEqual(clean.topics);
  });

  it('builds from the empty seed', () => {
    const merged = mergeLibrary(emptyLibrary(), { flood: [photo('File:New flood.jpg')], storm: null }, now);
    expect(merged).toEqual({
      version: 1,
      builtAt: now,
      topics: { flood: [photo('File:New flood.jpg')] },
      blocked: [],
    });
  });
});

describe('parseLibraryFile', () => {
  it('reads the committed seed', () => {
    const seed = JSON.parse(readFileSync(resolve(import.meta.dirname, '..', '..', 'data', 'photo-library.json'), 'utf8'));
    expect(parseLibraryFile(seed)).toEqual(emptyLibrary());
  });

  it('refuses a corrupt file rather than losing the blocked list', () => {
    expect(() => parseLibraryFile({ version: 1, topics: {}, blocked: 'x' })).toThrow(/blocked/);
    expect(() => parseLibraryFile({ version: 1, topics: { flood: [{ id: 1 }] }, blocked: [] })).toThrow(/flood/);
    expect(() => parseLibraryFile(null)).toThrow();
  });
});

describe('renderGallery', () => {
  const library: PhotoLibrary = {
    version: 1,
    builtAt: '2026-10-26T12:00:00.000Z',
    topics: {
      flood: [
        { ...photo('File:Flood | pipe.jpg'), title: 'Flood | <b>pipe</b>', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/' },
      ],
    },
    blocked: [],
  };
  const gallery = renderGallery(library);

  it('includes the review instruction', () => {
    expect(gallery).toContain(REVIEW_INSTRUCTION);
  });

  it('shows each photo as a small thumbnail with title, author, licence, page and id', () => {
    expect(gallery).toContain('## Flood — `flood`');
    expect(gallery).toContain('<img src="https://upload.wikimedia.org/thumb/File:Flood | pipe.jpg" width="200"');
    expect(gallery).toContain('(https://commons.wikimedia.org/wiki/File:Flood | pipe.jpg)');
    expect(gallery).toContain('[CC0](https://creativecommons.org/publicdomain/zero/1.0/)');
    expect(gallery).toContain('`File:Flood | pipe.jpg`');
  });

  it('escapes untrusted titles so they cannot break the table or inject HTML', () => {
    expect(gallery).toContain('Flood \\| &lt;b&gt;pipe&lt;/b&gt;');
  });

  it('lists every known topic, saying so when one has no photos', () => {
    expect(gallery).toContain('## Earthquake — `earthquake`');
    expect(gallery).toMatch(/`earthquake`\n\n_No photos/);
  });
});

describe('prBody', () => {
  it('passes a short gallery through untouched', () => {
    expect(prBody('# short')).toBe('# short');
  });

  it("cuts a long gallery at a line boundary under GitHub's limit and points at the full file", () => {
    const gallery = Array.from({ length: 5000 }, (_, i) => `| row ${i} | ${'x'.repeat(20)} |`).join('\n');
    const body = prBody(gallery);
    expect(body.length).toBeLessThanOrEqual(60_000);
    expect(body).toContain('data/photo-library.md');
    expect(body.split('\n\n_The gallery is truncated')[0].endsWith('|')).toBe(true);
  });
});
