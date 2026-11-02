import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Earth } from './Earth';
import { Starfield } from './Starfield';
import { Sun } from './Sun';
import { SpaceBackground } from './SpaceBackground';
import { Ambience } from './Ambience';
import { Halo } from './Halo';
import { CameraRig } from './CameraRig';
import { Effects } from './Effects';
import { RenderStats } from './RenderStats';
import { ViewFraming } from './ViewFraming';
import * as THREE from 'three';
import { framedDistance } from '../lib/framing';
import { snapHeights } from '../lib/sheet';
import { narrowViewport, useGlobeStore, useSpaceView, useTheme } from '../store';

/** The top bar's height before it is measured (styles.css .m-topbar). */
const PHONE_TOP_GUESS_PX = 56;
const FOV = 45;
const DESKTOP_START: [number, number, number] = [1.15, 0.95, 4.3];

/**
 * Opening framing. On a phone the globe is fitted to the band the top bar
 * and the peeking sheet leave free, from a first guess at their sizes, so the
 * planet starts at (almost) the size CameraRig settles it at once the chrome
 * is measured, instead of jumping. Same direction as on desktop.
 */
function startPosition(): [number, number, number] {
  if (!narrowViewport) return DESKTOP_START;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const top = PHONE_TOP_GUESS_PX;
  const band = h - top - snapHeights(h, top).peek;
  const distance = framedDistance({ bandPx: band, widthPx: w, heightPx: h, fovDeg: FOV });
  const dir = new THREE.Vector3(...DESKTOP_START).normalize().multiplyScalar(distance);
  return [dir.x, dir.y, dir.z];
}
const START_POSITION = startPosition();

export function SceneRoot() {
  const select = useGlobeStore((s) => s.select);
  const theme = useTheme();
  // Off by default: the globe sits on the flat page background with a soft
  // halo, as in the mockups. The space view is the viewer's opt-in.
  const space = useSpaceView();
  const background = space ? theme.space : theme.bg;

  return (
    <Canvas
      dpr={[1, 1.75]}
      // start well back so the whole planet reads as "Earth in space"
      camera={{ position: START_POSITION, fov: FOV, near: 0.1, far: 120 }}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      onPointerMissed={() => select(null)}
      style={{ position: 'absolute', inset: 0, background }}
    >
      <color attach="background" args={[background]} />
      {space ? (
        <>
          <SpaceBackground />
          {theme.starBrightness > 0 && <Starfield />}
          <Sun />
        </>
      ) : (
        <Halo />
      )}
      <Suspense fallback={null}>
        <Earth />
      </Suspense>
      {space && theme.starBrightness > 0 && <Ambience />}
      <CameraRig />
      <ViewFraming />
      <Effects space={space} />
      {import.meta.env.DEV && <RenderStats />}
    </Canvas>
  );
}
