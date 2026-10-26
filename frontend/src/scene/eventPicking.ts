import type { ThreeEvent } from '@react-three/fiber';
import type { NewsEvent } from '../../../shared/news';
import { angularDistance, vec3ToLatLon } from '../lib/geo';
import { footprintFor } from '../lib/eventDots';
import { dotLevel, useGlobeStore } from '../store';

/** The framing the pick radius is tuned at; closer in, it tightens with the view. */
const DEFAULT_DISTANCE = 4.3;

/**
 * The story under the cursor, if any. Stories are patches of lit dots rather
 * than meshes, so picking is geometric: the hit point on the sphere, then the
 * nearest visible story whose patch (plus a little slack, so small ones are
 * still easy to catch) contains it.
 */
function storyAt(e: ThreeEvent<PointerEvent | MouseEvent>, events: NewsEvent[]): NewsEvent | null {
  const { lat, lon } = vec3ToLatLon(e.point);
  const zoom = Math.min(1, e.camera.position.length() / DEFAULT_DISTANCE);
  let best: NewsEvent | null = null;
  let bestScore = Infinity;
  for (const event of events) {
    const distance = angularDistance(lat, lon, event.lat, event.lon);
    const reach = footprintFor(event.severity, dotLevel.width) + 1.5 * zoom;
    if (distance > reach) continue;
    // nearest edge wins, so a big story doesn't swallow a small neighbour
    const score = distance / reach;
    if (score < bestScore) {
      bestScore = score;
      best = event;
    }
  }
  return best;
}

/** Pointer handlers for the earth mesh: hover shows the tooltip, a click (not a drag) selects. */
export function useEventPicking(events: NewsEvent[]) {
  const setHovered = useGlobeStore((s) => s.setHovered);
  const select = useGlobeStore((s) => s.select);

  const clear = () => {
    document.body.style.cursor = 'auto';
    if (useGlobeStore.getState().hovered) setHovered(null);
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    // a drag is rotating the globe, not browsing it
    if (e.buttons !== 0 || e.nativeEvent.pointerType !== 'mouse') return;
    const story = storyAt(e, events);
    if (!story) return clear();
    document.body.style.cursor = 'pointer';
    setHovered({ id: story.id, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
  };

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return;
    e.stopPropagation();
    // the globe is one mesh now, so an empty patch of it has to clear the
    // selection itself — the canvas only reports clicks that hit nothing
    const story = storyAt(e, events);
    select(story ? story.id : null, story ? { fromGlobe: true } : undefined);
  };

  return { onPointerMove, onPointerOut: clear, onClick };
}
