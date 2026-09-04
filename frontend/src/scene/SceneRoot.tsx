import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Earth } from './Earth';
import { Clouds } from './Clouds';
import { CountryBorders } from './CountryBorders';
import { Starfield } from './Starfield';
import { Sun } from './Sun';
import { SpaceBackground } from './SpaceBackground';
import { Beams } from './Beams';
import { Pins } from './Pins';
import { Ambience } from './Ambience';
import { CameraRig } from './CameraRig';
import { Effects } from './Effects';
import { narrowViewport, useGlobeStore, useTheme } from '../store';

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
  const markerStyle = useGlobeStore((s) => s.markerStyle);
  const theme = useTheme();

  return (
    <Canvas
      dpr={[1, 1.75]}
      // start well back so the whole planet reads as "Earth in space"
      camera={{ position: START_POSITION, fov: 45, near: 0.1, far: 120 }}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      onPointerMissed={() => select(null)}
      style={{ position: 'absolute', inset: 0, background: '#010204' }}
    >
      <color attach="background" args={['#010204']} />
      <SpaceBackground />
      <Starfield />
      <Sun />
      <Suspense fallback={null}>
        <Earth />
        {theme.clouds && <Clouds />}
      </Suspense>
      <CountryBorders />
      <Ambience />
      {markerStyle === 'pins' ? <Pins /> : <Beams />}
      <CameraRig />
      <Effects />
    </Canvas>
  );
}
