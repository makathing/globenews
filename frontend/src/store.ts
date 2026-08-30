import { create } from 'zustand';
import type { Category, NewsDataset, NewsEvent } from '../../shared/news';
import { loadStoredTheme, storeTheme, THEMES, type GlobeTheme, type ThemeId } from './themes';

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
  setDataset: (dataset: NewsDataset) => void;
  setTheme: (theme: ThemeId) => void;
  toggleCategory: (category: Category) => void;
  setHovered: (hover: HoverState | null) => void;
  select: (id: string | null) => void;
}

export const useGlobeStore = create<GlobeStore>((set) => ({
  dataset: null,
  theme: loadStoredTheme(),
  hidden: new Set<Category>(),
  hovered: null,
  selectedId: null,
  setDataset: (dataset) => set({ dataset }),
  setTheme: (theme) => {
    storeTheme(theme);
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
  select: (selectedId) => set({ selectedId }),
}));

export function useTheme(): GlobeTheme {
  return THEMES[useGlobeStore((s) => s.theme)];
}

export function useVisibleEvents(): NewsEvent[] {
  const dataset = useGlobeStore((s) => s.dataset);
  const hidden = useGlobeStore((s) => s.hidden);
  if (!dataset) return [];
  return dataset.events.filter((event) => !hidden.has(event.category));
}

/**
 * Mutable, out-of-React camera-motion state shared between the controls rig,
 * the starfield streak shader and the motion-smear pass. Updated every frame —
 * deliberately not reactive state.
 */
export const cameraMotion = {
  /** screen-space angular velocity, smoothed */
  vx: 0,
  vy: 0,
  speed: 0,
};

export const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
