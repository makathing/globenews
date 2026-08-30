import { CATEGORY_COLORS, CATEGORY_LABELS } from '../../../shared/news';
import { useGlobeStore } from '../store';
import { CategoryIcon } from './icons';

export function Tooltip() {
  const hovered = useGlobeStore((s) => s.hovered);
  const dataset = useGlobeStore((s) => s.dataset);

  const event = hovered ? dataset?.events.find((e) => e.id === hovered.id) : undefined;
  if (!hovered || !event) return null;

  return (
    <div
      className="blip-tooltip"
      style={{
        left: Math.min(hovered.x + 14, window.innerWidth - 280),
        top: hovered.y + 14,
      }}
    >
      {event.image && (
        <div className="tooltip-thumb">
          <img src={event.image.url} alt="" loading="lazy" referrerPolicy="no-referrer" />
        </div>
      )}
      <span className="tooltip-chip" style={{ color: CATEGORY_COLORS[event.category] }}>
        <CategoryIcon category={event.category} size={11} />
        {CATEGORY_LABELS[event.category]}
      </span>
      <div className="tooltip-headline">{event.headline}</div>
      <div className="tooltip-hint">Click for details</div>
    </div>
  );
}
