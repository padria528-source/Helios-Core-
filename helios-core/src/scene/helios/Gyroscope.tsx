import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { RING_SPECS } from '../../sim/modes'
import { sim } from '../../sim/runtime'
import { CORE_Y, DEG } from './constants'
import { matrixFrom, ringBand, turned } from './geometry'
import { amberLensMaterial, bearingMetal, etchMaterial, metals, rubyMaterial } from './materials'
import { Instanced, lazy, unitBox, unitCylinder, unitSphere } from './parts'

const [S1, S2, S3, S4] = RING_SPECS

const geo = lazy(() => ({
  // Four bands, four cross-sections: the rings should not look like one part scaled.
  band1: ringBand(S1.radius, 0.046, 0.03, 144),
  band2: ringBand(S2.radius, 0.028, 0.062, 160),
  band2Groove: ringBand(S2.radius + 0.0145, 0.002, 0.024, 160, 0.0005),
  band3: ringBand(S3.radius, 0.05, 0.026, 176),
  rail3Inner: ringBand(S3.radius - 0.0225, 0.007, 0.036, 176, 0.002),
  rail3Outer: ringBand(S3.radius + 0.0225, 0.007, 0.036, 176, 0.002),
  band4: ringBand(S4.radius, 0.07, 0.034, 192).rotateX(Math.PI / 2),
  band4Groove: ringBand(S4.radius, 0.024, 0.0365, 192, 0.0005).rotateX(Math.PI / 2),
  hub: turned(
    [
      [0.016, -0.034],
      [0.04, -0.034],
      [0.046, -0.026],
      [0.046, -0.012],
      [0.036, -0.006],
      [0.036, 0.006],
      [0.046, 0.012],
      [0.046, 0.026],
      [0.04, 0.034],
      [0.016, 0.034],
    ],
    28,
  ),
  polarHub: turned(
    [
      [0.016, -0.055],
      [0.06, -0.055],
      [0.07, -0.043],
      [0.07, 0.043],
      [0.06, 0.055],
      [0.016, 0.055],
    ],
    32,
  ),
  polarCollar: ringBand(0.072, 0.008, 0.02, 32, 0.002),
  bezel: turned(
    [
      [0, 0],
      [0.026, 0],
      [0.03, 0.006],
      [0.03, 0.016],
      [0.02, 0.024],
      [0, 0.024],
    ],
    20,
  ),
  weight: turned(
    [
      [0, -0.036],
      [0.03, -0.036],
      [0.036, -0.03],
      [0.036, -0.012],
      [0.03, -0.008],
      [0.03, 0.008],
      [0.036, 0.012],
      [0.036, 0.03],
      [0.03, 0.036],
      [0, 0.036],
    ],
    20,
  ),
}))

/** Scale marks on the top face of a ring lying in XZ. */
function topTicks(radius: number, y: number, count: number, major: number, long: number, short: number): THREE.Matrix4[] {
  const out: THREE.Matrix4[] = []
  for (let k = 0; k < count; k++) {
    const a = (k / count) * Math.PI * 2
    const len = k % major === 0 ? long : short
    out.push(matrixFrom([radius * Math.cos(a), y, -radius * Math.sin(a)], [0, a, 0], [len, 0.002, k % major === 0 ? 0.005 : 0.003]))
  }
  return out
}

const instances = lazy(() => {
  const ticks1 = topTicks(S1.radius, 0.0155, 72, 6, 0.032, 0.018)

  // Hoop ring: vertical marks on the outer face, over the dark groove.
  const ticks2: THREE.Matrix4[] = []
  for (let k = 0; k < 96; k++) {
    const a = (k / 96) * Math.PI * 2
    const r = S2.radius + 0.0158
    ticks2.push(matrixFrom([r * Math.cos(a), 0, -r * Math.sin(a)], [0, a, 0], [0.002, k % 8 === 0 ? 0.022 : 0.012, 0.003]))
  }

  const ticks3 = topTicks(S3.radius, 0.0135, 120, 10, 0.03, 0.016)

  // Meridian ring stands in the XY plane; it is graduated on both faces.
  const ticks4: THREE.Matrix4[] = []
  for (const side of [-1, 1]) {
    for (let k = 0; k < 144; k++) {
      const a = (k / 144) * Math.PI * 2
      const len = k % 12 === 0 ? 0.022 : k % 4 === 0 ? 0.015 : 0.009
      const r = S4.radius + 0.011 - len / 2
      ticks4.push(matrixFrom([r * Math.cos(a), r * Math.sin(a), side * 0.0185], [0, 0, a], [len, k % 12 === 0 ? 0.005 : 0.003, 0.002]))
    }
  }

  const bolts4: THREE.Matrix4[] = []
  for (const side of [-1, 1]) {
    for (let k = 0; k < 24; k++) {
      const a = ((k + 0.5) / 24) * Math.PI * 2
      const r = S4.radius - 0.024
      bolts4.push(matrixFrom([r * Math.cos(a), r * Math.sin(a), side * 0.018], [Math.PI / 2, 0, 0], [0.0055, 0.005, 0.0055]))
    }
  }

  return { ticks1, ticks2, ticks3, ticks4, bolts4 }
})

