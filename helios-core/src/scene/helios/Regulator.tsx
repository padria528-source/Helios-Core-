import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { OUTPUT_RANGE, clamp } from '../../sim/modes'
import { fourBarJoint, meshedAngle, pitchRadius, sliderCrank, type Point2 } from '../../sim/kinematics'
import { sim } from '../../sim/runtime'
import { DECK_Y, DEG } from './constants'
import { deckDir, gear, mergeParts, pipe, placed, ringBand, spanRod, spiral, turned } from './geometry'
import { etchMaterial, metals, rubyMaterial, smokedGlassMaterial } from './materials'
import { lazy, unitBox, unitCylinder, unitSphere } from './parts'

/**
 * The regulator train, laid out on the deck like a watch movement.
 *
 *   core feed -> piston -> flywheel -> gear cluster A -> main wheel -> shaft
 *                                      main wheel -> gear cluster B -> escapement + balance
 *
 * Every rotating part derives its angle from `sim.drive` through real tooth
 * ratios, so the gears stay in mesh at any speed.
 */

const MODULE = 0.02
const MAIN_TEETH = 48
const PINION_TEETH = 12
const A_WHEEL_TEETH = 30
const A2_PINION_TEETH = 10
const ESCAPE_TEETH = 20

const MAIN_Y = 0.98
const LOWER_Y = 0.74
const ESCAPE_Y = 0.7
const FLYWHEEL_Y = 0.88
const ROD_Y = 0.945
const BEAM_Y = 1.055

const PHI_A1 = -115 * DEG
const PHI_A2 = -150 * DEG
const PHI_B1 = -10 * DEG

const centreDistance = pitchRadius(MAIN_TEETH, MODULE) + pitchRadius(PINION_TEETH, MODULE)
const A1 = deckDir(PHI_A1, centreDistance)
const a2Offset = deckDir(PHI_A2, pitchRadius(A_WHEEL_TEETH, MODULE) + pitchRadius(A2_PINION_TEETH, MODULE))
const A2: [number, number] = [A1[0] + a2Offset[0], A1[1] + a2Offset[1]]
const B1 = deckDir(PHI_B1, centreDistance)
const BALANCE = deckDir(-35 * DEG, 0.98)
const BALANCE_POST = deckDir(-35 * DEG, 1.29)
const ROCKER_PIVOT = deckDir(25 * DEG, 0.95)

// Piston engine: the slide axis runs from the flywheel toward the front of the deck.
const ENGINE_TARGET = deckDir(-84 * DEG, 0.95)
const slideLength = Math.hypot(ENGINE_TARGET[0] - A2[0], ENGINE_TARGET[1] - A2[1])
const SLIDE: [number, number] = [(ENGINE_TARGET[0] - A2[0]) / slideLength, (ENGINE_TARGET[1] - A2[1]) / slideLength]
const SLIDE_ANGLE = Math.atan2(-SLIDE[1], SLIDE[0])
const CRANK_R = 0.17
const ROD_LENGTH = 0.42
const CYLINDER_NEAR = 0.64
const CYLINDER_FAR = 0.86

const ROCKER_CRANK = 0.05
const ROCKER_ROD = 0.5
const ROCKER_ARM = 0.2

const GAUGE_ANGLE = -62 * DEG
const NEEDLE_SWEEP = 115 * DEG

const along = (d: number): [number, number] => [A2[0] + SLIDE[0] * d, A2[1] + SLIDE[1] * d]

