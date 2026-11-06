import { useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { NewsEvent } from '../../../shared/news';
import { angularDistance, latLonToVec3, vec3ToLatLon } from '../lib/geo';
import { footprintFor } from '../lib/eventDots';
import { nearestOnScreen, pickRadiusPx, type ScreenCandidate } from '../lib/screenPick';
import { dotLevel, useGlobeStore } from '../store';

/** The framing the pick radius is tuned at; closer in, it tightens with the view. */
const DEFAULT_DISTANCE = 4.3;

/** Where a story's centre is drawn (CSS px, page coordinates) and how squarely it faces the camera. */
export interface StoryScreenPoint {
  x: number;
  y: number;
  /** Cosine between the surface normal and the direction to the camera: 1 head on, ≤0 the far side. */
  facing: number;
}

const scratch = new THREE.Vector3();

/** Projects a story's centre to the page, through the camera's projection (view offset included). */
export function storyScreenPoint(event: NewsEvent, camera: THREE.Camera, rect: DOMRect): StoryScreenPoint {
  const p = latLonToVec3(event.lat, event.lon, 1);
  const toCamera = scratch.copy(camera.position).sub(p).normalize();
  const facing = p.dot(toCamera); // |p| = 1
  p.project(camera);
  return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height, facing };
}

/**
 * The geometric rule: the hit point on the sphere, then the nearest story
 * whose patch (plus a little slack, so small ones are still easy to catch)
 * contains it.
 */
function storyAtPoint(point: THREE.Vector3, camera: THREE.Camera, events: NewsEvent[]): NewsEvent | null {
  const { lat, lon } = vec3ToLatLon(point);
  const zoom = Math.min(1, camera.position.length() / DEFAULT_DISTANCE);
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

/** The screen rule: the story drawn nearest the pointer, within a finger's or a cursor's reach. */
function storyNearPointer(
  clientX: number,
  clientY: number,
  pointerType: string | undefined,
  camera: THREE.Camera,
  rect: DOMRect,
  events: NewsEvent[],
): NewsEvent | null {
  const candidates: ScreenCandidate<NewsEvent>[] = [];
  for (const event of events) candidates.push({ item: event, ...storyScreenPoint(event, camera, rect) });
  return nearestOnScreen(candidates, clientX, clientY, pickRadiusPx(pointerType));
}

/** How squarely the surface at a hit point faces the camera. */
function facingAt(point: THREE.Vector3, camera: THREE.Camera): number {
  return point.clone().normalize().dot(scratch.copy(camera.position).sub(point).normalize());
}

/** Below this the hit point is foreshortened enough that the screen rule judges better. */
const GRAZING = 0.35;

/**
 * The story under the pointer, if any. Stories are patches of lit dots rather
 * than meshes, so picking is geometric — but near the limb a patch shrinks to
 * a few pixels and a fingertip is imprecise, so reach is measured on screen
 * as well. A cursor keeps the geometric rule first (hover stays exactly on
 * the dots); a finger, or a hit near the limb, tries the screen rule first.
 * `point` is null for a tap just off the planet's edge.
 */
function storyAt(
  point: THREE.Vector3 | null,
  native: MouseEvent,
  camera: THREE.Camera,
  canvas: HTMLCanvasElement,
  events: NewsEvent[],
): NewsEvent | null {
  const pointerType = (native as PointerEvent).pointerType || undefined;
  const rect = canvas.getBoundingClientRect();
  const onScreen = () => storyNearPointer(native.clientX, native.clientY, pointerType, camera, rect, events);
  if (!point) return onScreen();
  const geometric = () => storyAtPoint(point, camera, events);
  if (pointerType === 'mouse' && facingAt(point, camera) >= GRAZING) return geometric() ?? onScreen();
  return onScreen() ?? geometric();
}

/**
 * Pointer handlers for the earth mesh: hover shows the tooltip, a click (not a drag) selects.
 * `events` is always the current visible set. While a dataset update is
 * crossfading, the outgoing stories' dots are still fading out on screen,
 * but they are deliberately not pickable: picking runs against the new
 * events only, so nothing can select a story that has just expired.
 */
export function useEventPicking(events: NewsEvent[]) {
  const setHovered = useGlobeStore((s) => s.setHovered);
  const select = useGlobeStore((s) => s.select);
  const canvas = useThree((s) => s.gl.domElement);
  const camera = useThree((s) => s.camera);

  const clear = () => {
    document.body.style.cursor = 'auto';
    if (useGlobeStore.getState().hovered) setHovered(null);
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    // a drag is rotating the globe, not browsing it
    if (e.buttons !== 0 || e.nativeEvent.pointerType !== 'mouse') return;
    const story = storyAt(e.point, e.nativeEvent, e.camera, canvas, events);
    if (!story) return clear();
    document.body.style.cursor = 'pointer';
    setHovered({ id: story.id, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
  };

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return;
    e.stopPropagation();
    // the globe is one mesh now, so an empty patch of it has to clear the
    // selection itself — the canvas only reports clicks that hit nothing
    const story = storyAt(e.point, e.nativeEvent, e.camera, canvas, events);
    select(story ? story.id : null, story ? { fromGlobe: true } : undefined);
  };

  // A click that missed the planet: a tap just off the limb may still be
  // meant for a story drawn there; anything else clears the selection.
  const onPointerMissed = (native: MouseEvent) => {
    const story = storyAt(null, native, camera, canvas, events);
    select(story ? story.id : null, story ? { fromGlobe: true } : undefined);
  };

  return { onPointerMove, onPointerOut: clear, onClick, onPointerMissed };
}
