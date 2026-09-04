import { useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { NewsEvent } from '../../../shared/news';
import { freshnessClock } from '../lib/beams';
import { GLOBE_RADIUS, latLonToVec3 } from '../lib/geo';
import { useGlobeStore, useTheme } from '../store';

/**
 * What every marker style shares: where a story sits on the sphere, how the
 * camera relates to it this frame, how it responds to the pointer, and the
 * pool of light at its base. Beams.tsx and Pins.tsx are the two styles built
 * on this; each owns only the shape that stands on the pool.
 */

export const UP = new THREE.Vector3(0, 1, 0);
/** Frame-local scratch, reused by every marker within one useFrame pass. */
const toEye = new THREE.Vector3();

/** The default framing, where markers should look exactly as tuned. */
export const DEFAULT_DISTANCE = 4.3;
/** Just inside OrbitControls' minDistance. */
export const NEAR_DISTANCE = 1.9;
/** OrbitControls' maxDistance. */
export const FAR_DISTANCE = 8;

/** 0 at the default framing and beyond, 1 right up against the surface. */
export function proximityFor(distance: number): number {
  return Math.min(Math.max(1 - (distance - NEAR_DISTANCE) / (DEFAULT_DISTANCE - NEAR_DISTANCE), 0), 1);
}

/** 0 at the default framing and closer, 1 fully zoomed out. */
export function farFor(distance: number): number {
  return Math.min(Math.max((distance - DEFAULT_DISTANCE) / (FAR_DISTANCE - DEFAULT_DISTANCE), 0), 1);
}

/** Surface position, the rotation that makes local +Y the surface normal, and that normal. */
export function useSurfaceFrame(lat: number, lon: number) {
  return useMemo(() => {
    const position = latLonToVec3(lat, lon, GLOBE_RADIUS);
    const axis = position.clone().normalize();
    const quaternion = new THREE.Quaternion().setFromUnitVectors(UP, axis);
    return { position, quaternion, axis };
  }, [lat, lon]);
}

export interface MarkerFrame {
  time: number;
  /** 0..1, eased toward 1 while hovered or selected. */
  boost: number;
  fresh: number;
  intensity: number;
  proximity: number;
  far: number;
  /** |dot(surface normal, view direction)|: 1 = looking straight down at it. */
  axisView: number;
  distance: number;
  /** World units per screen pixel at the marker's distance. */
  worldPerPixel: number;
}

/** Uniforms every marker shader reads; `applyFrame` writes them each frame. */
export function sharedMarkerUniforms(color: THREE.Color, breaking: boolean) {
  return {
    uColor: { value: color.clone() },
    uTime: { value: Math.random() * 30 },
    uBoost: { value: 0 },
    uFresh: { value: 1 },
    uIntensity: { value: 1 },
    uProximity: { value: 0 },
    uFar: { value: 0 },
    uAxisView: { value: 0 },
    uBreaking: { value: breaking ? 1 : 0 },
  };
}

export function applyFrame(material: THREE.ShaderMaterial, frame: MarkerFrame): void {
  const u = material.uniforms;
  u.uTime.value = frame.time;
  u.uBoost.value = frame.boost;
  u.uFresh.value = frame.fresh;
  u.uIntensity.value = frame.intensity;
  u.uProximity.value = frame.proximity;
  u.uFar.value = frame.far;
  u.uAxisView.value = frame.axisView;
}

/**
 * Per-frame camera/interaction state for one marker. Returns the ref the
 * pointer handlers set so hover from the globe and hover from the rail both
 * drive the same boost.
 */
export function useMarkerFrame(
  event: NewsEvent,
  position: THREE.Vector3,
  axis: THREE.Vector3,
  onFrame: (frame: MarkerFrame) => void,
) {
  const theme = useTheme();
  const selectedId = useGlobeStore((s) => s.selectedId);
  const hoveredId = useGlobeStore((s) => s.hovered?.id ?? null);
  const boostRef = useRef(0);
  const pointerInsideRef = useRef(false);
  const clock = useMemo(() => freshnessClock(event), [event]);
  const frameRef = useRef<MarkerFrame>({
    time: 0,
    boost: 0,
    fresh: 1,
    intensity: 1,
    proximity: 0,
    far: 0,
    axisView: 0,
    distance: DEFAULT_DISTANCE,
    worldPerPixel: 0.005,
  });

  useFrame((state, delta) => {
    const active = pointerInsideRef.current || hoveredId === event.id || selectedId === event.id;
    boostRef.current += ((active ? 1 : 0) - boostRef.current) * Math.min(delta * 8, 1);
    // `position` is the marker's base in world space — its group sits at the
    // origin — so this is the camera's true distance to the marker
    const distance = state.camera.position.distanceTo(position);
    toEye.subVectors(state.camera.position, position).normalize();
    const camera = state.camera as THREE.PerspectiveCamera;
    const frame = frameRef.current;
    frame.time = state.clock.elapsedTime;
    frame.boost = boostRef.current;
    frame.fresh = clock(Date.now());
    frame.intensity = theme.beamIntensity;
    frame.proximity = proximityFor(distance);
    frame.far = farFor(distance);
    frame.axisView = Math.abs(toEye.dot(axis));
    frame.distance = distance;
    frame.worldPerPixel =
      (2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / state.size.height;
    onFrame(frame);
  });

  return pointerInsideRef;
}

/** Hover/select wiring shared by every marker's hit target. */
export function useMarkerPointer(event: NewsEvent, pointerInsideRef: React.MutableRefObject<boolean>) {
  const setHovered = useGlobeStore((s) => s.setHovered);
  const select = useGlobeStore((s) => s.select);

  const onPointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    pointerInsideRef.current = true;
    document.body.style.cursor = 'pointer';
    setHovered({ id: event.id, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
  };
  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (pointerInsideRef.current) {
      setHovered({ id: event.id, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
    }
  };
  const onPointerOut = () => {
    pointerInsideRef.current = false;
    document.body.style.cursor = 'auto';
    setHovered(null);
  };
  // A touch fires pointerover but never pointerout, so on a phone the tooltip
  // pinned open over the globe until you tapped a different marker. Lifting
  // the finger is the "out" event that touch never sends.
  const onTouchRelease = (e: ThreeEvent<PointerEvent>) => {
    if (e.nativeEvent.pointerType !== 'mouse') onPointerOut();
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    select(event.id, { fromGlobe: true });
  };

  return {
    onPointerOver,
    onPointerMove,
    onPointerOut,
    onPointerUp: onTouchRelease,
    onPointerCancel: onTouchRelease,
    onClick,
  };
}

export type MarkerPointerHandlers = ReturnType<typeof useMarkerPointer>;

/**
 * Invisible hit volume standing on the surface. Never drawn — three's
 * raycaster ignores `visible`, so it still takes the pointer — which saves a
 * draw call per story over the old transparent-black material.
 */
export function MarkerHitTarget({
  height,
  radiusTop,
  radiusBottom,
  handlers,
}: {
  height: number;
  radiusTop: number;
  radiusBottom: number;
  handlers: MarkerPointerHandlers;
}) {
  return (
    <mesh position={[0, height / 2, 0]} visible={false} {...handlers}>
      <cylinderGeometry args={[radiusTop, radiusBottom, height, 6, 1, true]} />
      <meshBasicMaterial />
    </mesh>
  );
}
