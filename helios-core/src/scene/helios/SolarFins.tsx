import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { finPose, lerp } from '../../sim/modes'
import { sim } from '../../sim/runtime'
import { CORE_Y, FIN_COUNT, FIN_LAT0, FIN_LAT1, FIN_R, FIN_THICKNESS } from './constants'
import { MeshBuilder, addShellPatch, matrixFrom, mergeParts, placed, spanRod, spherePoint, turned, type ShellPatch } from './geometry'
import { PALETTE, bearingMetal, finMetal, metals } from './materials'
import { ANCHOR_ANGLES } from './Pedestal'
import { Instanced, lazy, unitCylinder, unitSphere } from './parts'

/**
 * Each fin is three shingled armour plates on a hinge. Plates are slices of a
 * sphere, so a closed fin sits at a constant stand-off from the ring cage.
 * `g` runs 0..1 from hinge to tip.
 */
const latAt = (g: number) => FIN_LAT0 + (FIN_LAT1 - FIN_LAT0) * g

interface SegmentSpec {
  g0: number
  g1: number
  lift: number
  half: (t: number) => number
}

// Straight tapers and stepped shoulders: armour plate, not petal.
const SEGMENTS: readonly SegmentSpec[] = [
  { g0: 0, g1: 0.37, lift: 0, half: (t) => lerp(0.122, 0.198, t) },
  { g0: 0.345, g1: 0.69, lift: 0.024, half: (t) => lerp(0.176, 0.158, t) },
  {
    g0: 0.665,
    g1: 1,
    lift: 0.048,
    half: (t) => (t < 0.84 ? lerp(0.138, 0.084, t / 0.84) : lerp(0.084, 0.04, (t - 0.84) / 0.16)),
  },
]

/** Where on the lowest plate the Helios mark sits, as a fraction of that plate. */
const MARK_T = 0.46

const HINGE = spherePoint(FIN_R, FIN_LAT0, 0)
const JOINT_1 = spherePoint(FIN_R + 0.012, latAt(0.357), 0)
const JOINT_2 = spherePoint(FIN_R + 0.036, latAt(0.677), 0)
const JOINTS = [HINGE, JOINT_1, JOINT_2]

/** Where the actuator leaves the anchor strut, in fin space (origin at the core). */
const BRACE_FOOT = new THREE.Vector3(1.42, 1.2 - CORE_Y, 0)
/** Where it meets the underside of the lowest plate, in the closed pose. */
const BRACE_HEAD = spherePoint(FIN_R - 0.02, latAt(0.2), 0)
const SLEEVE_LENGTH = 0.4

