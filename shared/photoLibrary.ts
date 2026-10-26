/**
 * The illustrative photo library: openly licensed photos, grouped by news
 * topic (shared/topics.ts), standing in when a story's own sources carry no
 * usable picture. Built by pipeline/src/build-photo-library.ts from Wikimedia
 * Commons and reviewed by a person before it lands in data/photo-library.json.
 *
 * Every photo shown from here is labelled "Illustrative" and credited — it is
 * a picture *of the topic*, never of the event.
 */

export interface LibraryPhoto {
  /** Stable id: the Commons file title, e.g. "File:Flooded street in Jakarta.jpg". */
  id: string;
  /** Hotlinkable Commons thumbnail, ~960px wide. */
  thumb: string;
  /** The file's Commons description page, for the credit link. */
  page: string;
  title: string;
  /** Plain-text author / photographer name (HTML stripped). */
  author: string;
  /** Short licence name, e.g. "CC BY-SA 4.0", "CC0", "Public domain". */
  license: string;
  licenseUrl?: string;
  width: number;
  height: number;
}

export interface PhotoLibrary {
  version: 1;
  /** When the library was last refreshed (ISO), or null for the empty seed. */
  builtAt: string | null;
  /** Topic id (shared/topics.ts) → photos, best first. */
  topics: Record<string, LibraryPhoto[]>;
  /** Photo ids a reviewer rejected; a refresh never brings them back. */
  blocked: string[];
}
