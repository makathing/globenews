import { createElement } from 'react';
import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { CATEGORIES } from '../../../shared/news';
import { CategoryIcon } from '../ui/icons';

/**
 * The rail's category icons, rasterised once into a strip texture so the
 * pin heads can carry the same glyphs. One cell per category in CATEGORIES
 * order — the same order CATEGORY_PATTERN uses, so a pin indexes the atlas
 * with the number it already has.
 *
 * Built lazily on first use and only when pins mount: it pulls in
 * react-dom/server to turn the icon components into SVG markup, which the
 * beams never need.
 */

export const ATLAS_CELL = 64;
export const ATLAS_CELLS = CATEGORIES.length;

let atlas: { texture: THREE.CanvasTexture; ready: Promise<boolean> } | null = null;

async function rasterise(canvas: HTMLCanvasElement, texture: THREE.CanvasTexture): Promise<boolean> {
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  try {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const inset = 10;
    await Promise.all(
      CATEGORIES.map(async (category, index) => {
        const markup = renderToStaticMarkup(
          createElement(CategoryIcon, {
            category,
            size: ATLAS_CELL - inset * 2,
            // React does not emit xmlns, and without it the data URI is not a
            // standalone SVG document — the decode below would reject it
            xmlns: 'http://www.w3.org/2000/svg',
            style: { color: '#ffffff' },
            strokeWidth: 2.4,
          }),
        );
        const img = new Image();
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
        await img.decode();
        ctx.drawImage(img, index * ATLAS_CELL + inset, inset, ATLAS_CELL - inset * 2, ATLAS_CELL - inset * 2);
      }),
    );
    texture.needsUpdate = true;
    return true;
  } catch (error) {
    console.warn('[pins] glyph atlas unavailable, pins render without icons', error);
    return false;
  }
}

export function glyphAtlas() {
  if (atlas) return atlas;
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_CELL * ATLAS_CELLS;
  canvas.height = ATLAS_CELL;
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  atlas = { texture, ready: rasterise(canvas, texture) };
  return atlas;
}

/** The atlas texture, and whether the glyphs have landed in it yet. */
export function useGlyphAtlas(): { texture: THREE.CanvasTexture; ready: boolean } {
  const [ready, setReady] = useState(false);
  const { texture, ready: pending } = glyphAtlas();
  useEffect(() => {
    let cancelled = false;
    pending.then((ok) => !cancelled && setReady(ok));
    return () => {
      cancelled = true;
    };
  }, [pending]);
  return { texture, ready };
}
