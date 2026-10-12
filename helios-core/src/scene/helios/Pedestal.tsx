import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { litIndicatorCount } from '../../sim/modes'
import { meshedAngle, pitchRadius } from '../../sim/kinematics'
import { sim } from '../../sim/runtime'
import { DEG, DECK_Y, FIN_AZIMUTH_OFFSET, FIN_COUNT, HINGE_R, HINGE_Y } from './constants'
import { gear, matrixFrom, plateBracket, ringBand, turned, type ProfilePoint } from './geometry'
import { etchMaterial, lampMaterial, metals, shellMetal } from './materials'
import { Instanced, hexBolt, lazy, unitBox, unitSphere } from './parts'

const SUB_MODULE = 0.018
const GREAT_TEETH = 120
const SUB_PINION_TEETH = 12
const GREAT_Y = 0.43
const WINDOW_INNER = 1.04
const WINDOW_OUTER = 1.34
const LAMP_COUNT = 24

/** Angles of the six anchors (and fins). Windows and lamps key off the gaps between them. */
export const ANCHOR_ANGLES = Array.from({ length: FIN_COUNT }, (_, k) => FIN_AZIMUTH_OFFSET + (k * Math.PI * 2) / FIN_COUNT)
const GAP_ANGLES = ANCHOR_ANGLES.map((a) => a - Math.PI / FIN_COUNT)

const geo = lazy(() => {
  const cove: ProfilePoint[] = []
  for (let i = 0; i <= 8; i++) {
    const a = (-90 - (90 * i) / 8) * DEG
    cove.push([1.93 + 0.21 * Math.cos(a), 0.3 + 0.165 * Math.sin(a)])
  }
  // Plinth, cove moulding, inscription drum, cornice, calibration seat, curb, and the gear well.
  const body = turned(
    [
      [0, 0],
      [2.08, 0],
      [2.1, 0.02],
      [2.1, 0.105],
      [2.07, 0.135],
      ...cove,
      [1.72, 0.47],
      [1.77, 0.48],
      [1.77, 0.515],
      [1.745, 0.54],
      [1.64, 0.54],
      [1.64, 0.5],
      [1.5, 0.5],
      [1.5, 0.585],
      [1.485, 0.6],
      [1.415, 0.6],
      [1.4, 0.585],
      [1.4, 0.36],
      [0, 0.36],
    ],
    144,
  )

  // Deck plate with kidney windows over the gear train below.
  const plate = new THREE.Shape()
  plate.absarc(0, 0, 1.4, 0, Math.PI * 2, false)
  const bore = new THREE.Path()
  bore.absarc(0, 0, 0.3, 0, Math.PI * 2, true)
  plate.holes.push(bore)
  const halfSpan = 17 * DEG
  for (const centre of GAP_ANGLES) {
    const win = new THREE.Path()
    const mo = 0.03 / WINDOW_OUTER
    const mi = 0.03 / WINDOW_INNER
    win.absarc(0, 0, WINDOW_OUTER, centre - halfSpan + mo, centre + halfSpan - mo, false)
    win.absarc(0, 0, WINDOW_INNER, centre + halfSpan - mi, centre - halfSpan + mi, true)
    win.closePath()
    plate.holes.push(win)
  }
  const deckPlate = new THREE.ExtrudeGeometry(plate, {
    depth: 0.014,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.004,
    bevelOffset: -0.004,
    bevelSegments: 1,
    curveSegments: 48,
  })
  deckPlate.rotateX(-Math.PI / 2)
  deckPlate.translate(0, DECK_Y - 0.018, 0)

  const strut = plateBracket(
    [
      { x: 1.45, y: 0.615, w: 0.2 },
      { x: 1.5, y: 0.95, w: 0.17 },
      { x: 1.34, y: 1.34, w: 0.13 },
      { x: HINGE_R + 0.03, y: HINGE_Y - 0.03, w: 0.1 },
    ],
    0.07,
    [
      { t: 0.3, r: 0.05 },
      { t: 0.54, r: 0.038 },
      { t: 0.76, r: 0.026 },
    ],
  )

  return {
    body,
    deckPlate,
    strut,
    bead: new THREE.TorusGeometry(1, 0.016, 10, 160).rotateX(Math.PI / 2),
    drum: new THREE.CylinderGeometry(1.724, 1.724, 0.15, 144, 1, true),
    calibration: ringBand(1.57, 0.14, 0.055, 144, 0.008),
    cradle: ringBand(HINGE_R, 0.05, 0.045, 128),
    inlay: ringBand(1, 0.012, 0.004, 128, 0.001),
    great: gear({
      teeth: GREAT_TEETH,
      module: SUB_MODULE,
      thickness: 0.03,
      bore: 0.3,
      spokes: 8,
      hubRadius: 0.44,
      rimWidth: 0.07,
      spokeWidth: 0.08,
    }),
    subPinion: gear({ teeth: SUB_PINION_TEETH, module: SUB_MODULE, thickness: 0.036, bore: 0.022 }),
    foot: new THREE.BoxGeometry(0.22, 0.03, 0.2),
  }
})

