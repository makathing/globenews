import { longDayLabel } from '../lib/archive';
import { useGlobeStore } from '../store';

/** Shown while an archived day is on screen: which day, and the way back. */
export function ViewingBanner({ className = '' }: { className?: string }) {
  const viewingDate = useGlobeStore((s) => s.viewingDate);
  const viewDay = useGlobeStore((s) => s.viewDay);
  if (!viewingDate) return null;
  return (
    <div className={`viewing-banner ${className}`} role="status">
      <span>
        Viewing <strong>{longDayLabel(viewingDate)}</strong>
        <span className="viewing-note"> · archive</span>
      </span>
      <button className="viewing-back" onClick={() => void viewDay(null)}>
        Back to today
      </button>
    </div>
  );
}
