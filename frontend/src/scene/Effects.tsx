import { useMemo } from 'react';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { BlendFunction, Effect } from 'postprocessing';
import * as THREE from 'three';
import { cameraMotion, prefersReducedMotion } from '../store';

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
    for (int i = 1; i <= 4; i++) {
      float t = float(i) / 4.0;
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
    // Same deadzone as the star streaks (Starfield.tsx): below it the pass
    // early-outs and the frame is untouched, which is the normal state.
    this.uniforms.get('uStrength')!.value = Math.min(Math.max(speed - 0.06, 0) * 0.006, 0.01);
  }
}

export function Effects() {
  const smear = useMemo(() => new MotionSmearEffect(), []);
  return (
    <EffectComposer multisampling={0}>
      {/*
        Bloom is screen-space, so its halo grows with whatever fills the frame:
        a wide radius that flatters a distant beam turns a close one into a
        white smear, and a low threshold catches every star. Tight and
        selective — only genuinely hot cores bloom.
      */}
      <Bloom
        intensity={0.6}
        luminanceThreshold={0.28}
        luminanceSmoothing={0.3}
        mipmapBlur
        radius={0.45}
      />
      <primitive object={smear} />
      <Vignette eskil={false} offset={0.25} darkness={0.4} />
    </EffectComposer>
  );
}
