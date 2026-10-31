import { useMemo } from 'react';
import { create } from 'zustand';
import { useEffect, useState } from 'react';
import type { Category, NewsDataset, NewsEvent } from '../../shared/news';
import { fetchArchiveDay, fetchArchiveIndex, type ArchiveDay } from './lib/archive';
import { loadHidden, loadRegion, storeHidden, storeRegion } from './lib/prefs';
import { inRegion, type RegionId } from './lib/regions';
import { readUrlState } from './lib/urlParams';
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

export interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
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
  /**
   * Stories whose dots play the arrival cue, recomputed by every setDataset:
   * ids new since the previous dataset (a live update), plus breaking stories
   * that are new or were just re-reported (on first load: every breaking one).
   */
  arrivals: ReadonlySet<string>;
  /** The region view: camera framing + list filter. */
  region: RegionId;
  /** The archived UTC day on screen, or null for the live map. */
  viewingDate: string | null;
  /** True while an archived day is being fetched. */
  loadingDate: string | null;
  /** The newest live dataset, kept while an archived day is on screen. */
  liveDataset: NewsDataset | null;
  /** When the live poll last got an answer (200 or 304), epoch ms. */
  liveCheckedAt: number | null;
  /** The timeline's days, once fetched (null until then). */
  archiveDays: ArchiveDay[] | null;
  /**
   * Screen px covered by chrome at the top and bottom (the mobile top bar and
   * sheet). The scene centres the globe in what is left.
   */
  layoutInsets: Insets;
  /**
   * Adopt a dataset. Also keeps the UI consistent with it: a selection or
   * hover whose story has expired is cleared (a re-reported story keeps its
   * id, so it stays selected and simply shows the fresh text). `quiet` skips
   * the arrival cue (moving through history is not news arriving).
   */
  setDataset: (dataset: NewsDataset, opts?: { quiet?: boolean }) => void;
  /** A live dataset: always remembered, shown unless a past day is on screen. */
  setLiveDataset: (dataset: NewsDataset) => void;
  /** Show an archived day (null: back to the live map). Resolves false if it couldn't load. */
  viewDay: (date: string | null) => Promise<boolean>;
  loadArchiveIndex: () => Promise<void>;
  markChecked: (at: number) => void;
  setRegion: (region: RegionId) => void;
  setLayoutInsets: (insets: Partial<Insets>) => void;
  setTheme: (theme: ThemeId) => void;
  setSpace: (on: boolean) => void;
  toggleCategory: (category: Category) => void;
  setHovered: (hover: HoverState | null) => void;
  hoverId: (id: string | null) => void;
  select: (id: string | null, opts?: { fromGlobe?: boolean }) => void;
  clearScrollTo: () => void;
}

export const useGlobeStore = create<GlobeStore>((set, get) => ({
  dataset: null,
  theme: loadStoredTheme(),
  space: loadStoredSpace(),
  hidden: loadHidden(),
  hovered: null,
  selectedId: null,
  scrollToId: null,
  arrivals: new Set<string>(),
  region: (typeof window !== 'undefined' && readUrlState(window.location.search).region) || loadRegion(),
  viewingDate: null,
  loadingDate: null,
  liveDataset: null,
  liveCheckedAt: null,
  archiveDays: null,
  layoutInsets: { top: 0, bottom: 0, left: 0, right: 0 },
  setDataset: (dataset, opts) =>
    set((state) => {
      if (state.dataset === dataset) return {};
      const previous = state.dataset ? new Map(state.dataset.events.map((e) => [e.id, e])) : null;
      const ids = new Set(dataset.events.map((e) => e.id));
      const arrivals = new Set<string>();
      if (!opts?.quiet) for (const event of dataset.events) {
        const before = previous?.get(event.id);
        if (previous && !before) arrivals.add(event.id);
        else if (event.isBreaking && (!before || before.lastUpdated !== event.lastUpdated)) arrivals.add(event.id);
      }
      const keep = (id: string | null | undefined) => (id && ids.has(id) ? id : null);
      return {
        dataset,
        arrivals,
        selectedId: keep(state.selectedId),
        scrollToId: keep(state.scrollToId),
        hovered: state.hovered && ids.has(state.hovered.id) ? state.hovered : null,
      };
    }),
  setLiveDataset: (dataset) => {
    set({ liveDataset: dataset });
    if (!get().viewingDate && !get().loadingDate) get().setDataset(dataset);
  },
  viewDay: async (date) => {
    if (date === null) {
      const live = get().liveDataset;
      set({ viewingDate: null, loadingDate: null });
      if (live) get().setDataset(live, { quiet: true });
      return true;
    }
    if (date === get().viewingDate) return true;
    set({ loadingDate: date });
    const day = await fetchArchiveDay(import.meta.env.BASE_URL, date);
    // a later choice (another day, or back to today) wins
    if (get().loadingDate !== date) return false;
    if (!day) {
      set({ loadingDate: null });
      return false;
    }
    set({ viewingDate: date, loadingDate: null });
    get().setDataset(day, { quiet: true });
    return true;
  },
  loadArchiveIndex: async () => {
    if (get().archiveDays) return;
    const days = await fetchArchiveIndex(import.meta.env.BASE_URL);
    set({ archiveDays: days });
  },
  markChecked: (liveCheckedAt) => set({ liveCheckedAt }),
  setRegion: (region) => {
    storeRegion(region);
    set((state) => {
      const selected = state.selectedId ? state.dataset?.events.find((e) => e.id === state.selectedId) : undefined;
      const keep = selected && inRegion(selected, region);
      return { region, selectedId: keep ? state.selectedId : null, scrollToId: null };
    });
  },
  setLayoutInsets: (insets) =>
    set((state) => {
      const next = { ...state.layoutInsets, ...insets };
      const same = (Object.keys(next) as (keyof Insets)[]).every((k) => next[k] === state.layoutInsets[k]);
      return same ? {} : { layoutInsets: next };
    }),
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
      storeHidden(hidden);
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

/** Events passing the category filters and the region view: what the lists show. */
export function useListEvents(): NewsEvent[] {
  const events = useVisibleEvents();
  const region = useGlobeStore((s) => s.region);
  return useMemo(
    () => (region === 'world' ? events : events.filter((event) => inRegion(event, region))),
    [events, region],
  );
}

/**
 * Whether the last input was the keyboard. Focus is moved for keyboard
 * users (into an opened story, back to its card); a tap shouldn't leave a
 * focus ring behind. Not reactive.
 */
export const inputModality = { keyboard: false };
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', () => (inputModality.keyboard = true), true);
  window.addEventListener('pointerdown', () => (inputModality.keyboard = false), true);
}

/** Below this width the app is the mobile shell (top bar + bottom sheet). */
export const MOBILE_QUERY = '(max-width: 900px)';

/** Reactive: whether the mobile layout is in use. */
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.(MOBILE_QUERY).matches === true,
  );
  useEffect(() => {
    const query = window.matchMedia?.(MOBILE_QUERY);
    if (!query) return;
    const onChange = () => setMobile(query.matches);
    onChange();
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return mobile;
}

/** Reactive reduced-motion preference (the constant below is the first-paint value). */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return;
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
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
  typeof window !== 'undefined' && window.matchMedia?.(MOBILE_QUERY).matches === true;