const geo = lazy(() => {
  const spokes = Array.from({ length: 5 }, (_, k) =>
    placed(new THREE.BoxGeometry(0.24, 0.026, 0.024), [0.165, 0, 0]).rotateY((k / 5) * Math.PI * 2 + 0.3),
  )
  const flywheel = mergeParts([
    ringBand(0.3, 0.06, 0.06, 72, 0.008),
    turned(
      [
        [0.016, -0.035],
        [0.055, -0.035],
        [0.062, -0.028],
        [0.062, 0.028],
        [0.055, 0.035],
        [0.016, 0.035],
      ],
      28,
    ),
    ...spokes,
    // Crank pin on local angle 0.
    placed(new THREE.CylinderGeometry(0.017, 0.017, 0.062, 16), [CRANK_R, 0.045, 0]),
    placed(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 16), [CRANK_R, 0.02, 0]),
  ])

  const screws = Array.from({ length: 12 }, (_, k) => {
    const a = (k / 12) * Math.PI * 2
    return placed(new THREE.CylinderGeometry(0.008, 0.008, 0.016, 8), [0.258 * Math.cos(a), 0, -0.258 * Math.sin(a)], [0, a, Math.PI / 2])
  })
  const balance = mergeParts([
    ringBand(0.235, 0.03, 0.03, 64, 0.005),
    placed(new THREE.BoxGeometry(0.44, 0.012, 0.022), [0, 0, 0]),
    placed(new THREE.BoxGeometry(0.022, 0.012, 0.22), [0, 0, -0.11]),
    new THREE.CylinderGeometry(0.03, 0.03, 0.03, 20),
    ...screws,
  ])

  const gaugeTicks = Array.from({ length: 11 }, (_, k) => {
    const a = -NEEDLE_SWEEP + (k / 10) * NEEDLE_SWEEP * 2
    const len = k % 5 === 0 ? 0.026 : 0.014
    const r = 0.084 - len / 2
    return placed(new THREE.BoxGeometry(0.004, 0.002, len), [r * Math.sin(a), 0.0075, -r * Math.cos(a)], [0, -a, 0])
  })

  return {
    main: gear({ teeth: MAIN_TEETH, module: MODULE, thickness: 0.035, bore: 0.042, spokes: 6, hubRadius: 0.13, rimWidth: 0.05, spokeWidth: 0.04 }),
    pinion: gear({ teeth: PINION_TEETH, module: MODULE, thickness: 0.046, bore: 0.015 }),
    aWheel: gear({ teeth: A_WHEEL_TEETH, module: MODULE, thickness: 0.03, bore: 0.015, spokes: 5, hubRadius: 0.07, rimWidth: 0.036, spokeWidth: 0.03 }),
    a2Pinion: gear({ teeth: A2_PINION_TEETH, module: MODULE, thickness: 0.04, bore: 0.015 }),
    escape: gear({ teeth: ESCAPE_TEETH, module: MODULE, thickness: 0.024, bore: 0.015, spokes: 4, hubRadius: 0.05, rimWidth: 0.03, spokeWidth: 0.024 }),
    flywheel,
    balance,
    hairspring: spiral(5, 0.03, 0.13, 0.0032),
    boss: turned(
      [
        [0, 0],
        [0.05, 0],
        [0.056, 0.006],
        [0.056, 0.018],
        [0.034, 0.03],
        [0, 0.03],
      ],
      24,
    ),
    jewelCap: turned(
      [
        [0, 0],
        [0.026, 0],
        [0.03, 0.005],
        [0.03, 0.012],
        [0.018, 0.018],
        [0, 0.018],
      ],
      20,
    ),
    crankDisc: mergeParts([
      new THREE.CylinderGeometry(0.066, 0.066, 0.014, 28),
      placed(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 12), [ROCKER_CRANK, 0.02, 0]),
    ]),
    cylinder: turned(
      [
        [0, 0],
        [0.058, 0],
        [0.058, 0.02],
        [0.048, 0.024],
        [0.048, 0.098],
        [0.054, 0.102],
        [0.054, 0.118],
        [0.048, 0.122],
        [0.048, 0.196],
        [0.058, 0.2],
        [0.058, 0.22],
        [0.018, 0.22],
      ],
      32,
    ),
    feed: pipe(
      [
        [deckDir(-84 * DEG, 0.37)[0], 0.6, deckDir(-84 * DEG, 0.37)[1]],
        [deckDir(-86 * DEG, 0.6)[0], 0.585, deckDir(-86 * DEG, 0.6)[1]],
        [along(CYLINDER_FAR + 0.1)[0], 0.6, along(CYLINDER_FAR + 0.1)[1]],
        [along(CYLINDER_FAR + 0.1)[0], 0.84, along(CYLINDER_FAR + 0.1)[1]],
        [along(CYLINDER_FAR + 0.05)[0], ROD_Y, along(CYLINDER_FAR + 0.05)[1]],
        [along(CYLINDER_FAR - 0.02)[0], ROD_Y, along(CYLINDER_FAR - 0.02)[1]],
      ],
      0.014,
      56,
      8,
    ),
    capillary: pipe(
      [
        [0.37, 0.61, 0],
        [0.52, 0.58, 0],
        [1.3, 0.58, 0],
        [1.385, 0.63, 0],
        [1.43, 0.7, 0],
      ],
      0.007,
      40,
      6,
    ),
    gaugeBody: turned(
      [
        [0, -0.012],
        [0.1, -0.012],
        [0.108, -0.004],
        [0.108, 0.012],
        [0.1, 0.018],
        [0.092, 0.012],
        [0.092, 0.006],
        [0, 0.006],
      ],
      40,
    ),
    gaugeTicks: mergeParts(gaugeTicks),
    gaugeGlass: new THREE.SphereGeometry(0.094, 28, 10, 0, Math.PI * 2, 0, Math.PI * 0.32).scale(1.15, 0.22, 1.15).translate(0, -0.004, 0),
  }
})