const instances = lazy(() => {
  const ticks: THREE.Matrix4[] = []
  for (let k = 0; k < 180; k++) {
    const a = k * 2 * DEG
    const len = k % 15 === 0 ? 0.085 : k % 5 === 0 ? 0.058 : 0.034
    const r = 1.628 - len / 2
    ticks.push(matrixFrom([r * Math.cos(a), 0.556, -r * Math.sin(a)], [0, a, 0], [len, 0.003, k % 15 === 0 ? 0.007 : 0.004]))
  }

  const curbBolts: THREE.Matrix4[] = []
  for (let k = 0; k < 36; k++) {
    const a = k * 10 * DEG
    const nearAnchor = ANCHOR_ANGLES.some((b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 9 * DEG)
    if (nearAnchor) continue
    curbBolts.push(matrixFrom([1.45 * Math.cos(a), 0.606, -1.45 * Math.sin(a)], [0, a, 0], [0.014, 0.012, 0.014]))
  }

  const footBolts: THREE.Matrix4[] = []
  const strutRivets: THREE.Matrix4[] = []
  for (const a of ANCHOR_ANGLES) {
    const frame = new THREE.Matrix4().makeRotationY(a)
    for (const [x, z] of [
      [1.39, 0.07],
      [1.39, -0.07],
      [1.52, 0.07],
      [1.52, -0.07],
    ] as const) {
      footBolts.push(frame.clone().multiply(matrixFrom([x, 0.652, z], [0, 0, 0], [0.017, 0.016, 0.017])))
    }
    for (const [x, y] of [
      [1.48, 0.76],
      [1.455, 1.15],
      [1.2, 1.47],
    ] as const) {
      for (const side of [-1, 1]) {
        strutRivets.push(
          frame.clone().multiply(matrixFrom([x, y, side * 0.036], [Math.PI / 2, 0, 0], [0.012, 0.008, 0.012])),
        )
      }
    }
  }

  const lamps: THREE.Matrix4[] = []
  for (let k = 0; k < LAMP_COUNT; k++) {
    // Lamp 0 sits at the front gap and the row fills clockwise from there.
    const a = GAP_ANGLES[0] - (k / LAMP_COUNT) * Math.PI * 2
    lamps.push(matrixFrom([1.535 * Math.cos(a), 0.557, -1.535 * Math.sin(a)], [0, 0, 0], [0.015, 0.008, 0.015]))
  }

  return { ticks, curbBolts, footBolts, strutRivets, lamps }
})

/* ------------------------------------------------------------------ */
/* Engraved inscription                                                 */
/* ------------------------------------------------------------------ */

const INSCRIPTION = [
  { text: 'HELIOS CORE', u: 0.045, size: 0.6, tracking: 0.3 },
  { text: 'ATELIER IX', u: 0.295, size: 0.36, tracking: 0.42 },
  { text: 'MECHANICA COLLECTION', u: 0.545, size: 0.42, tracking: 0.34 },
  { text: 'SPECIMEN No. 002  ·  MMXXIV', u: 0.795, size: 0.36, tracking: 0.36 },
] as const

function drawInscription(ctx: CanvasRenderingContext2D, w: number, h: number, serif: string) {
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#2a1c0b'
  ctx.fillRect(0, h * 0.085, w, h * 0.03)
  ctx.fillRect(0, h * 0.885, w, h * 0.03)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'

  for (const item of INSCRIPTION) {
    const px = item.size * h
    ctx.font = `600 ${px}px ${serif}`
    const tracking = item.tracking * px
    const chars = [...item.text]
    const widths = chars.map((c) => ctx.measureText(c).width)
    const total = widths.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1)
    // Draw three times so text crossing the texture seam stays whole.
    for (const shift of [-w, 0, w]) {
      let x = item.u * w - total / 2 + shift
      chars.forEach((c, i) => {
        ctx.fillText(c, x, h * 0.52)
        x += widths[i] + tracking
      })
    }
  }

  // Diamond separators between the four inscriptions.
  for (const u of [0.17, 0.42, 0.67, 0.92]) {
    const x = u * w
    const s = h * 0.1
    ctx.beginPath()
    ctx.moveTo(x, h * 0.5 - s)
    ctx.lineTo(x + s, h * 0.5)
    ctx.lineTo(x, h * 0.5 + s)
    ctx.lineTo(x - s, h * 0.5)
    ctx.closePath()
    ctx.fill()
    ctx.fillRect(x - s * 7, h * 0.5 - 1, s * 5, 2)
    ctx.fillRect(x + s * 2, h * 0.5 - 1, s * 5, 2)
  }
}

