import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import { REGIONS } from '../lib/regions';
import { clampDrag, nextSnap, resolveSnap, snapHeights, stepSnap, type Snap, type SnapHeights } from '../lib/sheet';
import { inputModality, useGlobeStore, useReducedMotion } from '../store';
import { CategoryChips } from './CategoryChips';
import { DayPicker } from './DayPicker';
import { ChevronLeftIcon, GearIcon } from './icons';
import { RegionChips } from './RegionChips';
import { StoryBody, StoryHeader } from './StoryDetail';
import { StoryList } from './StoryList';
import { ThemeControls } from './ThemeControls';
import { useStatusLine } from './Updated';
import { useListStories, useStoryArtChain } from './useStoryArt';
import { ViewingBanner } from './ViewingBanner';

/**
 * The phone layout (≤900px): a top bar (name, live counts, settings) over a
 * category strip that doubles as the colour key, the globe framed in the
 * band between, and a bottom sheet holding the story list — and, when a
 * story is open, that story, with a way back to where the list was.
 */
export function MobileShell() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [topBottom, setTopBottom] = useState(0);
  const topRef = useRef<HTMLElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const gearRef = useRef<HTMLButtonElement>(null);

  // the top bar's height decides the sheet's full snap and the globe's band
  useLayoutEffect(() => {
    const el = topRef.current;
    if (!el) return;
    const measure = () => setTopBottom(Math.round(el.getBoundingClientRect().bottom));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // everything behind the open settings sheet is out of reach
  useEffect(() => {
    for (const el of [topRef.current, sheetRef.current]) if (el) el.inert = settingsOpen;
  }, [settingsOpen]);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    requestAnimationFrame(() => gearRef.current?.focus());
  }, []);

  return (
    <>
      <TopBar
        ref={topRef}
        gearRef={gearRef}
        settingsOpen={settingsOpen}
        onSettings={() => setSettingsOpen(true)}
      />
      <BottomSheet ref={sheetRef} topBottom={topBottom} />
      {settingsOpen && <SettingsSheet onClose={closeSettings} />}
    </>
  );
}

const TopBar = forwardRef<
  HTMLElement,
  { gearRef: RefObject<HTMLButtonElement>; settingsOpen: boolean; onSettings: () => void }
>(function TopBar({ gearRef, settingsOpen, onSettings }, ref) {
  const { sorted } = useListStories();
  const viewing = useGlobeStore((s) => s.viewingDate !== null);
  const breaking = viewing ? 0 : sorted.filter((e) => e.isBreaking).length;
  return (
    <header ref={ref} className="m-topbar">
      <div className="m-topbar-row">
        <h1 className="m-brand">GlobeNews</h1>
        <span className="m-counts" aria-live="polite">
          {sorted.length} {sorted.length === 1 ? 'story' : 'stories'}
          {breaking > 0 && <span className="m-counts-breaking"> · {breaking} breaking</span>}
        </span>
        <button
          ref={gearRef}
          className="m-gear"
          onClick={onSettings}
          aria-label="Settings: theme, space view and past days"
          aria-haspopup="dialog"
          aria-expanded={settingsOpen}
        >
          <GearIcon size={20} />
        </button>
      </div>
      <CategoryChips variant="strip" />
      <ViewingBanner className="m-viewing" />
    </header>
  );
});

const SNAP_NAMES: Record<Snap, string> = { peek: 'collapsed', half: 'half open', full: 'expanded' };

function useViewport() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
    };
  }, []);
  return size;
}

