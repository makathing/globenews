import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { cameraMotion, prefersReducedMotion, useGlobeStore } from '../store';
import { latLonToVec3 } from '../lib/geo';

const IDLE_BEFORE_AUTOROTATE_MS = 10_000;

/**
 * Owns the OrbitControls plus two side jobs:
 *  - publishes smoothed camera angular velocity to `cameraMotion`
 *    (drives star streaks + the motion-smear pass)
 *  - flies the camera to a blip when an event is selected
 */
export function CameraRig() {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const camera = useThree((s) => s.camera);
  const selectedId = useGlobeStore((s) => s.selectedId);
  const dataset = useGlobeStore((s) => s.dataset);

  const prevAngles = useRef({ az: 0, pol: 0 });
  const lastInteraction = useRef(0);
  const flyTarget = useRef<THREE.Vector3 | null>(null);

  useEffect(() => {
    if (!selectedId || !dataset) {
      flyTarget.current = null;
      return;
    }
    const event = dataset.events.find((e) => e.id === selectedId);
    if (!event) return;
    flyTarget.current = latLonToVec3(event.lat, event.lon, 1).normalize();
  }, [selectedId, dataset]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;

    // — angular velocity for motion streaks —
    const az = controls.getAzimuthalAngle();
    const pol = controls.getPolarAngle();
    const dt = Math.max(delta, 1e-4);
    let dAz = az - prevAngles.current.az;
    if (dAz > Math.PI) dAz -= Math.PI * 2;
    if (dAz < -Math.PI) dAz += Math.PI * 2;
    const instVx = dAz / dt;
    const instVy = (pol - prevAngles.current.pol) / dt;
    prevAngles.current = { az, pol };

    const smoothing = Math.min(dt * 7, 1);
    cameraMotion.vx += (instVx - cameraMotion.vx) * smoothing;
    cameraMotion.vy += (instVy - cameraMotion.vy) * smoothing;
    cameraMotion.speed = Math.hypot(cameraMotion.vx, cameraMotion.vy);

    // — idle auto-rotate —
    const idle = performance.now() - lastInteraction.current > IDLE_BEFORE_AUTOROTATE_MS;
    controls.autoRotate = !prefersReducedMotion && idle && !selectedId;

    // — fly to selected blip —
    if (flyTarget.current) {
      const distance = camera.position.length();
      const desired = flyTarget.current.clone().multiplyScalar(distance);
      camera.position.lerp(desired, Math.min(dt * 3.2, 1));
      if (camera.position.angleTo(desired) < 0.01) flyTarget.current = null;
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
      minDistance={1.45}
      maxDistance={4.6}
      zoomSpeed={0.7}
      onStart={() => {
        // fires on user input only (not on damping/auto-rotate frames)
        lastInteraction.current = performance.now();
        flyTarget.current = null; // user takes over
      }}
    />
  );
}
