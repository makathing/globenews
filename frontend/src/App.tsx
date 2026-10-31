import { useEffect } from 'react';
import { SceneRoot } from './scene/SceneRoot';
import { EventRail } from './ui/EventRail';
import { EventPanel } from './ui/EventPanel';
import { MobileShell } from './ui/MobileShell';
import { Tooltip } from './ui/Tooltip';
import { Updated } from './ui/Updated';
import { ViewingBanner } from './ui/ViewingBanner';
import { useGlobeStore, useIsMobile } from './store';
import { useUrlSync } from './lib/urlState';
import { BUNDLED_DATASET, useLiveDataset } from './lib/dataset';

export function App() {
  const setLiveDataset = useGlobeStore((s) => s.setLiveDataset);
  const dataset = useGlobeStore((s) => s.dataset);
  const mobile = useIsMobile();
  const panelOpen = useGlobeStore((s) => s.selectedId !== null);
  const setLayoutInsets = useGlobeStore((s) => s.setLayoutInsets);
  useUrlSync();

  // desktop: centre the globe between the rail and the story panel
  // (widths from styles.css: .rail 300px; .event-panel 368px + 16px margins)
  useEffect(() => {
    if (mobile) setLayoutInsets({ left: 0, right: 0 });
    else setLayoutInsets({ top: 0, bottom: 0, left: 300, right: panelOpen ? Math.min(400, window.innerWidth * 0.3) : 0 });
  }, [mobile, panelOpen, setLayoutInsets]);

  // the stories ship inside the bundle, so there is nothing to wait for
  useEffect(() => {
    setLiveDataset(BUNDLED_DATASET);
  }, [setLiveDataset]);

  // A radar left open all afternoon should not still be showing this
  // morning's batch: revalidate while visible and adopt only newer runs.
  // The whole update protocol is documented in lib/dataset.ts.
  useLiveDataset();

  return (
    <div className={`app ${mobile ? 'is-mobile' : 'is-desktop'}`}>
      <SceneRoot />
      {mobile ? (
        // the phone layout: top bar + bottom sheet; no hover tooltip on touch
        <MobileShell />
      ) : (
        <>
          <EventRail />
          <EventPanel />
          <Tooltip />
          <Updated />
          <ViewingBanner className="viewing-banner-desktop" />
        </>
      )}
      {!dataset && <div className="data-status">Loading events…</div>}
    </div>
  );
}
