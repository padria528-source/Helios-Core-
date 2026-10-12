import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  MeshBuilder,
  addShellPatch,
  bandProfile,
  deckDir,
  gear,
  matrixFrom,
  mergeParts,
  plateBracket,
  radialMatrix,
  ringBand,
  spanRod,
  spherePoint,
  turned,
} from '../src/scene/helios/geometry'

/**
 * A mesh renders correctly only if each triangle's winding agrees with its
 * vertex normals; otherwise it is culled or lit inside out. Also rejects the
 * zero-length and non-finite normals that turn into NaN pixels on the GPU.
 */
function inspect(g: THREE.BufferGeometry) {
  const pos = g.attributes.position as THREE.BufferAttribute
  const nor = g.attributes.normal as THREE.BufferAttribute
  const index = g.index
  const count = index ? index.count : pos.count
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const n = new THREE.Vector3()
  const face = new THREE.Vector3()
  let inverted = 0
  let triangles = 0
  for (let i = 0; i < count; i += 3) {
    const ia = index ? index.getX(i) : i
    const ib = index ? index.getX(i + 1) : i + 1
    const ic = index ? index.getX(i + 2) : i + 2
    a.fromBufferAttribute(pos, ia)
    b.fromBufferAttribute(pos, ib)
    c.fromBufferAttribute(pos, ic)
    face.subVectors(b, a).cross(c.sub(a))
    if (face.lengthSq() < 1e-16) continue
    triangles++
    n.fromBufferAttribute(nor, ia).add(b.fromBufferAttribute(nor, ib)).add(c.fromBufferAttribute(nor, ic))
    if (face.dot(n) <= 0) inverted++
  }
  let badNormals = 0
  let badPositions = 0
  for (let i = 0; i < pos.count; i++) {
    n.fromBufferAttribute(nor, i)
    if (!Number.isFinite(n.x + n.y + n.z) || Math.abs(n.length() - 1) > 1e-3) badNormals++
    a.fromBufferAttribute(pos, i)
    if (!Number.isFinite(a.x + a.y + a.z)) badPositions++
  }
  return { triangles, inverted, badNormals, badPositions }
}

function expectSound(g: THREE.BufferGeometry) {
  const report = inspect(g)
  expect(report.triangles).toBeGreaterThan(0)
  expect(report).toMatchObject({ inverted: 0, badNormals: 0, badPositions: 0 })
}

describe('turned parts', () => {
  it('builds an outward-facing closed solid from a counter-clockwise profile', () => {
    expectSound(
      turned(
        [
          [0, 0],
          [1, 0],
          [1, 2],
          [0, 2],
        ],
        24,
      ),
    )
  })

  it('keeps a machined corner hard and a gentle curve smooth', () => {
    const g = turned(
      [
        [1, 0],
        [1, 1],
        [0.5, 1],
      ],
      8,
    )
    const nor = g.attributes.normal as THREE.BufferAttribute
    const normals = new Set<string>()
    for (let i = 0; i < nor.count; i++) normals.add(nor.getY(i).toFixed(3))
    // Wall normals are horizontal, cap normals vertical, and nothing in between.
    expect([...normals].sort()).toEqual(['0.000', '1.000'])
  })

  it('handles a pointed tip without degenerate normals', () => {
    expectSound(
      turned(
        [
          [0, 0],
          [0.07, 0],
          [0.07, 0.03],
          [0.008, 0.33],
          [0, 0.36],
        ],
        20,
      ),
    )
  })

  it('makes chamfered bands, including ones that would over-chamfer', () => {
    expectSound(ringBand(1.36, 0.07, 0.034, 48))
    expectSound(ringBand(1, 0.012, 0.004, 32, 0.001))
    const profile = bandProfile(1, 0.01, 0.01, 0.5)
    for (const [r] of profile) expect(r).toBeGreaterThan(0.99)
  })
})

describe('gears', () => {
  it('has a tooth centred on local angle 0 and the expected tip radius', () => {
    const teeth = 12
    const module = 0.02
    const g = gear({ teeth, module, thickness: 0.04, bore: 0.015, bevel: 0 })
    const pos = g.attributes.position as THREE.BufferAttribute
    const tip = (teeth * module) / 2 + module * 0.95
    let maxRadius = 0
    let reachAtZero = 0
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const r = Math.hypot(x, z)
      maxRadius = Math.max(maxRadius, r)
      if (Math.abs(Math.atan2(-z, x)) < 0.08) reachAtZero = Math.max(reachAtZero, r)
    }
    expect(maxRadius).toBeCloseTo(tip, 4)
    expect(reachAtZero).toBeCloseTo(tip, 4)
  })

  it('lies flat with its axis on Y and is centred through its thickness', () => {
    const g = gear({ teeth: 30, module: 0.02, thickness: 0.03, bore: 0.015, spokes: 5 })
    g.computeBoundingBox()
    const box = g.boundingBox!
    expect(box.max.y).toBeCloseTo(0.015, 4)
    expect(box.min.y).toBeCloseTo(-0.015, 4)
  })

  it('cuts spoke windows, so a spoked wheel has less metal than a solid one', () => {
    const tris = (g: THREE.BufferGeometry) => (g.attributes.position as THREE.BufferAttribute).count / 3
    const solid = gear({ teeth: 48, module: 0.02, thickness: 0.03, bore: 0.04 })
    const spoked = gear({ teeth: 48, module: 0.02, thickness: 0.03, bore: 0.04, spokes: 6, hubRadius: 0.13, rimWidth: 0.05, spokeWidth: 0.04 })
    expect(tris(spoked)).toBeGreaterThan(tris(solid))
    expectSound(spoked)
  })
})

