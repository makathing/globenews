import { useEffect, useState } from 'react';
import { useGlobeStore } from '../store';

const BOOT_LINES = [
  'INITIALIZING GLOBAL SCAN…',
  'LINKING ORBITAL SENSORS…',
  'SOURCE INTEL TABLE LOADED',
  'SIGNAL FEED ONLINE',
];

/** Short intro sequence: types out boot lines, then fades away. */
export function Boot() {
  const booted = useGlobeStore((s) => s.booted);
  const setBooted = useGlobeStore((s) => s.setBooted);
  const [visibleLines, setVisibleLines] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (booted) return;
    const lineTimer = setInterval(() => {
      setVisibleLines((n) => Math.min(n + 1, BOOT_LINES.length));
    }, 350);
    const fadeTimer = setTimeout(() => setFading(true), 1700);
    const doneTimer = setTimeout(() => setBooted(), 2300);
    return () => {
      clearInterval(lineTimer);
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [booted, setBooted]);

  if (booted) return null;

  return (
    <div className={`boot-overlay ${fading ? 'fading' : ''}`}>
      <div className="boot-box">
        <div className="boot-title">GLOBENEWS</div>
        {BOOT_LINES.slice(0, visibleLines).map((line) => (
          <div key={line} className="boot-line">
            <span className="boot-caret">▸</span> {line}
          </div>
        ))}
      </div>
    </div>
  );
}
