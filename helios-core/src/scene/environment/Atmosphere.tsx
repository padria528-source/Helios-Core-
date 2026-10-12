import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { lerp } from '../../sim/modes'
import { sim } from '../../sim/runtime'
import { CORE_Y } from '../helios/constants'

/**
 * Two particle systems, both animated entirely in the vertex shader:
 * museum dust that drifts through the hall and lights up near the core,
 * and energy motes that orbit the reactor and answer to its output.
 */

const SPRITE = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  float r = length(gl_PointCoord - 0.5);
  float a = 1.0 - smoothstep(0.08, 0.5, r);
  gl_FragColor = vec4(vColor * vAlpha * a, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

const dustVertex = /* glsl */ `
attribute float aSeed;
attribute float aSize;
uniform float uTime;
uniform float uScale;
uniform float uEnergy;
uniform float uLevel;
uniform vec3 uCore;
varying float vAlpha;
varying vec3 vColor;
void main() {
  float s = aSeed * 6.2831853;
  vec3 p = position;
  p.x += sin(uTime * 0.05 + s) * 0.35 + sin(uTime * 0.021 + s * 2.3) * 0.2;
  p.z += cos(uTime * 0.043 + s * 1.7) * 0.35;
  p.y = mod(position.y + uTime * (0.012 + 0.02 * aSeed), 7.5) + 0.05;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float d = distance(p, uCore);
  // Dust is nearly invisible until the core lights it.
  float lit = 0.05 * uLevel + uEnergy * 1.25 / (1.0 + d * d * 0.5);
  float size = aSize * uScale / max(-mv.z, 0.1);
  float wrap = smoothstep(0.05, 0.7, p.y) * (1.0 - smoothstep(6.4, 7.5, p.y));
  // Past a few pixels a mote stops growing and thins out instead, so dust
  // drifting close to the lens never becomes a white disc.
  float near = clamp(5.0 / max(size, 5.0), 0.0, 1.0);
  vAlpha = lit * clamp(size, 0.0, 1.0) * wrap * near * near;
  vColor = mix(vec3(0.8, 0.74, 0.66), vec3(1.0, 0.72, 0.4), clamp(uEnergy * 2.0 / (1.0 + d * d), 0.0, 1.0));
  gl_PointSize = clamp(size, 1.0, 9.0);
  gl_Position = projectionMatrix * mv;
}
`

const moteVertex = /* glsl */ `
attribute vec4 aOrbit;
attribute float aSeed;
attribute float aSize;
uniform float uTime;
uniform float uPhase;
uniform float uScale;
uniform float uEnergy;
uniform float uActivity;
uniform vec3 uCore;
varying float vAlpha;
varying vec3 vColor;
void main() {
  float dir = aSeed > 0.5 ? 1.0 : -1.0;
  float ang = aOrbit.w + uPhase * (0.18 + 0.5 * aSeed) * dir;
  float radius = aOrbit.x * (1.0 + 0.07 * sin(uPhase * 0.6 + aSeed * 40.0));
  vec3 p = vec3(cos(ang), 0.0, sin(ang)) * radius;
  // Tilt the orbit, then swing its node around the axis.
  float ci = cos(aOrbit.y); float si = sin(aOrbit.y);
  p = vec3(p.x, p.y * ci - p.z * si, p.y * si + p.z * ci);
  float cn = cos(aOrbit.z); float sn = sin(aOrbit.z);
  p = vec3(p.x * cn + p.z * sn, p.y, -p.x * sn + p.z * cn) + uCore;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float twinkle = 0.6 + 0.4 * sin(uTime * (1.5 + 3.0 * aSeed) + aSeed * 90.0);
  float size = aSize * (0.8 + 0.35 * uActivity) * uScale / max(-mv.z, 0.1);
  // Fewer motes are awake at low activity: each has its own threshold.
  float awake = smoothstep(aSeed * 1.5 - 0.2, aSeed * 1.5 + 0.25, uActivity);
  float near = clamp(5.0 / max(size, 5.0), 0.0, 1.0);
  vAlpha = uEnergy * twinkle * awake * clamp(size, 0.0, 1.0) * near * near * 1.2;
  vColor = mix(vec3(1.0, 0.5, 0.14), vec3(1.0, 0.88, 0.62), aSeed);
  gl_PointSize = clamp(size, 1.0, 9.0);
  gl_Position = projectionMatrix * mv;
}
`

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function buildDust(count: number): THREE.BufferGeometry {
  const rand = mulberry32(7)
  const pos = new Float32Array(count * 3)
  const seed = new Float32Array(count)
  const size = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2
    const r = 0.8 + Math.sqrt(rand()) * 8.5
    pos[i * 3] = Math.cos(a) * r
    pos[i * 3 + 1] = rand() * 7.5
    pos[i * 3 + 2] = Math.sin(a) * r
    seed[i] = rand()
    size[i] = 0.014 + rand() * 0.026
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
  return g
}

function buildMotes(count: number): THREE.BufferGeometry {
  const rand = mulberry32(19)
  const pos = new Float32Array(count * 3)
  const orbit = new Float32Array(count * 4)
  const seed = new Float32Array(count)
  const size = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    orbit[i * 4] = 0.72 + Math.pow(rand(), 1.6) * 1.25
    orbit[i * 4 + 1] = (rand() - 0.5) * 2.2
    orbit[i * 4 + 2] = rand() * Math.PI * 2
    orbit[i * 4 + 3] = rand() * Math.PI * 2
    seed[i] = rand()
    size[i] = 0.016 + rand() * 0.022
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('aOrbit', new THREE.BufferAttribute(orbit, 4))
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
  return g
}

interface AtmosphereProps {
  dust: number
  motes: number
}

export function Atmosphere({ dust, motes }: AtmosphereProps) {
  const phase = useRef(0)

  const { dustGeometry, moteGeometry, dustMaterial, moteMaterial } = useMemo(() => {
    const uCore = { value: new THREE.Vector3(0, CORE_Y, 0) }
    const uScale = { value: 800 }
    const uTime = { value: 0 }
    const uEnergy = { value: 0 }
    const common = {
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fragmentShader: SPRITE,
    }
    return {
      dustGeometry: buildDust(dust),
      moteGeometry: buildMotes(motes),
      dustMaterial: new THREE.ShaderMaterial({
        ...common,
        uniforms: { uTime, uScale, uEnergy, uCore, uLevel: { value: 0 } },
        vertexShader: dustVertex,
      }),
      moteMaterial: new THREE.ShaderMaterial({
        ...common,
        uniforms: { uTime, uScale, uEnergy, uCore, uPhase: { value: 0 }, uActivity: { value: 0 } },
        vertexShader: moteVertex,
      }),
    }
  }, [dust, motes])

  useFrame((state, dt) => {
    const step = Math.min(dt, 0.05)
    // Motes integrate their own phase so a change of activity never makes them jump.
    phase.current += step * (0.35 + 0.65 * sim.particle) * lerp(0.04, 1, sim.motion)
    const camera = state.camera as THREE.PerspectiveCamera
    const u = dustMaterial.uniforms
    u.uTime.value = sim.clock
    u.uEnergy.value = sim.energy
    u.uLevel.value = sim.lights
    // World size -> pixels, so particles keep their size at any resolution.
    u.uScale.value = state.gl.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360))
    moteMaterial.uniforms.uPhase.value = phase.current
    moteMaterial.uniforms.uActivity.value = sim.particle
  })

  return (
    <group name="Atmosphere" userData={{ noShadow: true }}>
      <points name="MuseumDust" geometry={dustGeometry} material={dustMaterial} frustumCulled={false} />
      <points name="EnergyMotes" geometry={moteGeometry} material={moteMaterial} frustumCulled={false} />
    </group>
  )
}
