import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { governorArmAngle } from '../../sim/kinematics'
import { sim } from '../../sim/runtime'
import { GOVERNOR_BASE_Y } from './CentralAxis'
import { spanRod, turned } from './geometry'
import { metals, rubyMaterial } from './materials'
import { lazy, unitCylinder, unitSphere } from './parts'

const HEAD_Y = GOVERNOR_BASE_Y + 0.43
const PIVOT_X = 0.055
const ARM_LENGTH = 0.33
const LINK_AT = 0.55
const LINK_LENGTH = 0.2
const SLEEVE_X = 0.05

const geo = lazy(() => ({
  head: turned(
    [
      [0.026, -0.03],
      [0.06, -0.03],
      [0.07, -0.018],
      [0.07, 0.018],
      [0.06, 0.03],
      [0.026, 0.03],
    ],
    32,
  ),
  sleeve: turned(
    [
      [0.026, -0.034],
      [0.066, -0.034],
      [0.066, -0.02],
      [0.046, -0.012],
      [0.046, 0.012],
      [0.066, 0.02],
      [0.066, 0.034],
      [0.026, 0.034],
    ],
    32,
  ),
  orbBand: turned(
    [
      [0.058, -0.012],
      [0.066, -0.012],
      [0.066, 0.012],
      [0.058, 0.012],
    ],
    28,
  ),
}))

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()

/**
 * Flyball governor on the upper axis. It spins with the ring train and its
 * orbs climb with speed, so ring velocity can be read from across the room.
 */
export function Stabilizer() {
  const g = geo()
  const m = metals('regulator')
  const spinRef = useRef<THREE.Group>(null)
  const sleeveRef = useRef<THREE.Group>(null)
  const armRefs = useRef<(THREE.Group | null)[]>([null, null])
  const linkRefs = useRef<(THREE.Mesh | null)[]>([null, null])

  useFrame(() => {
    if (spinRef.current) spinRef.current.rotation.y = sim.governor
    const alpha = governorArmAngle(sim.governorLift)
    const qx = PIVOT_X + ARM_LENGTH * LINK_AT * Math.sin(alpha)
    const qy = HEAD_Y - ARM_LENGTH * LINK_AT * Math.cos(alpha)
    const dx = qx - SLEEVE_X
    const sleeveY = qy - Math.sqrt(Math.max(LINK_LENGTH * LINK_LENGTH - dx * dx, 0))
    if (sleeveRef.current) sleeveRef.current.position.y = sleeveY

    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1
      const arm = armRefs.current[i]
      if (arm) arm.rotation.z = side * alpha
      const link = linkRefs.current[i]
      if (link) spanRod(link, _a.set(side * qx, qy, 0), _b.set(side * SLEEVE_X, sleeveY, 0))
    }
  })

  return (
    <group name="StabilizerAssembly">
      <group ref={spinRef}>
        <mesh name="GovernorHead" geometry={g.head} material={m.polished} position={[0, HEAD_Y, 0]} />
        {[1, -1].map((side, i) => (
          <group
            key={side}
            ref={(node) => {
              armRefs.current[i] = node
            }}
            name={i === 0 ? 'HorizontalArmA' : 'HorizontalArmB'}
            position={[side * PIVOT_X, HEAD_Y, 0]}
          >
            <mesh geometry={unitCylinder()} material={m.steel} position={[0, -ARM_LENGTH / 2, 0]} scale={[0.009, ARM_LENGTH, 0.009]} />
            <group name={i === 0 ? 'BalanceOrbA' : 'BalanceOrbB'} position={[0, -ARM_LENGTH, 0]}>
              <mesh geometry={unitSphere()} material={m.polished} scale={0.062} />
              <mesh geometry={g.orbBand} material={m.steel} />
            </group>
          </group>
        ))}
        {[0, 1].map((i) => (
          <mesh
            key={i}
            ref={(node) => {
              linkRefs.current[i] = node
            }}
            geometry={unitCylinder()}
            material={m.brass}
            scale={[0.006, 1, 0.006]}
          />
        ))}
        <group ref={sleeveRef} name="GovernorSleeve">
          <mesh geometry={g.sleeve} material={m.brass} />
          {/* Calibration nodes: two jewels that make the sleeve's spin legible. */}
          <mesh name="CalibrationNodeA" geometry={unitSphere()} material={rubyMaterial()} position={[0, 0, 0.066]} scale={[0.011, 0.011, 0.007]} />
          <mesh name="CalibrationNodeB" geometry={unitSphere()} material={rubyMaterial()} position={[0, 0, -0.066]} scale={[0.011, 0.011, 0.007]} />
        </group>
      </group>
    </group>
  )
}
