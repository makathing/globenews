import bundled from '../../../data/photo-library.json';
import type { PhotoLibrary } from '../../../shared/photoLibrary';

/**
 * The illustrative photo library, compiled into the bundle like the stories
 * are (lib/dataset.ts): it changes only when a reviewed refresh lands, and
 * one hashed bundle means one cache surface.
 */
export const PHOTO_LIBRARY = bundled as unknown as PhotoLibrary;
