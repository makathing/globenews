import { useEffect, useState } from 'react';
import { relativeTime } from '../lib/beams';
import { useGlobeStore } from '../store';

/**
 * When the feed was last generated, as a small chip at the foot of the globe.
 * One fact, one place: the rail footer and the old scrubber bar both used to say
 * it, in three formats. The full UTC timestamp is one hover away.
 */
export function Updated() {
  const dataset = useGlobeStore((s) => s.dataset);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // relativeTime is minute-grained below an hour; ticking faster buys nothing
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  if (!dataset) return null;
  const generated = new Date(dataset.generatedAt);
  return (
    <div className="updated" title={`Generated ${generated.toISOString().replace('T', ' ').slice(0, 16)} UTC`}>
      Updated {relativeTime(dataset.generatedAt, now)}
    </div>
  );
}