function buildSegment(index: number): THREE.BufferGeometry {
  const seg = SEGMENTS[index]
  const mb = new MeshBuilder()
  const radius = FIN_R + seg.lift
  const lat0 = latAt(seg.g0)
  const lat1 = latAt(seg.g1)
  const span = lat1 - lat0
  const face = PALETTE.polished
  const frame = PALETTE.steel
  const under = PALETTE.steel.clone().multiplyScalar(0.85)
  const dark = PALETTE.black
  const top = radius + FIN_THICKNESS
  const RAIL = 0.0115

  // The plate itself: a brass face in a forged steel edge.
  addShellPatch(mb, {
    lat0,
    lat1,
    r0: radius,
    r1: top,
    half: seg.half,
    refRadius: FIN_R,
    nLat: 12,
    nAz: 8,
    outer: face,
    inner: under,
    edge: frame,
  })

  // Raised steel frame: a rail down each long edge and a bar across each end.
  for (const side of [-1, 1]) {
    addShellPatch(mb, {
      lat0,
      lat1,
      r0: top,
      r1: top + 0.0055,
      half: () => RAIL,
      center: (t) => side * (seg.half(t) - RAIL),
      refRadius: FIN_R,
      nLat: 10,
      nAz: 1,
      outer: frame,
      edge: frame,
    })
  }
  for (const t of [0.025, 0.975]) {
    addShellPatch(mb, {
      lat0: lat0 + span * t - 0.0075,
      lat1: lat0 + span * t + 0.0075,
      r0: top,
      r1: top + 0.0055,
      half: () => seg.half(t) - RAIL * 2,
      refRadius: FIN_R,
      nLat: 1,
      nAz: 6,
      outer: frame,
      edge: frame,
    })
  }

  const inlay = (patch: Pick<ShellPatch, 'lat0' | 'lat1' | 'half' | 'center' | 'nLat' | 'nAz'>) =>
    addShellPatch(mb, { ...patch, r0: top, r1: top + 0.003, refRadius: FIN_R, outer: PALETTE.etch, edge: PALETTE.etch })

  if (index === 0) {
    // The lowest plate carries the Helios mark, with rays etched outward from it:
    // a full fan toward the tip and a short one toward the hinge.
    // [lateral position at the far end, near end, far end], ends as fractions of the plate.
    const rays: [number, number, number][] = [
      [-0.72, 0.6, 0.9],
      [-0.36, 0.62, 0.93],
      [0, 0.63, 0.94],
      [0.36, 0.62, 0.93],
      [0.72, 0.6, 0.9],
      [-0.5, 0.31, 0.1],
      [0, 0.3, 0.07],
      [0.5, 0.31, 0.1],
    ]
    for (const [u, near, far] of rays) {
      const lo = Math.min(near, far)
      const hi = Math.max(near, far)
      // Every ray lies on a line through the mark, so the fan shares one origin.
      const reach = (t: number) => (lo + (hi - lo) * t - MARK_T) / (far - MARK_T)
      inlay({
        lat0: lat0 + span * lo,
        lat1: lat0 + span * hi,
        half: () => 0.0048,
        center: (t) => u * (seg.half(far) - RAIL * 2.4) * reach(t),
        nLat: 6,
        nAz: 1,
      })
    }
  } else {
    // Upper plates are louvred: fine transverse lines, like a heat shield.
    const lines = index === 1 ? [0.2, 0.4, 0.6, 0.8] : [0.2, 0.4, 0.6, 0.78]
    for (const t of lines) {
      inlay({
        lat0: lat0 + span * t - 0.003,
        lat1: lat0 + span * t + 0.003,
        half: () => seg.half(t) - RAIL * 2.6,
        nLat: 1,
        nAz: 6,
      })
    }
  }

  // Underside: a spine and two stiffening ribs in blackened steel.
  addShellPatch(mb, {
    lat0: lat0 + span * 0.03,
    lat1: lat0 + span * 0.97,
    r0: radius - 0.024,
    r1: radius,
    half: () => 0.02,
    refRadius: FIN_R,
    nLat: 8,
    nAz: 1,
    inner: dark,
    edge: dark,
  })
  for (const t of [0.27, 0.74]) {
    addShellPatch(mb, {
      lat0: lat0 + span * t - 0.011,
      lat1: lat0 + span * t + 0.011,
      r0: radius - 0.013,
      r1: radius,
      half: () => seg.half(t) * 0.84,
      refRadius: FIN_R,
      nLat: 1,
      nAz: 6,
      inner: dark,
      edge: dark,
    })
  }

  return mb.build()
}

const geo = lazy(() => {
  // Etched Helios mark: a raised disc, a ring, and a boss at its centre.
  const disc = turned(
    [
      [0, 0],
      [0.056, 0],
      [0.06, 0.004],
      [0.06, 0.008],
      [0.05, 0.011],
      [0.044, 0.006],
      [0.03, 0.006],
      [0.024, 0.014],
      [0.012, 0.018],
      [0, 0.018],
    ],
    28,
  )
  const markLat = latAt(SEGMENTS[0].g1 * MARK_T)
  const markAt = spherePoint(FIN_R + FIN_THICKNESS, markLat, 0)
  const mark = placed(disc, [markAt.x - HINGE.x, markAt.y - HINGE.y, 0], [0, 0, markLat - Math.PI / 2])

  const knuckle = mergeParts([
    placed(new THREE.CylinderGeometry(0.036, 0.036, 0.32, 20), [0, 0, 0], [Math.PI / 2, 0, 0]),
    placed(new THREE.BoxGeometry(0.07, 0.05, 0.1), [0.03, -0.035, 0]),
  ])

  return { segments: SEGMENTS.map((_, i) => buildSegment(i)), mark, knuckle }
})

const instances = lazy(() => {
  const caps: THREE.Matrix4[] = []
  const feet: THREE.Matrix4[] = []
  for (const a of ANCHOR_ANGLES) {
    const frame = new THREE.Matrix4().makeRotationY(a)
    for (const z of [-0.168, 0.168]) {
      caps.push(frame.clone().multiply(matrixFrom([HINGE.x, HINGE.y, z], [Math.PI / 2, 0, 0], [0.043, 0.018, 0.043])))
    }
    feet.push(frame.clone().multiply(matrixFrom([BRACE_FOOT.x, BRACE_FOOT.y, 0], [0, 0, 0], 0.024)))
  }
  return { caps, feet }
})