function InscriptionBand() {
  const maxSize = useThree((s) => s.gl.capabilities.maxTextureSize)
  const anisotropy = useThree((s) => s.gl.capabilities.getMaxAnisotropy())
  const { material, redraw } = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = Math.min(8192, maxSize)
    canvas.height = canvas.width / 64
    const map = new THREE.CanvasTexture(canvas)
    map.colorSpace = THREE.SRGBColorSpace
    const bump = new THREE.CanvasTexture(canvas)
    for (const t of [map, bump]) {
      t.wrapS = THREE.RepeatWrapping
      t.anisotropy = Math.min(8, anisotropy)
    }
    const base = metals('anchor').polished
    const mat = new THREE.MeshStandardMaterial({
      color: base.color.clone(),
      metalness: 1,
      roughness: 0.26,
      map,
      bumpMap: bump,
      bumpScale: 1.2,
    })
    const paint = (serif: string) => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      drawInscription(ctx, canvas.width, canvas.height, serif)
      map.needsUpdate = true
      bump.needsUpdate = true
    }
    paint('Georgia, "Times New Roman", serif')
    return { material: mat, redraw: paint }
  }, [maxSize, anisotropy])

  // Re-engrave once the display serif has loaded; the fallback serif holds until then.
  useEffect(() => {
    let live = true
    const family = '"Cormorant Garamond"'
    document.fonts
      ?.load(`600 64px ${family}`)
      .then(() => {
        if (live) redraw(`${family}, Georgia, serif`)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [redraw])

  // Follows the anchor highlight like the rest of the pedestal brass.
  useFrame(() => {
    material.color.copy(metals('anchor').polished.color)
  })

  return <mesh name="InscriptionBand" geometry={geo().drum} material={material} position={[0, 0.385, 0]} />
}

/* ------------------------------------------------------------------ */
/* Output lamps                                                         */
/* ------------------------------------------------------------------ */

const LAMP_ON = new THREE.Color(2.1, 0.92, 0.22)
const LAMP_OFF = new THREE.Color(0.075, 0.034, 0.01)

/** A ring of lamps around the deck that reads out core output, one lamp at a time. */
function IndicatorLamps() {
  const ref = useRef<THREE.InstancedMesh>(null)
  const lit = useRef(-1)
  const { lamps } = instances()

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    lamps.forEach((m, i) => {
      mesh.setMatrixAt(i, m)
      mesh.setColorAt(i, LAMP_OFF)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [lamps])

  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    const count = sim.ignite < 0.05 ? 0 : litIndicatorCount(sim.output * sim.ignite, LAMP_COUNT)
    if (count === lit.current) return
    lit.current = count
    for (let i = 0; i < LAMP_COUNT; i++) mesh.setColorAt(i, i < count ? LAMP_ON : LAMP_OFF)
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={ref}
      name="MicroIndicatorLights"
      args={[unitSphere(), lampMaterial(), LAMP_COUNT]}
      userData={{ noShadow: true }}
    />
  )
}

/* ------------------------------------------------------------------ */
/* Assembly                                                             */
/* ------------------------------------------------------------------ */

export function Pedestal() {
  const g = geo()
  const inst = instances()
  const anchor = metals('anchor')
  const reg = metals('regulator')
  const plateMaterial = shellMetal('anchor', 'black', 0.14)
  const greatRef = useRef<THREE.Mesh>(null)
  const pinionRefs = useRef<(THREE.Mesh | null)[]>([])

  const greatRadius = pitchRadius(GREAT_TEETH, SUB_MODULE)
  const pinionRadius = pitchRadius(SUB_PINION_TEETH, SUB_MODULE)
  const pinionAngles = useMemo(() => [GAP_ANGLES[0], GAP_ANGLES[2], GAP_ANGLES[4]], [])

  useFrame(() => {
    // The great wheel turns with the meridian ring: the same shaft carries both.
    const angle = -sim.ringPhase[3] * 3
    if (greatRef.current) greatRef.current.rotation.y = angle
    for (let i = 0; i < pinionAngles.length; i++) {
      const p = pinionRefs.current[i]
      if (p) p.rotation.y = meshedAngle(angle, GREAT_TEETH, SUB_PINION_TEETH, pinionAngles[i])
    }
  })

  return (
    <group name="PedestalAssembly">
      <mesh name="OuterBase" geometry={g.body} material={anchor.black} />

      {/* Brass beads framing the cove and the inscription drum. */}
      <mesh name="BrassInsetLow" geometry={g.bead} material={anchor.brass} position={[0, 0.15, 0]} scale={[1.94, 1, 1.94]} />
      <mesh name="BrassInsetMid" geometry={g.bead} material={anchor.brass} position={[0, 0.305, 0]} scale={[1.728, 0.6, 1.728]} />
      <mesh name="BrassInsetHigh" geometry={g.bead} material={anchor.brass} position={[0, 0.464, 0]} scale={[1.728, 0.6, 1.728]} />
      <InscriptionBand />

      <mesh name="OuterCalibrationRing" geometry={g.calibration} material={anchor.brass} position={[0, 0.5275, 0]} />
      <Instanced name="CalibrationMarks" geometry={unitBox()} material={etchMaterial()} matrices={inst.ticks} />
      <IndicatorLamps />
      <Instanced name="CurbBolts" geometry={hexBolt()} material={anchor.steel} matrices={inst.curbBolts} />

      {/* Gear floor: a windowed deck plate over the great wheel. */}
      <mesh name="GearFloor" geometry={g.deckPlate} material={plateMaterial} />
      <mesh name="DeckInlayInner" geometry={g.inlay} material={anchor.polished} position={[0, DECK_Y + 0.001, 0]} scale={[0.5, 1, 0.5]} />
      <mesh name="DeckInlayOuter" geometry={g.inlay} material={anchor.polished} position={[0, DECK_Y + 0.001, 0]} scale={[0.985, 1, 0.985]} />
      <mesh ref={greatRef} name="GreatWheel" geometry={g.great} material={reg.polished} position={[0, GREAT_Y, 0]} />
      {pinionAngles.map((a, i) => {
        const r = greatRadius + pinionRadius
        return (
          <group key={i} position={[r * Math.cos(a), 0, -r * Math.sin(a)]}>
            <mesh
              ref={(m) => {
                pinionRefs.current[i] = m
              }}
              geometry={g.subPinion}
              material={reg.brass}
              position={[0, GREAT_Y, 0]}
            />
            <mesh geometry={hexBolt()} material={reg.steel} position={[0, GREAT_Y + 0.03, 0]} scale={[0.022, 0.03, 0.022]} />
          </group>
        )
      })}

      {/* Six forged anchors carry the cradle ring that the fins hinge on. */}
      <group name="AnchorSupports">
        {ANCHOR_ANGLES.map((a, i) => (
          <group key={i} rotation={[0, a, 0]}>
            <mesh geometry={g.strut} material={anchor.steel} />
            <mesh geometry={g.foot} material={anchor.brass} position={[1.455, 0.63, 0]} />
          </group>
        ))}
        <Instanced name="FootBolts" geometry={hexBolt()} material={anchor.steel} matrices={inst.footBolts} />
        <Instanced name="StrutRivets" geometry={hexBolt()} material={anchor.polished} matrices={inst.strutRivets} />
        <mesh name="CradleRing" geometry={g.cradle} material={anchor.steel} position={[0, HINGE_Y - 0.05, 0]} />
      </group>
    </group>
  )
}
