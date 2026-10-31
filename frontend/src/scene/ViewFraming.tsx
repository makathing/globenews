import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { viewOffsetX, viewOffsetY } from '../lib/framing';
import { prefersReducedMotion, useGlobeStore } from '../store';

/**
 * Centres the globe in the part of the screen the chrome leaves free (the
 * desktop rail and story panel; the mobile top bar and bottom sheet), by
 * shifting the projection rather than moving the camera: orbiting, zoom and
 * picking all keep working around the globe's centre. Eases between layouts.
 */
export function ViewFraming() {
  useFrame(({ camera, size }, delta) => {
    const cam = camera as THREE.PerspectiveCamera;
    const { top, bottom, left, right } = useGlobeStore.getState().layoutInsets;
    const tx = viewOffsetX(left, right);
    const ty = viewOffsetY(top, bottom);
    const v = cam.view;
    const cx = v?.enabled ? v.offsetX : 0;
    const cy = v?.enabled ? v.offsetY : 0;
    const k = prefersReducedMotion ? 1 : Math.min(1, delta * 8);
    const ease = (c: number, t: number) => (Math.abs(t - (c + (t - c) * k)) < 0.5 ? t : c + (t - c) * k);
    const nx = ease(cx, tx);
    const ny = ease(cy, ty);
    if (nx === 0 && ny === 0) {
      if (v?.enabled) cam.clearViewOffset();
      return;
    }
    if (v?.enabled && v.offsetX === nx && v.offsetY === ny && v.fullWidth === size.width && v.fullHeight === size.height) {
      return;
    }
    cam.setViewOffset(size.width, size.height, nx, ny, size.width, size.height);
  });
  return null;
}
