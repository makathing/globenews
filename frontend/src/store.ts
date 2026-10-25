import { useMemo } from 'react';
import { create } from 'zustand';
import type { Category, NewsDataset, NewsEvent } from '../../shared/news';
import { applyTheme, loadStoredTheme, storeTheme, THEMES, type SiteTheme, type ThemeId } from './themes';

interface HoverState {
  id: string;
  x: number;
  y: number;
}

interface GlobeStore {
  dataset: NewsDataset | null;
  theme: ThemeId;
  hidden: Set<Category>;
  hovered: HoverState | null;
  selectedId: string | null;
  /** Set when a selection came from the globe, so the rail can scroll to it. */
  scrollToId: string | null;
  setDataset: (dataset: NewsDataset) => void;
  setTheme: (theme: ThemeId) => void;
  toggleCategory: (category: Category) => void;
  setHovered: (hover: HoverState | null) => void;
  hoverId: (id: string | null) => void;
  select: (id: string | null, opts?: { fromGlobe?: boolean }) => void;
  clearScrollTo: () => void;
}

export const useGlobeStore = create<GlobeStore>((set) => ({
  dataset: null,
  theme: loadStoredTheme(),
  hidden: new Set<Category>(),
  hovered: null,
  selectedId: null,
  scrollToId: null,
  setDataset: (dataset) => set({ dataset }),
  setTheme: (theme) => {
    storeTheme(theme);
    applyTheme(THEMES[theme]);
    set({ theme });
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

export function useTheme(): SiteTheme {
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

/**
 * A phone-shaped viewport. Same breakpoint the rail uses to become a drawer,
 * so the layout and the camera's opening framing agree about what "small
 * screen" means. Read once, like the flags above; the camera is only seeded
 * from it and the viewer can zoom wherever they like afterwards.
 */
export const narrowViewport =
  typeof window !== 'undefined' && window.matchMedia?.('(max-width: 900px)').matches === true;
