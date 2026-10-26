import { useMemo } from 'react';
import { create } from 'zustand';
import type { Category, NewsDataset, NewsEvent } from '../../shared/news';
import {
  applyTheme,
  loadStoredSpace,
  loadStoredTheme,
  storeSpace,
  storeTheme,
  THEMES,
  type SiteTheme,
  type ThemeId,
} from './themes';

interface HoverState {
  id: string;
  x: number;
  y: number;
}

interface GlobeStore {
  dataset: NewsDataset | null;
  theme: ThemeId;
  /** The viewer's space-view preference; see useSpaceView for whether it applies. */
  space: boolean;
  hidden: Set<Category>;
  hovered: HoverState | null;
  selectedId: string | null;
  /** Set when a selection came from the globe, so the rail can scroll to it. */
  scrollToId: string | null;
  setDataset: (dataset: NewsDataset) => void;
  setTheme: (theme: ThemeId) => void;
  setSpace: (on: boolean) => void;
  toggleCategory: (category: Category) => void;
  setHovered: (hover: HoverState | null) => void;
  hoverId: (id: string | null) => void;
  select: (id: string | null, opts?: { fromGlobe?: boolean }) => void;
  clearScrollTo: () => void;
}

export const useGlobeStore = create<GlobeStore>((set) => ({
  dataset: null,
  theme: loadStoredTheme(),
  space: loadStoredSpace(),
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
  setSpace: (space) => {
    storeSpace(space);
    set({ space });
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

/**
 * Whether the scene shows the space view. A light theme has no night sky to
 * show, so the preference is kept but ignored while one is active.
 */
export function useSpaceView(): boolean {
  const space = useGlobeStore((s) => s.space);
  const theme = useTheme();
  return space && !theme.light;
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

/**
 * The dot grid the globe is drawing right now (the finer one while two are
 * crossfading), as dots per row. Written by the earth every frame, read by
 * picking so a story's hover reach matches the dots it lights. Not reactive.
 */
export const dotLevel = {
  width: 420,
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
