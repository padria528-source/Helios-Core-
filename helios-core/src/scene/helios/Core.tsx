import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { sim } from '../../sim/runtime'
import { CORE_Y, GLASS_R } from './constants'
import {
  filamentFragment,
  filamentVertex,
  glassFragment,
  haloFragment,
  haloVertex,
  hazeFragment,
  heartFragment,
  plasmaFragment,
  surfaceVertex,
} from './coreShaders'
import { matrixFrom, ringBand, turned } from './geometry'
import { amberLensMaterial, etchMaterial, metals } from './materials'
import { Instanced, lazy, unitSphere } from './parts'

const HEART_R = 0.2
const EMITTER_COUNT = 8

/** Small deterministic PRNG so the filaments are the same on every load. */
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

/** Loops that leave the heart, arch outward and fall back, like prominences. */
function buildFilaments(): THREE.BufferGeometry {
  const rand = mulberry32(20240911)
  const tubes: THREE.BufferGeometry[] = []
  const dir = new THREE.Vector3()
  const tan = new THREE.Vector3()
  const ref = new THREE.Vector3()
  for (let k = 0; k < 7; k++) {
    const u = rand() * 2 - 1
    const phi = rand() * Math.PI * 2
    const s = Math.sqrt(1 - u * u)
    dir.set(s * Math.cos(phi), u * 0.75, s * Math.sin(phi)).normalize()
    ref.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize()
    tan.crossVectors(dir, ref).normalize()
    const spread = 0.38 + rand() * 0.34
    const apex = 0.31 + rand() * 0.17
    const at = (angle: number, radius: number) =>
      new THREE.Vector3().copy(dir).multiplyScalar(Math.cos(angle) * radius).addScaledVector(tan, Math.sin(angle) * radius)
    const curve = new THREE.CatmullRomCurve3([
      at(-spread, HEART_R * 0.92),
      at(-spread * 0.62, apex * 0.84),
      at(0, apex),
      at(spread * 0.62, apex * 0.84),
      at(spread, HEART_R * 0.92),
    ])
    const tube = new THREE.TubeGeometry(curve, 40, 0.0045 + rand() * 0.003, 6, false)
    const seeds = new Float32Array(tube.attributes.position.count).fill(rand())
    tube.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    tubes.push(tube)
  }
  const merged = mergeGeometries(tubes, false)
  tubes.forEach((t) => t.dispose())
  if (!merged) throw new Error('filaments: merge failed')
  return merged
}

const geo = lazy(() => ({
  sphere: new THREE.SphereGeometry(1, 64, 48),
  heart: new THREE.SphereGeometry(HEART_R, 48, 36),
  halo: new THREE.PlaneGeometry(2, 2),
  filaments: buildFilaments(),
  band: ringBand(GLASS_R + 0.024, 0.04, 0.056, 96, 0.006),
  bandInlay: ringBand(GLASS_R + 0.0445, 0.003, 0.016, 96, 0.001),
  cap: turned(
    [
      [0.016, 0.598],
      [0.15, 0.598],
      [0.162, 0.612],
      [0.126, 0.65],
      [0.072, 0.664],
      [0.052, 0.7],
      [0.016, 0.7],
    ],
    40,
  ),
  bezel: turned(
    [
      [0, 0],
      [0.02, 0],
      [0.024, 0.006],
      [0.024, 0.014],
      [0.015, 0.02],
      [0, 0.02],
    ],
    16,
  ),
}))

const instances = lazy(() => {
  const bezels: THREE.Matrix4[] = []
  const lenses: THREE.Matrix4[] = []
  const r = GLASS_R + 0.044
  for (let k = 0; k < EMITTER_COUNT; k++) {
    const a = (k / EMITTER_COUNT) * Math.PI * 2
    const x = Math.cos(a)
    const z = -Math.sin(a)
    // Each emitter is a brass bezel facing outward with an amber lens set in it.
    bezels.push(matrixFrom([r * x, 0, r * z], [0, a, -Math.PI / 2]))
    lenses.push(matrixFrom([(r + 0.019) * x, 0, (r + 0.019) * z], [0, a, 0], [0.008, 0.0125, 0.0125]))
  }
  return { bezels, lenses }
})

interface CoreProps {
  /** Noise octaves; lower tiers trade plasma detail for fill-rate. */
  octaves: number
}