const pin: Point2 = { x: 0, y: 0 }
const pivot: Point2 = { x: ROCKER_PIVOT[0], y: ROCKER_PIVOT[1] }
const joint: Point2 = { x: 0, y: 0 }
const _a = new THREE.Vector3()
const _b = new THREE.Vector3()

/** A vertical arbor with a boss on the deck and a jewelled cap on top. */
function Arbor({ at, top, jewel = true }: { at: readonly [number, number]; top: number; jewel?: boolean }) {
  const m = metals('regulator')
  const g = geo()
  return (
    <group position={[at[0], 0, at[1]]}>
      <mesh geometry={g.boss} material={m.brass} position={[0, DECK_Y, 0]} />
      <mesh geometry={unitCylinder()} material={m.steel} position={[0, (DECK_Y + top) / 2, 0]} scale={[0.015, top - DECK_Y, 0.015]} />
      {jewel && (
        <>
          <mesh geometry={g.jewelCap} material={m.polished} position={[0, top, 0]} />
          <mesh geometry={unitSphere()} material={rubyMaterial()} position={[0, top + 0.018, 0]} scale={[0.012, 0.007, 0.012]} userData={{ noShadow: true }} />
        </>
      )}
    </group>
  )
}

export function Regulator() {
  const g = geo()
  const m = metals('regulator')
  const mainRef = useRef<THREE.Mesh>(null)
  const a1Ref = useRef<THREE.Group>(null)
  const a2Ref = useRef<THREE.Group>(null)
  const b1Ref = useRef<THREE.Group>(null)
  const balanceRef = useRef<THREE.Group>(null)
  const springRef = useRef<THREE.Mesh>(null)
  const palletRef = useRef<THREE.Mesh>(null)
  const conRodRef = useRef<THREE.Mesh>(null)
  const pistonRodRef = useRef<THREE.Mesh>(null)
  const crossheadRef = useRef<THREE.Mesh>(null)
  const beamRef = useRef<THREE.Group>(null)
  const beamRodRef = useRef<THREE.Mesh>(null)
  const needleRef = useRef<THREE.Group>(null)

  useFrame(() => {
    const drive = sim.drive
    const a1 = meshedAngle(drive, MAIN_TEETH, PINION_TEETH, PHI_A1)
    const a2 = meshedAngle(a1, A_WHEEL_TEETH, A2_PINION_TEETH, PHI_A2)
    const b1 = meshedAngle(drive, MAIN_TEETH, PINION_TEETH, PHI_B1)
    if (mainRef.current) mainRef.current.rotation.y = drive
    if (a1Ref.current) a1Ref.current.rotation.y = a1
    if (a2Ref.current) a2Ref.current.rotation.y = a2
    if (b1Ref.current) b1Ref.current.rotation.y = b1

    // Balance wheel swings; the hairspring winds with it at half the angle.
    const swing = Math.sin(sim.balancePhase)
    const amplitude = 2.2 * Math.min(sim.spin * 2, 1)
    if (balanceRef.current) balanceRef.current.rotation.y = swing * amplitude
    if (springRef.current) {
      springRef.current.rotation.y = swing * amplitude * 0.5
      springRef.current.scale.setScalar(1 + 0.05 * swing * Math.min(sim.spin * 2, 1))
    }
    if (palletRef.current) palletRef.current.rotation.y = PHI_B1 - 35 * DEG + clamp(swing * 2.4, -1, 1) * 0.17

    // Slider-crank: flywheel pin -> connecting rod -> crosshead -> piston rod.
    const [px, pz] = deckDir(a2, CRANK_R)
    const d = sliderCrank(a2 - SLIDE_ANGLE, CRANK_R, ROD_LENGTH)
    const hx = A2[0] + SLIDE[0] * d
    const hz = A2[1] + SLIDE[1] * d
    if (conRodRef.current) spanRod(conRodRef.current, _a.set(A2[0] + px, ROD_Y, A2[1] + pz), _b.set(hx, ROD_Y, hz))
    if (crossheadRef.current) crossheadRef.current.position.set(hx, ROD_Y, hz)
    if (pistonRodRef.current) {
      const [cx, cz] = along(CYLINDER_NEAR + 0.06)
      spanRod(pistonRodRef.current, _a.set(hx, ROD_Y, hz), _b.set(cx, ROD_Y, cz))
    }

    // Four-bar rocking beam driven from cluster B.
    const [rx, rz] = deckDir(b1, ROCKER_CRANK)
    pin.x = B1[0] + rx
    pin.y = B1[1] + rz
    if (fourBarJoint(pin, pivot, ROCKER_ROD, ROCKER_ARM, joint)) {
      if (beamRef.current) beamRef.current.rotation.y = Math.atan2(-(joint.y - pivot.y), joint.x - pivot.x)
      if (beamRodRef.current) spanRod(beamRodRef.current, _a.set(pin.x, BEAM_Y, pin.y), _b.set(joint.x, BEAM_Y, joint.y))
    }

    // Output gauge, with a faint tremor from the escapement.
    if (needleRef.current) {
      const reading = clamp(sim.needle / OUTPUT_RANGE.max, 0, 1)
      needleRef.current.rotation.y = -(-NEEDLE_SWEEP + reading * NEEDLE_SWEEP * 2) + swing * 0.006 * sim.spin
    }
  })

  const cylinderMid = along((CYLINDER_NEAR + CYLINDER_FAR) / 2)
  const cylinderStart = along(CYLINDER_NEAR)

  return (
    <group name="RegulatorAssembly">
      <mesh ref={mainRef} name="MainWheel" geometry={g.main} material={m.polished} position={[0, MAIN_Y, 0]} />

      <group name="GearClusterA">
        <Arbor at={A1} top={1.03} />
        <group ref={a1Ref} position={[A1[0], 0, A1[1]]}>
          <mesh geometry={g.pinion} material={m.steel} position={[0, MAIN_Y, 0]} />
          <mesh geometry={g.aWheel} material={m.brass} position={[0, LOWER_Y, 0]} />
        </group>
        <Arbor at={A2} top={FLYWHEEL_Y + 0.02} jewel={false} />
        <group ref={a2Ref} position={[A2[0], 0, A2[1]]}>
          <mesh geometry={g.a2Pinion} material={m.steel} position={[0, LOWER_Y, 0]} />
          <mesh name="Flywheel" geometry={g.flywheel} material={m.brass} position={[0, FLYWHEEL_Y, 0]} />
        </group>
      </group>

      <group name="LinkageB">
        <mesh ref={conRodRef} geometry={unitCylinder()} material={m.steel} scale={[0.011, 1, 0.011]} />
        <mesh ref={crossheadRef} geometry={unitBox()} material={m.polished} rotation={[0, SLIDE_ANGLE, 0]} scale={[0.056, 0.036, 0.04]} />
        <mesh ref={pistonRodRef} geometry={unitCylinder()} material={m.polished} scale={[0.0085, 1, 0.0085]} />
        <mesh
          name="PistonCylinder"
          geometry={g.cylinder}
          material={m.copper}
          position={[cylinderStart[0], ROD_Y, cylinderStart[1]]}
          rotation={[0, SLIDE_ANGLE, -Math.PI / 2]}
        />
        {[CYLINDER_NEAR + 0.035, CYLINDER_FAR - 0.035].map((d) => {
          const [x, z] = along(d)
          return (
            <mesh key={d} geometry={unitBox()} material={m.steel} position={[x, (DECK_Y + ROD_Y - 0.04) / 2, z]} rotation={[0, SLIDE_ANGLE, 0]} scale={[0.026, ROD_Y - 0.04 - DECK_Y, 0.07]} />
          )
        })}
        <mesh geometry={unitBox()} material={m.steel} position={[cylinderMid[0], ROD_Y - 0.052, cylinderMid[1]]} rotation={[0, SLIDE_ANGLE, 0]} scale={[CYLINDER_FAR - CYLINDER_NEAR, 0.012, 0.09]} />
        <mesh name="CoreFeed" geometry={g.feed} material={m.copper} />
      </group>

      <group name="GearClusterB">
        <Arbor at={B1} top={1.03} jewel={false} />
        <group ref={b1Ref} position={[B1[0], 0, B1[1]]}>
          <mesh geometry={g.pinion} material={m.steel} position={[0, MAIN_Y, 0]} />
          <mesh name="EscapeWheel" geometry={g.escape} material={m.polished} position={[0, ESCAPE_Y, 0]} />
          <mesh geometry={g.crankDisc} material={m.brass} position={[0, BEAM_Y - 0.03, 0]} />
        </group>
        <mesh
          ref={palletRef}
          name="PalletLever"
          geometry={unitBox()}
          material={m.steel}
          position={[
            B1[0] + (BALANCE[0] - B1[0]) * 0.46,
            ESCAPE_Y,
            B1[1] + (BALANCE[1] - B1[1]) * 0.46,
          ]}
          scale={[0.085, 0.01, 0.014]}
        />
      </group>

      <group name="BalanceWheel">
        <Arbor at={BALANCE} top={0.8} />
        <group ref={balanceRef} position={[BALANCE[0], ESCAPE_Y, BALANCE[1]]}>
          <mesh geometry={g.balance} material={m.polished} />
        </group>
        <mesh ref={springRef} name="Hairspring" geometry={g.hairspring} material={m.copper} position={[BALANCE[0], ESCAPE_Y + 0.045, BALANCE[1]]} />
        {/* Balance cock: a bridge from its own post to the top pivot. */}
        <mesh geometry={unitCylinder()} material={m.steel} position={[BALANCE_POST[0], (DECK_Y + 0.8) / 2, BALANCE_POST[1]]} scale={[0.022, 0.8 - DECK_Y, 0.022]} />
        <mesh
          geometry={unitBox()}
          material={m.brass}
          position={[(BALANCE[0] + BALANCE_POST[0]) / 2, 0.806, (BALANCE[1] + BALANCE_POST[1]) / 2]}
          rotation={[0, -35 * DEG, 0]}
          scale={[0.38, 0.016, 0.05]}
        />
      </group>

      <group name="LinkageA">
        <group position={[ROCKER_PIVOT[0], 0, ROCKER_PIVOT[1]]}>
          <mesh geometry={g.boss} material={m.brass} position={[0, DECK_Y, 0]} />
          <mesh geometry={unitCylinder()} material={m.steel} position={[0, (DECK_Y + BEAM_Y) / 2, 0]} scale={[0.02, BEAM_Y - DECK_Y, 0.02]} />
          <group ref={beamRef} position={[0, BEAM_Y, 0]}>
            <mesh geometry={unitBox()} material={m.polished} position={[0, 0, 0]} scale={[ROCKER_ARM * 2 + 0.03, 0.016, 0.028]} />
            <mesh geometry={unitSphere()} material={m.brass} position={[-ROCKER_ARM, 0, 0]} scale={0.03} />
            <mesh geometry={unitCylinder()} material={m.steel} position={[ROCKER_ARM, 0, 0]} scale={[0.011, 0.04, 0.011]} />
            <mesh geometry={unitCylinder()} material={m.steel} scale={[0.016, 0.044, 0.016]} />
          </group>
        </group>
        <mesh ref={beamRodRef} geometry={unitCylinder()} material={m.brass} scale={[0.0075, 1, 0.0075]} />
      </group>

      <group name="RegulatorIndicator" rotation={[0, GAUGE_ANGLE, 0]}>
        <mesh geometry={g.capillary} material={m.copper} />
        <mesh geometry={unitCylinder()} material={m.steel} position={[1.45, 0.66, 0]} scale={[0.016, 0.13, 0.016]} />
        <group position={[1.475, 0.755, 0]} rotation={[0, 0, -52 * DEG]}>
          <mesh geometry={g.gaugeBody} material={m.polished} />
          <mesh geometry={unitCylinder()} material={etchMaterial()} position={[0, 0.0045, 0]} scale={[0.092, 0.004, 0.092]} />
          {/* Quarter turn so mid-scale points up the tilted dial, toward the machine. */}
          <group rotation={[0, Math.PI / 2, 0]}>
            <mesh geometry={g.gaugeTicks} material={m.polished} />
            <group ref={needleRef} position={[0, 0.011, 0]}>
              <mesh geometry={unitBox()} material={rubyMaterial()} position={[0, 0, -0.03]} scale={[0.005, 0.003, 0.092]} />
              <mesh geometry={unitCylinder()} material={m.polished} scale={[0.011, 0.008, 0.011]} />
            </group>
          </group>
          <mesh geometry={g.gaugeGlass} material={smokedGlassMaterial()} userData={{ noShadow: true }} />
        </group>
      </group>
    </group>
  )
}