/** Thin double-tine arcs that carry a tilted ring from its hubs on the axis. */
function CarrierArcs({ radius, tilt, material }: { radius: number; tilt: number; material: THREE.Material }) {
  const arc = Math.PI / 2 - Math.abs(tilt)
  const starts = tilt >= 0 ? [tilt, Math.PI + tilt] : [-Math.PI / 2, Math.PI / 2]
  return (
    <>
      {starts.map((start) =>
        [-0.02, 0.02].map((z) => (
          <mesh key={`${start}:${z}`} position={[0, 0, z]} rotation={[0, 0, start]} material={material}>
            <torusGeometry args={[radius, 0.0085, 6, 28, arc]} />
          </mesh>
        )),
      )}
    </>
  )
}

/** Jewel in a bezel, standing on the outside of a ring at a given angle. */
function OrbitalNode({ name, radius, angle, material }: { name: string; radius: number; angle: number; material: THREE.Material }) {
  const brass = metals('rings').polished
  return (
    <group name={name} position={[radius * Math.cos(angle), 0, -radius * Math.sin(angle)]} rotation={[0, angle, -Math.PI / 2]}>
      <mesh geometry={geo().bezel} material={brass} />
      <mesh geometry={unitSphere()} material={material} position={[0, 0.022, 0]} scale={[0.017, 0.011, 0.017]} userData={{ noShadow: true }} />
    </group>
  )
}

function Counterweight({ radius, angle }: { radius: number; angle: number }) {
  const m = metals('rings')
  return (
    <mesh
      name="Counterweight"
      geometry={geo().weight}
      material={m.brass}
      position={[radius * Math.cos(angle), 0, -radius * Math.sin(angle)]}
      // Lays the barrel along the ring's tangent at this angle.
      rotation={[-Math.PI / 2, 0, angle]}
    />
  )
}

/** Clevis that joins a tilted ring to its carrier arcs. */
function Clevis({ radius }: { radius: number }) {
  const bearing = bearingMetal('rings')
  const brass = metals('rings').polished
  return (
    <>
      {[1, -1].map((side) => (
        <group key={side} position={[side * radius, 0, 0]}>
          <mesh geometry={unitBox()} material={bearing} scale={[0.052, 0.058, 0.066]} />
          <mesh geometry={unitCylinder()} material={brass} rotation={[Math.PI / 2, 0, 0]} scale={[0.011, 0.084, 0.011]} />
        </group>
      ))}
    </>
  )
}

function PolarHubs({ radius }: { radius: number }) {
  const bearing = bearingMetal('rings')
  return (
    <>
      <mesh geometry={geo().hub} material={bearing} position={[0, radius, 0]} />
      <mesh geometry={geo().hub} material={bearing} position={[0, -radius, 0]} />
    </>
  )
}

/**
 * Four nested rings on a common polar axis. Because every ring owns a
 * different radius, each lives on its own spherical shell and they can never
 * touch, whatever their tilt or phase.
 */
