import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { sim } from '../../sim/runtime'
import { DECK_Y, HINGE_R, HINGE_Y, NORTH_Y, SOUTH_Y } from './constants'
import { coil, gear, matrixFrom, pipe, ringBand, turned } from './geometry'
import { bearingMetal, metals, shellMetal } from './materials'
import { ANCHOR_ANGLES } from './Pedestal'
import { Instanced, hexBolt, lazy, unitCylinder } from './parts'

/** Height where the fixed housing ends and the exposed shaft begins. */
export const HOUSING_TOP = 0.935
const SPIDER_Y = SOUTH_Y - 0.19
const CROWN_Y = NORTH_Y + 0.07
export const GOVERNOR_BASE_Y = CROWN_Y + 0.22
export const FINIAL_Y = 4.97

const geo = lazy(() => ({
  housing: turned(
    [
      [0.3, DECK_Y],
      [0.46, DECK_Y],
      [0.47, DECK_Y + 0.01],
      [0.47, DECK_Y + 0.03],
      [0.455, DECK_Y + 0.045],
      [0.37, DECK_Y + 0.045],
      [0.36, DECK_Y + 0.055],
      [0.36, 0.66],
      [0.34, 0.68],
      [0.27, 0.68],
      [0.26, 0.69],
      [0.26, 0.86],
      [0.24, 0.88],
      [0.17, 0.88],
      [0.16, 0.89],
      [0.16, 0.925],
      [0.15, HOUSING_TOP],
      [0.06, HOUSING_TOP],
    ],
    72,
  ),
  housingBandLow: ringBand(0.363, 0.012, 0.022, 72, 0.003),
  housingBandHigh: ringBand(0.263, 0.012, 0.018, 72, 0.003),
  innerTube: turned(
    [
      [0, DECK_Y - 0.1],
      [0.075, DECK_Y - 0.1],
      [0.075, 0.9],
      [0, 0.9],
    ],
    32,
  ),
  innerGear: gear({ teeth: 24, module: 0.016, thickness: 0.03, bore: 0.075, spokes: 4, hubRadius: 0.1, rimWidth: 0.03 }),
  driveCollar: gear({ teeth: 18, module: 0.011, thickness: 0.05, bore: 0.045 }),
  coil: coil(7, 0.082, 0.17, 0.011),
  flange: turned(
    [
      [0.045, 0],
      [0.112, 0],
      [0.118, 0.005],
      [0.118, 0.011],
      [0.112, 0.016],
      [0.045, 0.016],
    ],
    40,
  ),
  southBearing: turned(
    [
      [0.045, 0],
      [0.118, 0],
      [0.135, 0.016],
      [0.135, 0.085],
      [0.108, 0.118],
      [0.016, 0.118],
    ],
    48,
  ),
  spider: pipe(
    [
      [HINGE_R - 0.02, HINGE_Y - 0.065, 0],
      [0.76, SPIDER_Y + 0.14, 0],
      [0.42, SPIDER_Y + 0.055, 0],
      [0.12, SPIDER_Y + 0.05, 0],
    ],
    0.021,
    40,
    10,
  ),
  crown: turned(
    [
      [0.016, 0],
      [0.1, 0],
      [0.118, 0.016],
      [0.118, 0.058],
      [0.078, 0.1],
      [0.078, 0.16],
      [0.098, 0.18],
      [0.098, 0.2],
      [0.03, 0.2],
    ],
    48,
  ),
  ray: new THREE.ConeGeometry(1, 1, 8),
  finial: turned(
    [
      [0, 0],
      [0.06, 0],
      [0.072, 0.014],
      [0.072, 0.03],
      [0.04, 0.06],
      [0.028, 0.11],
      [0.028, 0.13],
      [0.045, 0.14],
      [0.062, 0.165],
      [0.066, 0.19],
      [0.058, 0.218],
      [0.038, 0.24],
      [0.016, 0.262],
      [0.008, 0.33],
      [0, 0.36],
    ],
    40,
    40,
  ),
}))

const instances = lazy(() => {
  const housingBolts: THREE.Matrix4[] = []
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2
    housingBolts.push(matrixFrom([0.415 * Math.cos(a), DECK_Y + 0.052, -0.415 * Math.sin(a)], [0, a, 0], [0.014, 0.014, 0.014]))
  }
  // A low coronet of rays around the crown collar.
  const crownRays: THREE.Matrix4[] = []
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2
    const long = k % 2 === 0
    const tilt = long ? 0.95 : 1.1
    const len = long ? 0.13 : 0.08
    const r = 0.118 + Math.sin(tilt) * len * 0.5
    crownRays.push(
      matrixFrom([r * Math.cos(a), CROWN_Y + 0.045 + Math.cos(tilt) * len * 0.5, -r * Math.sin(a)], [0, a, -tilt], [0.012, len, 0.012]),
    )
  }
  const finialRays: THREE.Matrix4[] = []
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2
    const len = k % 2 === 0 ? 0.07 : 0.045
    const r = 0.066 + len * 0.5
    finialRays.push(matrixFrom([r * Math.cos(a), FINIAL_Y + 0.19, -r * Math.sin(a)], [0, a, -Math.PI / 2], [0.008, len, 0.004]))
  }
  return { housingBolts, crownRays, finialRays }
})

