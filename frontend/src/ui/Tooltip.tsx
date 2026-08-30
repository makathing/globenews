import { CATEGORY_COLORS, CATEGORY_LABELS } from '../../../shared/news';
import { useGlobeStore } from '../store';

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
      <span className="tooltip-chip" style={{ background: CATEGORY_COLORS[event.category] }}>
        {CATEGORY_LABELS[event.category]}
      </span>
      <div className="tooltip-headline">{event.headline}</div>
      <div className="tooltip-hint">Click for details</div>
    </div>
  );
}