export function Gyroscope() {
  const g = geo()
  const inst = instances()
  const m = metals('rings')
  const bearing = bearingMetal('rings')
  const ring1 = useRef<THREE.Group>(null)
  const ring2 = useRef<THREE.Group>(null)
  const ring3 = useRef<THREE.Group>(null)
  const ring4 = useRef<THREE.Group>(null)

  useFrame(() => {
    const p = sim.ringPhase
    if (ring1.current) ring1.current.rotation.y = p[0]
    if (ring2.current) ring2.current.rotation.y = p[1]
    // Ring 3 nutates on its trunnions instead of circling.
    if (ring3.current) ring3.current.rotation.x = S3.tilt + S3.amplitude * Math.sin(p[2])
    if (ring4.current) ring4.current.rotation.y = p[3]
  })

  return (
    <group name="GyroscopeAssembly" position={[0, CORE_Y, 0]}>
      <group ref={ring1} name="Ring01">
        <PolarHubs radius={S1.radius} />
        <CarrierArcs radius={S1.radius} tilt={S1.tilt} material={m.polished} />
        <group rotation={[0, 0, S1.tilt]}>
          <mesh geometry={g.band1} material={m.polished} />
          <Instanced name="Ring01Marks" geometry={unitBox()} material={etchMaterial()} matrices={inst.ticks1} />
          <Clevis radius={S1.radius} />
          <OrbitalNode name="OrbitalNodeA" radius={S1.radius + 0.023} angle={90 * DEG} material={amberLensMaterial()} />
          <Counterweight radius={S1.radius} angle={-90 * DEG} />
        </group>
      </group>

      <group ref={ring2} name="Ring02">
        <PolarHubs radius={S2.radius} />
        <CarrierArcs radius={S2.radius} tilt={S2.tilt} material={m.brass} />
        <group rotation={[0, 0, S2.tilt]}>
          <mesh geometry={g.band2} material={m.brass} />
          <mesh geometry={g.band2Groove} material={etchMaterial()} />
          <Instanced name="Ring02Marks" geometry={unitBox()} material={m.polished} matrices={inst.ticks2} />
          <Clevis radius={S2.radius} />
          <OrbitalNode name="OrbitalNodeB" radius={S2.radius + 0.014} angle={60 * DEG} material={rubyMaterial()} />
          <Counterweight radius={S2.radius} angle={-70 * DEG} />
          <Counterweight radius={S2.radius} angle={-110 * DEG} />
        </group>
      </group>

      <group ref={ring4} name="Ring04">
        <mesh geometry={g.band4} material={m.brass} />
        <mesh geometry={g.band4Groove} material={etchMaterial()} />
        <Instanced name="Ring04Marks" geometry={unitBox()} material={m.polished} matrices={inst.ticks4} />
        <Instanced name="Ring04Bolts" geometry={unitCylinder()} material={m.steel} matrices={inst.bolts4} />
        {[1, -1].map((side) => (
          <group key={side} name="RingBearing" position={[0, side * S4.radius, 0]}>
            <mesh geometry={g.polarHub} material={bearing} />
            <mesh geometry={g.polarCollar} material={m.polished} position={[0, 0.038, 0]} />
            <mesh geometry={g.polarCollar} material={m.polished} position={[0, -0.038, 0]} />
          </group>
        ))}
        {[1, -1].map((side) => (
          <group key={side} name="TrunnionBearing" position={[side * S4.radius, 0, 0]}>
            <mesh geometry={unitBox()} material={bearing} scale={[0.092, 0.07, 0.07]} />
            <mesh geometry={unitCylinder()} material={m.polished} position={[side * 0.05, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.024, 0.012, 0.024]} />
            {/* Trunnion pin reaching in to ring 3. */}
            <mesh geometry={unitCylinder()} material={m.steel} position={[-side * 0.085, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.013, 0.13, 0.013]} />
          </group>
        ))}

        <group ref={ring3} name="Ring03">
          <mesh geometry={g.band3} material={m.steel} />
          <mesh geometry={g.rail3Inner} material={m.polished} />
          <mesh geometry={g.rail3Outer} material={m.polished} />
          <Instanced name="Ring03Marks" geometry={unitBox()} material={m.polished} matrices={inst.ticks3} />
          {[1, -1].map((side) => (
            <mesh key={side} geometry={unitBox()} material={bearing} position={[side * (S3.radius + 0.012), 0, 0]} scale={[0.06, 0.05, 0.056]} />
          ))}
          <OrbitalNode name="OrbitalNodeC" radius={S3.radius + 0.026} angle={90 * DEG} material={rubyMaterial()} />
          <Counterweight radius={S3.radius} angle={-90 * DEG} />
        </group>
      </group>
    </group>
  )
}