export function Core({ octaves }: CoreProps) {
  const g = geo()
  const inst = instances()
  const m = metals('core')
  const plasmaARef = useRef<THREE.Mesh>(null)
  const plasmaBRef = useRef<THREE.Mesh>(null)
  const heartRef = useRef<THREE.Mesh>(null)
  const filamentRef = useRef<THREE.Mesh>(null)

  const mats = useMemo(() => {
    // One clock and one energy value feed every layer.
    const uTime = { value: 0 }
    const uEnergy = { value: 0 }
    const uFade = { value: 1 }
    const uOpacity = { value: 1 }
    const defines = { OCTAVES: octaves }
    const additive = {
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }

    const heart = new THREE.ShaderMaterial({
      defines,
      uniforms: { uTime, uEnergy },
      vertexShader: surfaceVertex,
      fragmentShader: heartFragment,
    })

    const plasma = (scale: number, speed: number, gain: number, falloff: number, sharp: number) =>
      new THREE.ShaderMaterial({
        defines,
        uniforms: {
          uTime,
          uEnergy,
          uFade,
          uScale: { value: scale },
          uSpeed: { value: speed },
          uGain: { value: gain },
          uFalloff: { value: falloff },
          uSharp: { value: sharp },
        },
        vertexShader: surfaceVertex,
        fragmentShader: plasmaFragment,
        side: THREE.DoubleSide,
        ...additive,
      })

    const haze = new THREE.ShaderMaterial({
      defines,
      uniforms: { uTime, uEnergy, uFade, uGain: { value: 0.2 } },
      vertexShader: surfaceVertex,
      fragmentShader: hazeFragment,
      ...additive,
    })

    const glass = (side: THREE.Side, sign: number) =>
      new THREE.ShaderMaterial({
        uniforms: { uEnergy, uOpacity, uSide: { value: sign } },
        vertexShader: surfaceVertex,
        fragmentShader: glassFragment,
        side,
        transparent: true,
        depthWrite: false,
      })

    const halo = new THREE.ShaderMaterial({
      uniforms: { uEnergy, uGain: { value: 0.26 }, uSize: { value: 1.25 } },
      vertexShader: haloVertex,
      fragmentShader: haloFragment,
      ...additive,
    })

    const filaments = new THREE.ShaderMaterial({
      defines,
      uniforms: { uTime, uEnergy, uGain: { value: 1.5 } },
      vertexShader: filamentVertex,
      fragmentShader: filamentFragment,
      ...additive,
    })

    return {
      uTime,
      uEnergy,
      uFade,
      uOpacity,
      heart,
      plasmaA: plasma(2.3, 0.34, 1.15, 1.35, 2.4),
      plasmaB: plasma(1.5, 0.21, 0.6, 1.05, 3.4),
      haze,
      glassBack: glass(THREE.BackSide, -1),
      glassFront: glass(THREE.FrontSide, 1),
      halo,
      filaments,
    }
  }, [octaves])

  useFrame(() => {
    const t = sim.plasmaTime
    mats.uTime.value = t
    mats.uEnergy.value = sim.energy
    // X-Ray thins the outer plasma and the glass so the heart and spindle show.
    mats.uFade.value = 1 - 0.45 * sim.xray
    mats.uOpacity.value = 1 - 0.5 * sim.xray
    if (plasmaARef.current) plasmaARef.current.rotation.set(0.3, t * 0.07, 0.1)
    if (plasmaBRef.current) plasmaBRef.current.rotation.set(-0.2, -t * 0.045, 0.25)
    if (heartRef.current) heartRef.current.rotation.y = t * 0.03
    if (filamentRef.current) filamentRef.current.rotation.set(0.15, t * 0.055, 0)
  })

  const noShadow = { noShadow: true }

  return (
    <group name="CoreAssembly" position={[0, CORE_Y, 0]}>
      <mesh ref={heartRef} name="StellarHeart" geometry={g.heart} material={mats.heart} userData={noShadow} />

      <mesh name="ContainmentSphereInner" geometry={g.sphere} material={mats.glassBack} scale={GLASS_R} renderOrder={1} userData={noShadow} />
      <mesh name="CoreGlowShell" geometry={g.sphere} material={mats.haze} scale={GLASS_R * 0.965} renderOrder={2} userData={noShadow} />
      <mesh ref={plasmaBRef} name="PlasmaVolumeB" geometry={g.sphere} material={mats.plasmaB} scale={0.5} renderOrder={3} userData={noShadow} />
      <mesh ref={plasmaARef} name="PlasmaVolumeA" geometry={g.sphere} material={mats.plasmaA} scale={0.355} renderOrder={4} userData={noShadow} />
      <mesh ref={filamentRef} name="EnergyThreads" geometry={g.filaments} material={mats.filaments} renderOrder={5} userData={noShadow} />
      <mesh name="CoreHalo" geometry={g.halo} material={mats.halo} renderOrder={6} frustumCulled={false} userData={noShadow} />
      <mesh name="ContainmentSphere" geometry={g.sphere} material={mats.glassFront} scale={GLASS_R} renderOrder={7} userData={noShadow} />

      <group name="EquatorialContainmentRing">
        <mesh geometry={g.band} material={m.polished} />
        <mesh geometry={g.bandInlay} material={etchMaterial()} />
        <Instanced name="EmitterBezels" geometry={g.bezel} material={m.brass} matrices={inst.bezels} />
        <group userData={noShadow}>
          <Instanced name="CoreEmitterNodes" geometry={unitSphere()} material={amberLensMaterial()} matrices={inst.lenses} />
        </group>
      </group>

      <mesh name="PolarCapNorth" geometry={g.cap} material={m.polished} />
      <mesh name="PolarCapSouth" geometry={g.cap} material={m.polished} rotation={[Math.PI, 0, 0]} />
    </group>
  )
}
