import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import { dayLabel, utcDay } from '../lib/archive';
import { useGlobeStore } from '../store';
import { radioKeyDown } from './radio';

/**
 * The timeline: today's live map, then each archived day. The archive index
 * is fetched the first time the picker is shown; a day's snapshot only when
 * it is picked. The day the live map is from is not repeated as an archive
 * chip (it is "Today").
 */
export function DayPicker({ className = '', onPick }: { className?: string; onPick?: () => void }) {
  const days = useGlobeStore((s) => s.archiveDays);
  const load = useGlobeStore((s) => s.loadArchiveIndex);
  const viewingDate = useGlobeStore((s) => s.viewingDate);
  const loadingDate = useGlobeStore((s) => s.loadingDate);
  const viewDay = useGlobeStore((s) => s.viewDay);
  const live = useGlobeStore((s) => s.liveDataset);

  useEffect(() => {
    void load();
  }, [load]);

  const today = utcDay(Date.now());
  const liveDay = live?.generatedAt.slice(0, 10);
  const past = useMemo(() => (days ?? []).filter((d) => d.date !== liveDay && d.date < today), [days, liveDay, today]);
  const current = loadingDate ?? viewingDate;
  const ids = useMemo(() => ['today', ...past.map((d) => d.date)], [past]);
  const choose = (id: string) => void viewDay(id === 'today' ? null : id);
  const pick = (date: string | null) => {
    void viewDay(date);
    onPick?.();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => radioKeyDown(e, ids, current ?? 'today', choose);

  // keep the chosen day in view in the scrolling row
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const active = ref.current?.querySelector<HTMLElement>('.day-chip.active');
    const row = ref.current;
    if (active && row && row.scrollWidth > row.clientWidth) {
      row.scrollLeft = active.offsetLeft - row.clientWidth / 2 + active.offsetWidth / 2;
    }
  }, [current, past]);

  if (days && past.length === 0) return null;
  return (
    <div ref={ref} className={`day-picker ${className}`} role="radiogroup" aria-label="Day">
      <button
        role="radio"
        aria-checked={current === null}
        tabIndex={current === null || !ids.includes(current) ? 0 : -1}
        className={`day-chip ${current === null ? 'active' : ''}`}
        onClick={() => pick(null)}
        onKeyDown={onKeyDown}
      >
        Today
      </button>
      {past.map((day) => (
        <button
          key={day.date}
          role="radio"
          aria-checked={current === day.date}
          aria-busy={loadingDate === day.date}
          tabIndex={current === day.date ? 0 : -1}
          className={`day-chip ${current === day.date ? 'active' : ''}`}
          onClick={() => pick(day.date)}
          onKeyDown={onKeyDown}
          aria-label={`${dayLabel(day.date, today)}, ${day.count} stories`}
        >
          {dayLabel(day.date, today)}
        </button>
      ))}
      {!days && <span className="day-loading">Loading days…</span>}
    </div>
  );
}