/**
 * The spine of the machine: drive housing, coil-wound lower shaft, the spindle
 * through the core, crown and finial. The gyro rings and the governor hang off it.
 */
export function CentralAxis() {
  const g = geo()
  const inst = instances()
  const anchor = metals('anchor')
  const reg = metals('regulator')
  const bearing = bearingMetal('anchor')
  const housingShell = shellMetal('regulator', 'steel', 0.16)
  const collarRef = useRef<THREE.Mesh>(null)
  const gearARef = useRef<THREE.Mesh>(null)
  const gearBRef = useRef<THREE.Mesh>(null)

  useFrame(() => {
    if (collarRef.current) collarRef.current.rotation.y = sim.drive
    if (gearARef.current) gearARef.current.rotation.y = sim.drive * 2
    if (gearBRef.current) gearBRef.current.rotation.y = -sim.drive * 2
  })

  return (
    <group name="CentralAxisAssembly">
      <group name="LowerDriveHousing">
        <mesh geometry={g.housing} material={housingShell} />
        <mesh geometry={g.housingBandLow} material={reg.polished} position={[0, 0.632, 0]} />
        <mesh geometry={g.housingBandHigh} material={reg.polished} position={[0, 0.84, 0]} />
        <Instanced name="HousingBolts" geometry={hexBolt()} material={reg.brass} matrices={inst.housingBolts} />
        {/* Hidden until X-Ray: the reduction stack inside the housing. */}
        <mesh geometry={g.innerTube} material={reg.brass} />
        <mesh ref={gearARef} geometry={g.innerGear} material={reg.polished} position={[0, 0.6, 0]} />
        <mesh ref={gearBRef} geometry={g.innerGear} material={reg.copper} position={[0, 0.78, 0]} />
      </group>

      <group name="LowerAxis">
        <mesh geometry={unitCylinder()} material={anchor.steel} position={[0, (HOUSING_TOP + SPIDER_Y) / 2, 0]} scale={[0.042, SPIDER_Y - HOUSING_TOP, 0.042]} />
        <mesh ref={collarRef} name="DriveCollar" geometry={g.driveCollar} material={reg.polished} position={[0, 1.045, 0]} />
        <mesh geometry={g.flange} material={reg.brass} position={[0, 1.078, 0]} />
        <mesh name="InductionCoil" geometry={g.coil} material={reg.copper} position={[0, 1.1, 0]} />
        <mesh geometry={g.flange} material={reg.brass} position={[0, 1.276, 0]} />
      </group>

      <group name="AxisBearings">
        <mesh name="SouthBearing" geometry={g.southBearing} material={bearing} position={[0, SPIDER_Y, 0]} />
        {[0, 2, 4].map((k) => (
          <mesh key={k} name="SpiderArm" geometry={g.spider} material={anchor.steel} rotation={[0, ANCHOR_ANGLES[k], 0]} />
        ))}
      </group>

      {/* Spindle that the containment sphere and every ring hub ride on. */}
      <mesh name="CoreAxis" geometry={unitCylinder()} material={anchor.steel} position={[0, (SPIDER_Y + CROWN_Y) / 2 + 0.06, 0]} scale={[0.016, CROWN_Y - SPIDER_Y - 0.1, 0.016]} />

      <group name="CrownAssembly">
        <mesh geometry={g.crown} material={anchor.polished} position={[0, CROWN_Y, 0]} />
        <Instanced name="CrownRays" geometry={g.ray} material={anchor.polished} matrices={inst.crownRays} />
      </group>

      <group name="UpperAxis">
        <mesh geometry={unitCylinder()} material={anchor.steel} position={[0, (CROWN_Y + 0.2 + FINIAL_Y) / 2, 0]} scale={[0.026, FINIAL_Y - CROWN_Y - 0.2, 0.026]} />
        <mesh name="Finial" geometry={g.finial} material={anchor.polished} position={[0, FINIAL_Y, 0]} />
        <Instanced name="FinialRays" geometry={g.ray} material={anchor.polished} matrices={inst.finialRays} />
      </group>
    </group>
  )
}
