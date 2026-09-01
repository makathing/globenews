import { useEffect, useMemo, useRef, useState } from 'react';
import { FRESHNESS_WINDOW_HOURS, isStale } from '../lib/beams';
import { useGlobeStore } from '../store';

const BUCKETS = FRESHNESS_WINDOW_HOURS; // one bar per hour
const SWEEP_MS = 10_000;

/**
 * 24-hour scrubber. Dragging the cursor hides events first seen after it;
 * parked at the right edge the view is LIVE and everything shows.
 */
export function Timeline() {
  const dataset = useGlobeStore((s) => s.dataset);
  const timeCursor = useGlobeStore((s) => s.timeCursor);
  const setTimeCursor = useGlobeStore((s) => s.setTimeCursor);
  const [playing, setPlaying] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  const { start, end, histogram, span } = useMemo(() => {
    const endMs = dataset ? new Date(dataset.generatedAt).getTime() : Date.now();
    const startMs = endMs - FRESHNESS_WINDOW_HOURS * 3_600_000;
    const bars = new Array<number>(BUCKETS).fill(0);
    for (const event of dataset?.events ?? []) {
      const t = new Date(event.firstSeen).getTime();
      const index = Math.floor(((t - startMs) / (endMs - startMs)) * BUCKETS);
      if (index >= 0 && index < BUCKETS) bars[index] += 1;
    }
    return { start: startMs, end: endMs, histogram: bars, span: endMs - startMs };
  }, [dataset]);

  const peak = Math.max(1, ...histogram);
  const filled = histogram.filter((n) => n > 0).length;
  const position = timeCursor === null ? 1 : Math.min(1, Math.max(0, (timeCursor - start) / span));

  // play sweep
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let from = timeCursor ?? start;
    if (timeCursor === null) from = start;
    let last = performance.now();
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      from += (span / SWEEP_MS) * dt;
      if (from >= end) {
        setTimeCursor(null);
        setPlaying(false);
        return;
      }
      setTimeCursor(from);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const scrubTo = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setTimeCursor(ratio > 0.985 ? null : start + ratio * span);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    setPlaying(false);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    scrubTo(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.buttons === 1) scrubTo(e.clientX);
  };

  if (!dataset) return null;

  // Parked at the right edge means "showing everything we have" — which is
  // only LIVE if what we have is current. This badge read LIVE over a
  // two-day-old file, which is the one thing it must never do.
  const stale = isStale(dataset.generatedAt);
  const label =
    timeCursor === null
      ? stale
        ? 'STALE'
        : 'LIVE'
      : new Date(timeCursor).toISOString().slice(11, 16) + ' UTC';

  return (
    <div className="timeline" aria-label="24 hour timeline">
      <button
        className={`timeline-play ${playing ? 'on' : ''}`}
        onClick={() => setPlaying((p) => !p)}
        aria-label={playing ? 'Pause sweep' : 'Play 24-hour sweep'}
      >
        {playing ? '❙❙' : '▶'}
      </button>

      <div
        className="timeline-track"
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        role="slider"
        tabIndex={0}
        aria-valuemin={start}
        aria-valuemax={end}
        aria-valuenow={timeCursor ?? end}
        aria-valuetext={label}
      >
        <div className="timeline-bars">
          {histogram.map((count, index) => (
            <span
              key={index}
              className={`timeline-bar ${index / BUCKETS <= position ? 'in' : ''}`}
              style={{ height: `${Math.max(count === 0 ? 6 : 18, (count / peak) * 100)}%` }}
            />
          ))}
        </div>
        <div className="timeline-fill" style={{ width: `${position * 100}%` }} />
        <div className="timeline-cursor" style={{ left: `${position * 100}%` }} />
      </div>

      <div className="timeline-labels">
        <span
          className={`timeline-now ${timeCursor === null && !stale ? 'live' : ''} ${
            timeCursor === null && stale ? 'stale' : ''
          }`}
          title={stale ? 'The feed has not updated in over a day' : undefined}
        >
          {label}
        </span>
        <span className="timeline-span">
          {stale
            ? 'feed not updating'
            : filled <= 1
              ? 'collecting history — 24h window'
              : 'last 24h'}
        </span>
      </div>
    </div>
  );
}
