import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { latLonToVec3 } from '../lib/geo';
import { useGlobeStore } from '../store';

/**
 * Dev-only instrumentation for scripts driving a headless browser.
 *
 * `window.__gnRender` is last frame's draw-call and triangle totals, so a
 * script can check what a marker style costs. The renderer resets its
 * counters on every `render()`, and the effect composer renders several
 * times a frame, so with auto-reset on the numbers left over are the final
 * blit's. Counting is taken over here: read, then reset, before the frame's
 * first pass.
 *
 * `window.__gnDebug.project(lat, lon)` says where a story lands on screen,
 * and whether it faces the camera — how a test aims the pointer at a marker.
 */
const scratch = new THREE.Vector3();

export function RenderStats() {
  useFrame((state) => {
    const info = state.gl.info;
    info.autoReset = false;
    const w = window as unknown as { __gnRender: unknown; __gnDebug: unknown };
    w.__gnRender = { calls: info.render.calls, triangles: info.render.triangles };
    info.reset();

    w.__gnDebug = {
      events: useGlobeStore.getState().dataset?.events ?? [],
      project(lat: number, lon: number) {
        const point = latLonToVec3(lat, lon);
        const facing = point.dot(scratch.copy(state.camera.position).normalize());
        point.project(state.camera);
        return {
          x: ((point.x + 1) / 2) * state.size.width + state.size.left,
          y: ((1 - point.y) / 2) * state.size.height + state.size.top,
          facing,
        };
      },
    };
  });
  return null;
}
