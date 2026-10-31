import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { cameraMotion, narrowViewport, prefersReducedMotion, useGlobeStore } from '../store';
import { latLonToVec3 } from '../lib/geo';
import { framedDistance } from '../lib/framing';
import { REGIONS } from '../lib/regions';

const IDLE_BEFORE_AUTOROTATE_MS = 10_000;

/** The desktop's whole-globe framing distance (|START_POSITION| in SceneRoot). */
export const DESKTOP_WORLD_DISTANCE = Math.hypot(1.15, 0.95, 4.3);
export const MIN_DISTANCE = 1.75;
export const MAX_DISTANCE = 8;

/** Where the camera flies: a direction from the globe's centre, and optionally a new distance. */
interface FlyTarget {
  dir: THREE.Vector3;
  distance: number | null;
}

/**
 * Owns the OrbitControls plus two side jobs:
 *  - publishes smoothed camera angular velocity to `cameraMotion`
 *    (drives star streaks + the motion-smear pass)
 *  - flies the camera to a story when it is selected, and to a region view
 *    when one is picked (direction and distance)
 */
export function CameraRig() {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const selectedId = useGlobeStore((s) => s.selectedId);
  const dataset = useGlobeStore((s) => s.dataset);
  const region = useGlobeStore((s) => s.region);
  const insets = useGlobeStore((s) => s.layoutInsets);

  const prevAngles = useRef({ az: 0, pol: 0 });
  const lastInteraction = useRef(0);
  const touched = useRef(false);
  const flyTarget = useRef<FlyTarget | null>(null);

  /**
   * The whole-globe distance for this screen: on a phone, fitted to the band
   * between the top bar and the sheet; on desktop, the fixed opening framing.
   */
  const worldDistance = () => {
    if (!narrowViewport && insets.top === 0 && insets.bottom === 0) return DESKTOP_WORLD_DISTANCE;
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 45;
    const band = size.height - insets.top - insets.bottom;
    return Math.min(MAX_DISTANCE, framedDistance({ bandPx: band, widthPx: size.width, heightPx: size.height, fovDeg: fov }));
  };

  // a story is a patch of lit dots, so it reads best looked at straight on;
  // keep the current distance
  useEffect(() => {
    if (!selectedId || !dataset) {
      if (flyTarget.current?.distance === null) flyTarget.current = null;
      return;
    }
    const event = dataset.events.find((e) => e.id === selectedId);
    if (!event) return;
    flyTarget.current = { dir: latLonToVec3(event.lat, event.lon, 1).normalize(), distance: null };
  }, [selectedId, dataset]);

  // a region view: look at it from a distance that frames it
  const regionSeen = useRef<string | null>(null);
  useEffect(() => {
    const first = regionSeen.current === null;
    if (regionSeen.current === region) return;
    regionSeen.current = region;
    if (first && region === 'world') return;
    // a deep-linked story outranks the region's framing on load
    if (first && useGlobeStore.getState().selectedId) return;
    const view = REGIONS[region];
    const distance = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE + 0.2, worldDistance() * view.zoom));
    const dir =
      region === 'world'
        ? camera.position.clone().normalize().setY(0.21).normalize()
        : latLonToVec3(view.lat, view.lon, 1).normalize();
    flyTarget.current = { dir, distance };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region]);

  // On a phone the chrome is measured after the first frame: once it is,
  // push the untouched opening view back to fit the band it leaves.
  const framedOnce = useRef(false);
  useEffect(() => {
    if (framedOnce.current || insets.top === 0) return;
    framedOnce.current = true;
    if (touched.current || flyTarget.current || region !== 'world') return;
    camera.position.setLength(worldDistance());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insets]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;

    // — idle auto-rotate —
    const idle = performance.now() - lastInteraction.current > IDLE_BEFORE_AUTOROTATE_MS;
    const drifting = !prefersReducedMotion && idle && !selectedId && region === 'world';
    controls.autoRotate = drifting;

    // — angular velocity for motion streaks —
    const az = controls.getAzimuthalAngle();
    const pol = controls.getPolarAngle();
    const dt = Math.max(delta, 1e-4);
    let dAz = az - prevAngles.current.az;
    if (dAz > Math.PI) dAz -= Math.PI * 2;
    if (dAz < -Math.PI) dAz += Math.PI * 2;
    const dPol = pol - prevAngles.current.pol;
    prevAngles.current = { az, pol };

    // Auto-rotate is camera motion too, so measuring it blindly leaves the sky
    // permanently streaked on an untouched globe. Streaks belong to *your*
    // motion: drag and the damped fling after it. Idle drift decays to still.
    const instVx = drifting ? 0 : dAz / dt;
    const instVy = drifting ? 0 : dPol / dt;

    const smoothing = Math.min(dt * 7, 1);
    cameraMotion.vx += (instVx - cameraMotion.vx) * smoothing;
    cameraMotion.vy += (instVy - cameraMotion.vy) * smoothing;
    cameraMotion.speed = Math.hypot(cameraMotion.vx, cameraMotion.vy);

    // — fly to the selected story or region —
    const fly = flyTarget.current;
    if (fly) {
      const length = camera.position.length();
      const goal = fly.distance ?? length;
      const k = prefersReducedMotion ? 1 : Math.min(dt * 3.2, 1);
      // direction and distance move separately, so the path arcs around the
      // planet instead of cutting through it
      const dir = camera.position.clone().normalize().lerp(fly.dir, k);
      if (dir.lengthSq() < 1e-6) dir.copy(fly.dir);
      camera.position.copy(dir.normalize().multiplyScalar(length + (goal - length) * k));
      if (camera.position.angleTo(fly.dir) < 0.01 && Math.abs(camera.position.length() - goal) < 0.01) {
        flyTarget.current = null;
      }
    }

    controls.update();
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.07}
      rotateSpeed={0.45}
      autoRotateSpeed={0.4}
      minDistance={MIN_DISTANCE}
      maxDistance={MAX_DISTANCE}
      zoomSpeed={0.7}
      onStart={() => {
        // fires on user input only (not on damping/auto-rotate frames)
        lastInteraction.current = performance.now();
        touched.current = true;
        flyTarget.current = null; // user takes over
      }}
    />
  );
}