describe('sphere-conforming shells', () => {
  const brass = new THREE.Color('#d3ab5d')
  const steel = new THREE.Color('#4b4e55')

  it('builds a plate with outward outer face, inward inner face and sound edges', () => {
    const mb = new MeshBuilder()
    addShellPatch(mb, {
      lat0: -0.8,
      lat1: -0.2,
      r0: 1.53,
      r1: 1.55,
      half: (t) => 0.12 + 0.08 * t,
      refRadius: 1.53,
      nLat: 10,
      nAz: 6,
      outer: brass,
      inner: steel,
      edge: steel,
    })
    const g = mb.build()
    expectSound(g)
    expect(g.attributes.color.count).toBe(g.attributes.position.count)
  })

  it('keeps an offset inlay strip sound on either side of the centre line', () => {
    for (const side of [-1, 1]) {
      const mb = new MeshBuilder()
      addShellPatch(mb, {
        lat0: -0.6,
        lat1: 0.2,
        r0: 1.55,
        r1: 1.553,
        half: () => 0.005,
        center: (t) => side * 0.1 * t,
        refRadius: 1.53,
        nLat: 6,
        nAz: 1,
        outer: brass,
        edge: brass,
      })
      expectSound(mb.build())
    }
  })

  it('places a point on the sphere at the requested latitude', () => {
    const p = spherePoint(2, Math.PI / 6, 0)
    expect(p.length()).toBeCloseTo(2, 9)
    expect(p.y).toBeCloseTo(1, 9)
  })
})

describe('assembly helpers', () => {
  it('merges indexed and non-indexed parts into one sound geometry', () => {
    const merged = mergeParts([ringBand(0.3, 0.06, 0.06, 24), new THREE.BoxGeometry(0.2, 0.02, 0.02), gear({ teeth: 10, module: 0.02, thickness: 0.03 })])
    expect(merged.index).toBeNull()
    expect(Object.keys(merged.attributes).sort()).toEqual(['normal', 'position'])
    expectSound(merged)
  })

  it('extrudes a tapered bracket with lightening holes', () => {
    const g = plateBracket(
      [
        { x: 1.45, y: 0.6, w: 0.2 },
        { x: 1.5, y: 0.95, w: 0.17 },
        { x: 1.0, y: 1.65, w: 0.1 },
      ],
      0.07,
      [{ t: 0.4, r: 0.04 }],
    )
    g.computeBoundingBox()
    expect(g.boundingBox!.max.z).toBeCloseTo(0.035, 4)
    expect(g.boundingBox!.min.z).toBeCloseTo(-0.035, 4)
    expectSound(g)
  })

  it('spans a rod exactly between two points', () => {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1))
    const a = new THREE.Vector3(1, 0.5, -2)
    const b = new THREE.Vector3(-0.4, 1.7, 0.3)
    spanRod(rod, a, b)
    rod.updateMatrix()
    expect(new THREE.Vector3(0, -0.5, 0).applyMatrix4(rod.matrix).distanceTo(a)).toBeLessThan(1e-6)
    expect(new THREE.Vector3(0, 0.5, 0).applyMatrix4(rod.matrix).distanceTo(b)).toBeLessThan(1e-6)
  })

  it('leaves a rod finite when both ends coincide', () => {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1))
    const p = new THREE.Vector3(1, 1, 1)
    spanRod(rod, p, p.clone())
    expect(Number.isFinite(rod.quaternion.x + rod.quaternion.y + rod.quaternion.z + rod.quaternion.w)).toBe(true)
    expect(rod.scale.y).toBe(0)
  })

  it('agrees with rotation.y about which way a deck angle points', () => {
    const angle = 0.9
    const [x, z] = deckDir(angle, 2)
    const turnedX = new THREE.Vector3(2, 0, 0).applyEuler(new THREE.Euler(0, angle, 0))
    expect(x).toBeCloseTo(turnedX.x, 9)
    expect(z).toBeCloseTo(turnedX.z, 9)
  })

  it('composes instance matrices and stands parts on a sphere', () => {
    const m = matrixFrom([1, 2, 3], [0, Math.PI / 2, 0], [2, 2, 2])
    expect(new THREE.Vector3(1, 0, 0).applyMatrix4(m).distanceTo(new THREE.Vector3(1, 2, 1))).toBeLessThan(1e-6)
    const point = new THREE.Vector3(0, 0, 3)
    const up = new THREE.Vector3(0, 1, 0).applyMatrix4(radialMatrix(point)).sub(point)
    expect(up.distanceTo(new THREE.Vector3(0, 0, 1))).toBeLessThan(1e-6)
  })
})