const pose = [0, 0, 0]
const _head = new THREE.Vector3()
const _rel = new THREE.Vector3()
const _end = new THREE.Vector3()

export function SolarFins() {
  const g = geo()
  const inst = instances()
  const fin = finMetal()
  const m = metals('fins')
  const bearing = bearingMetal('fins')
  const hinges = useRef<(THREE.Group | null)[]>([])
  const mids = useRef<(THREE.Group | null)[]>([])
  const tips = useRef<(THREE.Group | null)[]>([])
  const rods = useRef<(THREE.Mesh | null)[]>([])
  const sleeves = useRef<(THREE.Mesh | null)[]>([])

  useFrame(() => {
    finPose(sim.finOpen, pose)
    for (let i = 0; i < FIN_COUNT; i++) {
      // A slow, slightly different drift per fin: calibration, not animation.
      const drift = Math.sin(sim.time * 0.31 + i * 1.7) * 0.0055
      const hingeAngle = pose[0] + drift
      const hinge = hinges.current[i]
      const mid = mids.current[i]
      const tip = tips.current[i]
      if (hinge) hinge.rotation.z = -hingeAngle
      if (mid) mid.rotation.z = -pose[1]
      if (tip) tip.rotation.z = -(pose[2] + drift * 0.8)

      // The actuator stays pinned to the strut and to the plate as the fin swings.
      const c = Math.cos(-hingeAngle)
      const s = Math.sin(-hingeAngle)
      _rel.subVectors(BRACE_HEAD, HINGE)
      _head.set(HINGE.x + _rel.x * c - _rel.y * s, HINGE.y + _rel.x * s + _rel.y * c, 0)
      const rod = rods.current[i]
      if (rod) spanRod(rod, BRACE_FOOT, _head)
      const sleeve = sleeves.current[i]
      if (sleeve) {
        _end.subVectors(_head, BRACE_FOOT).normalize().multiplyScalar(SLEEVE_LENGTH).add(BRACE_FOOT)
        spanRod(sleeve, BRACE_FOOT, _end)
      }
    }
  })

  return (
    <group name="SolarFinAssembly" position={[0, CORE_Y, 0]}>
      {ANCHOR_ANGLES.map((angle, i) => (
        <group key={i} name={`SolarFin0${i + 1}`} rotation={[0, angle, 0]}>
          <mesh name="FinKnuckle" geometry={g.knuckle} material={bearing} position={[HINGE.x, HINGE.y, 0]} />
          <group
            ref={(node) => {
              hinges.current[i] = node
            }}
            position={[JOINTS[0].x, JOINTS[0].y, 0]}
          >
            <mesh geometry={g.segments[0]} material={fin} position={[-JOINTS[0].x, -JOINTS[0].y, 0]} />
            <mesh name="HeliosMark" geometry={g.mark} material={m.polished} />
            <group
              ref={(node) => {
                mids.current[i] = node
              }}
              position={[JOINTS[1].x - JOINTS[0].x, JOINTS[1].y - JOINTS[0].y, 0]}
            >
              <mesh geometry={g.segments[1]} material={fin} position={[-JOINTS[1].x, -JOINTS[1].y, 0]} />
              <group
                ref={(node) => {
                  tips.current[i] = node
                }}
                position={[JOINTS[2].x - JOINTS[1].x, JOINTS[2].y - JOINTS[1].y, 0]}
              >
                <mesh geometry={g.segments[2]} material={fin} position={[-JOINTS[2].x, -JOINTS[2].y, 0]} />
              </group>
            </group>
          </group>

          <mesh
            ref={(node) => {
              rods.current[i] = node
            }}
            name="FinBrace"
            geometry={unitCylinder()}
            material={m.polished}
            scale={[0.0085, 1, 0.0085]}
          />
          <mesh
            ref={(node) => {
              sleeves.current[i] = node
            }}
            name="FinBraceSleeve"
            geometry={unitCylinder()}
            material={m.steel}
            scale={[0.017, 1, 0.017]}
          />
        </group>
      ))}
      <Instanced name="HingeCaps" geometry={unitCylinder()} material={m.polished} matrices={inst.caps} />
      <Instanced name="BraceFeet" geometry={unitSphere()} material={m.brass} matrices={inst.feet} />
    </group>
  )
}
