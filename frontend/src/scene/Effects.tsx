import { useMemo } from 'react';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { BlendFunction, Effect } from 'postprocessing';
import * as THREE from 'three';
import { cameraMotion, prefersReducedMotion, useTheme } from '../store';

const smearFragment = /* glsl */ `
  uniform vec2 uVelocity;
  uniform float uStrength;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    if (uStrength < 0.0005) {
      outputColor = inputColor;
      return;
    }
    vec2 step = uVelocity * uStrength;
    vec4 sum = inputColor;
    float total = 1.0;
    for (int i = 1; i <= 5; i++) {
      float t = float(i) / 5.0;
      float w = 1.0 - t * 0.75;
      sum += texture2D(inputBuffer, clamp(uv - step * t, vec2(0.001), vec2(0.999))) * w;
      total += w;
    }
    outputColor = sum / total;
  }
`;

/**
 * Directional full-frame smear driven by camera angular velocity — the
 * "slight motion blur" when flinging the globe. Idle → zero cost path.
 */
class MotionSmearEffect extends Effect {
  constructor() {
    super('MotionSmearEffect', smearFragment, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([
        ['uVelocity', new THREE.Uniform(new THREE.Vector2(0, 0))],
        ['uStrength', new THREE.Uniform(0)],
      ]),
    });
  }

  override update(): void {
    const velocity = this.uniforms.get('uVelocity')!.value as THREE.Vector2;
    const speed = prefersReducedMotion ? 0 : cameraMotion.speed;
    // normalize direction; magnitude comes through uStrength
    if (speed > 1e-4) velocity.set(cameraMotion.vx, cameraMotion.vy).normalize();
    this.uniforms.get('uStrength')!.value = Math.min(speed * 0.012, 0.02);
  }
}

export function Effects() {
  const smear = useMemo(() => new MotionSmearEffect(), []);
  const theme = useTheme();
  // a bright globe would bloom wholesale at a low threshold
  const light = theme.id === 'paper';

  return (
    <EffectComposer multisampling={0}>
      <Bloom
        intensity={light ? 0.18 : 0.85}
        luminanceThreshold={light ? 0.97 : 0.18}
        luminanceSmoothing={0.3}
        mipmapBlur
        radius={0.75}
      />
      <primitive object={smear} />
      <Vignette eskil={false} offset={0.25} darkness={0.4} />
    </EffectComposer>
  );
}
