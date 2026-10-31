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
import { narrowViewport, useGlobeStore, useSpaceView, useTheme } from '../store';

/**
 * Opening framing. The phone value is the same direction 30% further out: on
 * a narrow screen the planet at the desktop distance fills the view edge to
 * edge, leaving no space for it to be a planet in.
 */
const START_POSITION: [number, number, number] = narrowViewport
  ? [1.495, 1.235, 5.59]
  : [1.15, 0.95, 4.3];

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
      camera={{ position: START_POSITION, fov: 45, near: 0.1, far: 120 }}
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
