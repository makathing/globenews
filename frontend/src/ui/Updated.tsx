import { useEffect, useState } from 'react';
import { longDayLabel } from '../lib/archive';
import { briefingLabel, checkedLabel } from '../lib/status';
import { useGlobeStore } from '../store';

/** The status line's text: "Today's briefing · 06:00 UTC · checked 3 min ago". */
export function useStatusLine(): string {
  const dataset = useGlobeStore((s) => s.dataset);
  const viewingDate = useGlobeStore((s) => s.viewingDate);
  const checkedAt = useGlobeStore((s) => s.liveCheckedAt);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (!dataset) return 'Loading…';
  if (viewingDate) return `Archive · ${longDayLabel(viewingDate)} · live updates paused`;
  const checked = checkedLabel(checkedAt, now);
  return checked ? `${briefingLabel(dataset, now)} · ${checked}` : briefingLabel(dataset, now);
}

/**
 * Desktop: which briefing the map is showing and when the site last checked
 * for a newer one, as a chip at the foot of the globe.
 */
export function Updated() {
  const dataset = useGlobeStore((s) => s.dataset);
  const line = useStatusLine();
  if (!dataset) return null;
  return (
    <div
      className="updated"
      title={`Generated ${new Date(dataset.generatedAt).toISOString().replace('T', ' ').slice(0, 16)} UTC`}
    >
      {line}
    </div>
  );
}
