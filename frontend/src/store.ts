import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import type { Category, NewsDataset, NewsEvent } from '../../shared/news';
import { loadStoredTheme, storeTheme, THEMES, type GlobeTheme, type ThemeId } from './themes';
import {
  loadStoredMarkerStyle,
  markerStyleFromUrl,
  storeMarkerStyle,
  type MarkerStyle,
} from './lib/markerStyle';
import { buildCountryTint } from './lib/countryTint';
import * as THREE from 'three';

interface HoverState {
  id: string;
  x: number;
  y: number;
}

interface GlobeStore {
  dataset: NewsDataset | null;
  theme: ThemeId;
  /** Which shape marks a story on the globe. */
  markerStyle: MarkerStyle;
  hidden: Set<Category>;
  hovered: HoverState | null;
  selectedId: string | null;
  /** Set when a selection came from the globe, so the rail can scroll to it. */
  scrollToId: string | null;
  setDataset: (dataset: NewsDataset) => void;
  setTheme: (theme: ThemeId) => void;
  setMarkerStyle: (style: MarkerStyle) => void;
  toggleCategory: (category: Category) => void;
  setHovered: (hover: HoverState | null) => void;
  hoverId: (id: string | null) => void;
  select: (id: string | null, opts?: { fromGlobe?: boolean }) => void;
  clearScrollTo: () => void;
}

export const useGlobeStore = create<GlobeStore>((set) => ({
  dataset: null,
  theme: loadStoredTheme(),
  markerStyle: markerStyleFromUrl() ?? loadStoredMarkerStyle(),
  hidden: new Set<Category>(),
  hovered: null,
  selectedId: null,
  scrollToId: null,
  setDataset: (dataset) => set({ dataset }),
  setTheme: (theme) => {
    storeTheme(theme);
    set({ theme });
  },
  setMarkerStyle: (markerStyle) => {
    storeMarkerStyle(markerStyle);
    set({ markerStyle });
  },
  toggleCategory: (category) =>
    set((state) => {
      const hidden = new Set(state.hidden);
      if (hidden.has(category)) hidden.delete(category);
      else hidden.add(category);
      return { hidden };
    }),
  setHovered: (hovered) => set({ hovered }),
  /** Hover from the rail: no cursor coordinates, so no floating tooltip. */
  hoverId: (id) => set({ hovered: id ? { id, x: -1, y: -1 } : null }),
  select: (selectedId, opts) =>
    set({ selectedId, scrollToId: opts?.fromGlobe ? selectedId : null }),
  clearScrollTo: () => set({ scrollToId: null }),
}));

export function useTheme(): GlobeTheme {
  return THEMES[useGlobeStore((s) => s.theme)];
}

/** Events passing the category filters. */
export function useVisibleEvents(): NewsEvent[] {
  const dataset = useGlobeStore((s) => s.dataset);
  const hidden = useGlobeStore((s) => s.hidden);
  return useMemo(() => {
    if (!dataset) return [];
    return dataset.events.filter((event) => !hidden.has(event.category));
  }, [dataset, hidden]);
}

/**
 * Country tint texture, rebuilt only when the dataset changes. The GeoJSON is
 * fetched once and shared with nothing else — the borders layer keeps its own
 * copy since it needs the raw rings.
 */
export function useCountryTint(): THREE.CanvasTexture | null {
  const dataset = useGlobeStore((s) => s.dataset);
  const [geojson, setGeojson] = useState<{ features: never[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}geo/countries-110m.geojson`)
      .then((res) => res.json())
      .then((data) => !cancelled && setGeojson(data))
      .catch((error) => console.error('country tint geojson failed', error));
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => {
    if (!dataset || !geojson) return null;
    const { texture, tinted, unresolved } = buildCountryTint(dataset.events, geojson);
    console.debug(`[tint] ${tinted.length} countries tinted, ${unresolved} events unplaced`);
    return texture;
  }, [dataset, geojson]);
}

/**
 * Mutable, out-of-React camera-motion state shared between the controls rig,
 * the starfield streak shader and the motion-smear pass. Updated every frame —
 * deliberately not reactive state.
 */
export const cameraMotion = {
  vx: 0,
  vy: 0,
  speed: 0,
};

export const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/**
 * A finger, not a pointer. This is the *primary* input, so a touchscreen
 * laptop driven by its trackpad still takes the desktop path. Effects that
 * cost a full-screen pass on a phone GPU check this.
 */
export const coarsePointer =
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;
