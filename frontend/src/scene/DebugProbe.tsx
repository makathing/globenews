import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGlobeStore } from '../store';
import { storyScreenPoint, type StoryScreenPoint } from './eventPicking';

/**
 * Read-only measuring hook for automated UI checks, installed only when the
 * page is opened with `?debug`: `window.__globenewsDebug.storyScreen(id)`
 * reports where a story is drawn (page CSS px) and how squarely it faces the
 * camera, `globeDisc()` where the planet's outline is. Nothing on it changes
 * app state.
 */
export function DebugProbe() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('debug')) return;
    const w = window as unknown as { __globenewsDebug?: unknown };
    w.__globenewsDebug = Object.freeze({
      storyScreen(id: string): StoryScreenPoint | null {
        const event = useGlobeStore.getState().dataset?.events.find((e) => e.id === id);
        return event ? storyScreenPoint(event, camera, gl.domElement.getBoundingClientRect()) : null;
      },
      globeDisc(): { x: number; y: number; r: number } {
        const cam = camera as THREE.PerspectiveCamera;
        const rect = gl.domElement.getBoundingClientRect();
        const c = new THREE.Vector3().project(cam);
        const focal = rect.height / 2 / Math.tan((cam.fov * Math.PI) / 360);
        const d = cam.position.length();
        return {
          x: rect.left + ((c.x + 1) / 2) * rect.width,
          y: rect.top + ((1 - c.y) / 2) * rect.height,
          r: focal / Math.sqrt(Math.max(1e-6, d * d - 1)),
        };
      },
    });
    return () => {
      delete w.__globenewsDebug;
    };
  }, [camera, gl]);
  return null;
}