const BottomSheet = forwardRef<HTMLElement, { topBottom: number }>(function BottomSheet({ topBottom }, ref) {
  const { sorted, chains } = useListStories();
  const dataset = useGlobeStore((s) => s.dataset);
  const selectedId = useGlobeStore((s) => s.selectedId);
  const select = useGlobeStore((s) => s.select);
  const region = useGlobeStore((s) => s.region);
  const setLayoutInsets = useGlobeStore((s) => s.setLayoutInsets);
  const clearScrollTo = useGlobeStore((s) => s.clearScrollTo);
  const reduced = useReducedMotion();
  const status = useStatusLine();
  const { h: viewportH } = useViewport();

  const event = selectedId ? dataset?.events.find((e) => e.id === selectedId) : undefined;
  const art = useStoryArtChain(event);
  const mode = event ? 'story' : 'list';

  const heights: SnapHeights = snapHeights(viewportH, topBottom || 112);
  const [snap, setSnap] = useState<Snap>('peek');
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const [headH, setHeadH] = useState(118);
  const headRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const settled = heights[snap];
  const height = dragHeight ?? settled;

  // the header's real height, so the scrolling body ends at the screen edge
  useLayoutEffect(() => {
    const el = headRef.current;
    if (!el) return;
    const measure = () => setHeadH(Math.round(el.getBoundingClientRect().height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // tell the scene how much screen is covered, so the globe re-centres in
  // what is left (a half sheet still leaves the selected story in view)
  useEffect(() => {
    if (!topBottom) return;
    setLayoutInsets({ top: topBottom, bottom: Math.min(settled, heights.half) });
  }, [topBottom, settled, heights.half, setLayoutInsets]);
  useEffect(() => () => setLayoutInsets({ top: 0, bottom: 0 }), [setLayoutInsets]);

  // — story mode: opened from a card, a globe dot or a deep link —
  const listMemory = useRef<{ snap: Snap; scrollTop: number } | null>(null);
  const prevMode = useRef(mode);
  useEffect(() => {
    if (mode === 'story' && prevMode.current === 'list') {
      listMemory.current = { snap, scrollTop: bodyRef.current?.scrollTop ?? 0 };
      if (snap === 'peek') setSnap('half');
      if (inputModality.keyboard) requestAnimationFrame(() => backRef.current?.focus({ preventScroll: true }));
    }
    if (mode === 'list' && prevMode.current === 'story') {
      const memory = listMemory.current;
      listMemory.current = null;
      if (memory) setSnap(memory.snap);
      const previousId = lastStory.current;
      requestAnimationFrame(() => {
        if (bodyRef.current && memory) bodyRef.current.scrollTop = memory.scrollTop;
        const card = previousId
          ? bodyRef.current?.querySelector<HTMLElement>(`[data-story="${CSS.escape(previousId)}"]`)
          : null;
        if (card && inputModality.keyboard && sheetHasFocus()) card.focus({ preventScroll: true });
      });
    }
    prevMode.current = mode;
    // snap is read, not reacted to
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  const lastStory = useRef<string | null>(null);
  useEffect(() => {
    if (selectedId) lastStory.current = selectedId;
    // a new story starts at its top
    if (selectedId && bodyRef.current) bodyRef.current.scrollTop = 0;
    // the rail's scroll-to cue has no meaning in the sheet
    clearScrollTo();
  }, [selectedId, clearScrollTo]);

  // a region switch starts its list from the top
  useEffect(() => {
    if (mode === 'list' && bodyRef.current) bodyRef.current.scrollTop = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region]);

  function sheetHasFocus() {
    const el = (ref as RefObject<HTMLElement>)?.current;
    return !!el && (el.contains(document.activeElement) || document.activeElement === document.body);
  }

  // — dragging the header —
  const drag = useRef<{
    id: number;
    startY: number;
    startX: number;
    startH: number;
    active: boolean;
    samples: { t: number; h: number }[];
  } | null>(null);
  const suppressClick = useRef(false);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag.current = { id: e.pointerId, startY: e.clientY, startX: e.clientX, startH: settled, active: false, samples: [] };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dy = d.startY - e.clientY;
    if (!d.active) {
      if (Math.abs(dy) < 6 || Math.abs(dy) < Math.abs(e.clientX - d.startX)) return;
      d.active = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const h = clampDrag(d.startH + dy, heights);
    const now = performance.now();
    d.samples.push({ t: now, h });
    while (d.samples.length > 2 && now - d.samples[0].t > 100) d.samples.shift();
    setDragHeight(h);
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.active) return;
    suppressClick.current = true;
    setTimeout(() => (suppressClick.current = false), 0);
    const first = d.samples[0];
    const last = d.samples[d.samples.length - 1];
    const velocity = first && last && last.t > first.t ? (last.h - first.h) / (last.t - first.t) : 0;
    setSnap(resolveSnap(last?.h ?? settled, velocity, heights));
    setDragHeight(null);
  };

  const onHandleKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowUp') setSnap((s) => stepSnap(s, 1));
    else if (e.key === 'ArrowDown') setSnap((s) => stepSnap(s, -1));
    else if (e.key === 'Home') setSnap('full');
    else if (e.key === 'End') setSnap('peek');
    else return;
    e.preventDefault();
  };

  const back = () => select(null);

  const onSheetKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Escape') return;
    if (mode === 'story') back();
    else if (snap !== 'peek') setSnap('peek');
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const title = region === 'world' ? 'Top stories' : `${REGIONS[region].label}`;
  const scrollable = snap !== 'peek' || mode === 'story';

  return (
    <section
      ref={ref}
      className={`m-sheet ${dragHeight !== null ? 'dragging' : ''} ${reduced ? 'no-motion' : ''}`}
      style={{ height: heights.full, transform: `translateY(${heights.full - height}px)` }}
      aria-label={mode === 'story' ? 'Story' : 'Stories'}
      onKeyDown={onSheetKey}
    >
      <div
        ref={headRef}
        className="m-sheet-head"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <button
          className="m-handle"
          onClick={() => {
            if (!suppressClick.current) setSnap(nextSnap(snap));
          }}
          onKeyDown={onHandleKey}
          aria-label={`${mode === 'story' ? 'Story' : 'Story list'}, ${SNAP_NAMES[snap]}. ${
            snap === 'full' ? 'Collapse' : 'Expand'
          }`}
          aria-expanded={snap !== 'peek'}
          aria-controls="m-sheet-body"
        >
          <span className="m-handle-bar" aria-hidden />
        </button>
        {mode === 'list' ? (
          <>
            <div className="m-sheet-title">
              <h2>{title}</h2>
              <p className="m-status">{status}</p>
            </div>
            <RegionChips className="region-chips-sheet" />
          </>
        ) : (
          event && (
            <div className="m-story-nav">
              <button ref={backRef} className="m-back" onClick={back}>
                <ChevronLeftIcon size={18} />
                All stories
              </button>
              <StoryHeader event={event} />
            </div>
          )
        )}
      </div>
      <div
        ref={bodyRef}
        id="m-sheet-body"
        className={`m-sheet-body ${scrollable ? 'scrollable' : ''}`}
        style={{ height: Math.max(0, Math.max(settled, dragHeight ?? 0) - headH) }}
        onFocus={() => {
          if (snap === 'peek') setSnap('half');
        }}
      >
        {mode === 'story' && event && art ? (
          <div className="m-story">
            <StoryBody event={event} art={art} headingId="m-story-heading" />
          </div>
        ) : (
          <StoryList
            stories={sorted}
            chains={chains}
            variant="compact"
            empty={region === 'world' ? undefined : `No ${REGIONS[region].label} stories match the current filters.`}
          />
        )}
      </div>
    </section>
  );
});

/** Theme, space view and the timeline, as a modal sheet over the app. */
function SettingsSheet({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button')?.focus();
  }, []);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !ref.current) return;
    // keep focus inside the dialog
    const focusable = [...ref.current.querySelectorAll<HTMLElement>('button:not([tabindex="-1"]), a[href]')];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        className="m-settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="m-settings-title"
        onKeyDown={onKeyDown}
      >
        <div className="m-settings-head">
          <h2 id="m-settings-title">Settings</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </div>
        <section className="m-settings-section" aria-labelledby="m-settings-theme">
          <h3 id="m-settings-theme" className="panel-heading">
            Theme
          </h3>
          <ThemeControls />
        </section>
        <section className="m-settings-section" aria-labelledby="m-settings-days">
          <h3 id="m-settings-days" className="panel-heading">
            Past days
          </h3>
          <DayPicker className="day-picker-settings" onPick={onClose} />
        </section>
      </div>
    </>
  );
}
