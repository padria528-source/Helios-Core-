import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Procedural geometry for the machine. Everything here is built once and cached
 * by the component that asks for it. No DOM access, so it also runs under vitest.
 */

export type ProfilePoint = readonly [r: number, y: number]

const DEG = Math.PI / 180

/* ------------------------------------------------------------------ */
/* Turned (lathe) parts with machined edges                             */
/* ------------------------------------------------------------------ */

/**
 * Revolves a profile around Y. Unlike THREE.LatheGeometry it keeps hard edges
 * hard: adjacent profile segments only share a normal when they meet at less
 * than `smoothAngle` degrees. Chamfers catch light as crisp lines instead of
 * melting into a blob.
 *
 * Walk the profile counter-clockwise in the (r, y) plane (outward along the
 * bottom, up the outside, inward along the top) so normals face out.
 */
export function turned(profile: readonly ProfilePoint[], segments = 64, smoothAngle = 28): THREE.BufferGeometry {
  const segs: { r0: number; y0: number; r1: number; y1: number; nr: number; ny: number }[] = []
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, y0] = profile[i]
    const [r1, y1] = profile[i + 1]
    const dr = r1 - r0
    const dy = y1 - y0
    const len = Math.hypot(dr, dy)
    if (len < 1e-7) continue
    segs.push({ r0, y0, r1, y1, nr: dy / len, ny: -dr / len })
  }

  const cosLimit = Math.cos(smoothAngle * DEG)
  const closed =
    profile.length > 2 &&
    Math.abs(profile[0][0] - profile[profile.length - 1][0]) < 1e-7 &&
    Math.abs(profile[0][1] - profile[profile.length - 1][1]) < 1e-7

  const blend = (a: (typeof segs)[number], b: (typeof segs)[number] | undefined): [number, number] => {
    if (!b || a.nr * b.nr + a.ny * b.ny < cosLimit) return [a.nr, a.ny]
    const nr = a.nr + b.nr
    const ny = a.ny + b.ny
    const len = Math.hypot(nr, ny) || 1
    return [nr / len, ny / len]
  }

  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const ring = segments + 1

  let total = 0
  for (const s of segs) total += Math.hypot(s.r1 - s.r0, s.y1 - s.y0)
  let run = 0

  segs.forEach((s, k) => {
    const prev = k > 0 ? segs[k - 1] : closed ? segs[segs.length - 1] : undefined
    const next = k < segs.length - 1 ? segs[k + 1] : closed ? segs[0] : undefined
    const [n0r, n0y] = blend(s, prev)
    const [n1r, n1y] = blend(s, next)
    const len = Math.hypot(s.r1 - s.r0, s.y1 - s.y0)
    const base = positions.length / 3

    for (let end = 0; end < 2; end++) {
      const r = end === 0 ? s.r0 : s.r1
      const y = end === 0 ? s.y0 : s.y1
      const nr = end === 0 ? n0r : n1r
      const ny = end === 0 ? n0y : n1y
      const v = (run + end * len) / total
      for (let j = 0; j <= segments; j++) {
        const phi = (j / segments) * Math.PI * 2
        const sn = Math.sin(phi)
        const cs = Math.cos(phi)
        positions.push(r * sn, y, r * cs)
        normals.push(nr * sn, ny, nr * cs)
        uvs.push(j / segments, v)
      }
    }
    for (let j = 0; j < segments; j++) {
      const a = base + j
      const b = base + ring + j
      const c = a + 1
      const d = b + 1
      if (s.r0 > 1e-7) indices.push(a, c, b)
      if (s.r1 > 1e-7) indices.push(b, c, d)
    }
    run += len
  })

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.setIndex(indices)
  g.computeBoundingSphere()
  return g
}

/** Closed rectangular band profile with chamfered corners, centred on y = 0. */
export function bandProfile(radius: number, radialWidth: number, height: number, chamfer = 0.006): ProfilePoint[] {
  const ri = radius - radialWidth / 2
  const ro = radius + radialWidth / 2
  const h = height / 2
  const c = Math.min(chamfer, radialWidth / 2.5, height / 2.5)
  return [
    [ri + c, -h],
    [ro - c, -h],
    [ro, -h + c],
    [ro, h - c],
    [ro - c, h],
    [ri + c, h],
    [ri, h - c],
    [ri, -h + c],
    [ri + c, -h],
  ]
}

/** A flat machined ring lying in the XZ plane. */
export const ringBand = (radius: number, radialWidth: number, height: number, segments = 128, chamfer = 0.006) =>
  turned(bandProfile(radius, radialWidth, height, chamfer), segments)

/* ------------------------------------------------------------------ */
/* Gears                                                                */
/* ------------------------------------------------------------------ */

export interface GearOptions {
  teeth: number
  module: number
  thickness: number
  bore?: number
  /** Number of spokes; 0 leaves a solid web. */
  spokes?: number
  hubRadius?: number
  rimWidth?: number
  spokeWidth?: number
  bevel?: number
}

/**
 * Spur gear lying in the XZ plane with its axis on Y and a tooth centred on
 * local angle 0 (+X). Spoked wheels get real windows, so light passes through.
 */
export function gear(opts: GearOptions): THREE.BufferGeometry {
  const { teeth, module: m, thickness } = opts
  const bore = opts.bore ?? 0
  const spokes = opts.spokes ?? 0
  const bevel = opts.bevel ?? 0.003
  const rp = (teeth * m) / 2
  const ro = rp + m * 0.95
  const rr = rp - m * 1.15
  const pitch = (Math.PI * 2) / teeth

  const shape = new THREE.Shape()
  for (let k = 0; k < teeth; k++) {
    const a = k * pitch
    const pts: [number, number][] = [
      [rr, a - pitch * 0.28],
      [ro, a - pitch * 0.13],
      [ro, a + pitch * 0.13],
      [rr, a + pitch * 0.28],
    ]
    pts.forEach(([r, ang], i) => {
      const x = r * Math.cos(ang)
      const y = r * Math.sin(ang)
      if (k === 0 && i === 0) shape.moveTo(x, y)
      else shape.lineTo(x, y)
    })
  }
  shape.closePath()

  if (bore > 0) {
    const hole = new THREE.Path()
    hole.absarc(0, 0, bore, 0, Math.PI * 2, true)
    shape.holes.push(hole)
  }

  if (spokes > 0) {
    const hub = opts.hubRadius ?? Math.max(bore * 2.2, rp * 0.28)
    const rim = rr - (opts.rimWidth ?? m * 1.6)
    const sw = opts.spokeWidth ?? m * 1.5
    if (rim - hub > m) {
      const span = (Math.PI * 2) / spokes
      const mo = sw / (2 * rim)
      const mi = sw / (2 * hub)
      for (let k = 0; k < spokes; k++) {
        // Spokes sit on multiples of `span`; each window fills the gap between two.
        const a0 = k * span
        const win = new THREE.Path()
        win.absarc(0, 0, rim, a0 + mo, a0 + span - mo, false)
        win.absarc(0, 0, hub, a0 + span - mi, a0 + mi, true)
        win.closePath()
        shape.holes.push(win)
      }
    }
  }

  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(thickness - bevel * 2, 0.001),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 1,
    curveSegments: 10,
  })
  g.translate(0, 0, -Math.max(thickness - bevel * 2, 0.001) / 2)
  g.rotateX(-Math.PI / 2)
  g.computeBoundingSphere()
  return g
}

/* ------------------------------------------------------------------ */
/* Sphere-conforming shells (solar fins)                                */
/* ------------------------------------------------------------------ */

export function spherePoint(radius: number, lat: number, az: number, out = new THREE.Vector3()): THREE.Vector3 {
  const c = Math.cos(lat)
  return out.set(radius * c * Math.cos(az), radius * Math.sin(lat), radius * c * Math.sin(az))
}

/** Accumulates coloured triangles; used for parts that mix several finishes in one draw call. */
export class MeshBuilder {
  positions: number[] = []
  normals: number[] = []
  colors: number[] = []
  indices: number[] = []

  vertex(p: THREE.Vector3, n: THREE.Vector3, color: THREE.Color): number {
    this.positions.push(p.x, p.y, p.z)
    this.normals.push(n.x, n.y, n.z)
    this.colors.push(color.r, color.g, color.b)
    return this.positions.length / 3 - 1
  }

  /** Flat quad a-b-c-d; winding is corrected so the face normal agrees with `facing`. */
  flatQuad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, facing: THREE.Vector3, color: THREE.Color) {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a))
    if (n.lengthSq() < 1e-14) n.subVectors(c, b).cross(new THREE.Vector3().subVectors(d, b))
    n.normalize()
    const flip = n.dot(facing) < 0
    if (flip) n.negate()
    const ia = this.vertex(a, n, color)
    const ib = this.vertex(b, n, color)
    const ic = this.vertex(c, n, color)
    const id = this.vertex(d, n, color)
    if (flip) this.indices.push(ia, id, ic, ia, ic, ib)
    else this.indices.push(ia, ib, ic, ia, ic, id)
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3))
    g.setIndex(this.indices)
    g.computeBoundingSphere()
    return g
  }
}

export interface ShellPatch {
  /** Latitude range in radians. */
  lat0: number
  lat1: number
  /** Inner and outer radius. */
  r0: number
  r1: number
  /** Half width in arc units along the patch, t = 0..1. */
  half: (t: number) => number
  /** Lateral offset of the centre line in arc units. */
  center?: (t: number) => number
  /** Radius used to turn arc units into azimuth, so stacked patches line up. */
  refRadius: number
  nLat: number
  nAz: number
  outer?: THREE.Color | null
  inner?: THREE.Color | null
  edge?: THREE.Color | null
}

/**
 * Adds a curved slab that follows a sphere: a plate, a rib or an inlay line,
 * depending on its proportions. Its plan outline is a strip of varying width.
 */
export function addShellPatch(mb: MeshBuilder, p: ShellPatch): void {
  const { lat0, lat1, r0, r1, nLat, nAz, refRadius } = p
  const center = p.center ?? (() => 0)
  const lat = (t: number) => lat0 + (lat1 - lat0) * t
  const az = (t: number, u: number) => (center(t) + u * p.half(t)) / (refRadius * Math.cos(lat(t)))
  const pos = new THREE.Vector3()
  const nrm = new THREE.Vector3()

  const grid = (radius: number, sign: number, color: THREE.Color) => {
    const base = mb.positions.length / 3
    for (let i = 0; i <= nLat; i++) {
      const t = i / nLat
      for (let j = 0; j <= nAz; j++) {
        const u = (j / nAz) * 2 - 1
        spherePoint(radius, lat(t), az(t, u), pos)
        nrm.copy(pos).normalize().multiplyScalar(sign)
        mb.vertex(pos, nrm, color)
      }
    }
    const row = nAz + 1
    for (let i = 0; i < nLat; i++) {
      for (let j = 0; j < nAz; j++) {
        const a = base + i * row + j
        const b = a + row
        const c = a + 1
        const d = b + 1
        if (sign > 0) mb.indices.push(a, b, c, b, d, c)
        else mb.indices.push(a, c, b, b, c, d)
      }
    }
  }

  if (p.outer) grid(r1, 1, p.outer)
  if (p.inner) grid(r0, -1, p.inner)

  if (p.edge) {
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    const c = new THREE.Vector3()
    const d = new THREE.Vector3()
    const facing = new THREE.Vector3()
    // Long sides.
    for (const u of [-1, 1]) {
      for (let i = 0; i < nLat; i++) {
        const t0 = i / nLat
        const t1 = (i + 1) / nLat
        spherePoint(r0, lat(t0), az(t0, u), a)
        spherePoint(r1, lat(t0), az(t0, u), b)
        spherePoint(r1, lat(t1), az(t1, u), c)
        spherePoint(r0, lat(t1), az(t1, u), d)
        const azm = az((t0 + t1) / 2, u)
        facing.set(-Math.sin(azm), 0, Math.cos(azm)).multiplyScalar(u)
        mb.flatQuad(a.clone(), b.clone(), c.clone(), d.clone(), facing, p.edge)
      }
    }
    // Ends.
    for (const t of [0, 1]) {
      for (let j = 0; j < nAz; j++) {
        const u0 = (j / nAz) * 2 - 1
        const u1 = ((j + 1) / nAz) * 2 - 1
        spherePoint(r0, lat(t), az(t, u0), a)
        spherePoint(r1, lat(t), az(t, u0), b)
        spherePoint(r1, lat(t), az(t, u1), c)
        spherePoint(r0, lat(t), az(t, u1), d)
        const azm = az(t, (u0 + u1) / 2)
        const l = lat(t)
        facing.set(-Math.sin(l) * Math.cos(azm), Math.cos(l), -Math.sin(l) * Math.sin(azm)).multiplyScalar(t === 0 ? -1 : 1)
        mb.flatQuad(a.clone(), b.clone(), c.clone(), d.clone(), facing, p.edge)
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                        */
/* ------------------------------------------------------------------ */

/** Merges parts into one draw call, normalising index/attribute layout first. */
export function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const prepared = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p.clone()
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal') g.deleteAttribute(name)
    }
    return g
  })
  const merged = mergeGeometries(prepared, false)
  prepared.forEach((g) => g.dispose())
  if (!merged) throw new Error('mergeParts: incompatible geometries')
  merged.computeBoundingSphere()
  return merged
}

/** Returns a transformed copy; convenient when assembling merged parts. */
export function placed(
  geometry: THREE.BufferGeometry,
  position: readonly [number, number, number] = [0, 0, 0],
  rotation: readonly [number, number, number] = [0, 0, 0],
  scale: readonly [number, number, number] = [1, 1, 1],
): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(...scale),
  )
  return geometry.clone().applyMatrix4(m)
}

/** Tube along a smooth path through the given points. */
export function pipe(points: readonly (readonly [number, number, number])[], radius: number, tubular = 48, radial = 8, closed = false) {
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
    closed,
    'catmullrom',
    0.5,
  )
  return new THREE.TubeGeometry(curve, tubular, radius, radial, closed)
}

/** Flat Archimedean spiral in the XZ plane, e.g. a balance hairspring. */
export function spiral(turns: number, rInner: number, rOuter: number, radius: number): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = []
  const steps = Math.ceil(turns * 28)
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const a = t * turns * Math.PI * 2
    const r = rInner + (rOuter - rInner) * t
    pts.push(new THREE.Vector3(r * Math.cos(a), 0, -r * Math.sin(a)))
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), steps * 2, radius, 5, false)
}

/** Helical coil around Y. */
export function coil(turns: number, radius: number, height: number, wire: number): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = []
  const steps = Math.ceil(turns * 20)
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const a = t * turns * Math.PI * 2
    pts.push(new THREE.Vector3(radius * Math.cos(a), t * height, -radius * Math.sin(a)))
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), steps * 2, wire, 6, false)
}

/**
 * Tapered bracket cut from plate: a centre line with a width at each station,
 * lightening holes, then extruded. Lies in the XY plane, thickness along Z.
 */
export function plateBracket(
  stations: readonly { x: number; y: number; w: number }[],
  thickness: number,
  holes: readonly { t: number; r: number }[] = [],
  bevel = 0.006,
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(
    stations.map((s) => new THREE.Vector3(s.x, s.y, 0)),
    false,
    'catmullrom',
    0.5,
  )
  const n = 28
  const left: THREE.Vector2[] = []
  const right: THREE.Vector2[] = []
  const p = new THREE.Vector3()
  const tan = new THREE.Vector3()
  const widthAt = (t: number) => {
    const f = t * (stations.length - 1)
    const i = Math.min(Math.floor(f), stations.length - 2)
    return stations[i].w + (stations[i + 1].w - stations[i].w) * (f - i)
  }
  for (let i = 0; i <= n; i++) {
    const t = i / n
    curve.getPoint(t, p)
    curve.getTangent(t, tan)
    const w = widthAt(t) / 2
    left.push(new THREE.Vector2(p.x - tan.y * w, p.y + tan.x * w))
    right.push(new THREE.Vector2(p.x + tan.y * w, p.y - tan.x * w))
  }
  const shape = new THREE.Shape([...left, ...right.reverse()])
  for (const h of holes) {
    curve.getPoint(h.t, p)
    const hole = new THREE.Path()
    hole.absarc(p.x, p.y, h.r, 0, Math.PI * 2, true)
    shape.holes.push(hole)
  }
  const depth = Math.max(thickness - bevel * 2, 0.001)
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 1,
    curveSegments: 16,
  })
  g.translate(0, 0, -depth / 2)
  g.computeBoundingSphere()
  return g
}

/* ------------------------------------------------------------------ */
/* Instancing helpers                                                   */
/* ------------------------------------------------------------------ */

const _p = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _s = new THREE.Vector3()
const _e = new THREE.Euler()
const _up = new THREE.Vector3(0, 1, 0)
const _dir = new THREE.Vector3()

export function matrixFrom(
  position: readonly [number, number, number],
  rotation: readonly [number, number, number] = [0, 0, 0],
  scale: readonly [number, number, number] | number = 1,
): THREE.Matrix4 {
  _p.set(position[0], position[1], position[2])
  _q.setFromEuler(_e.set(rotation[0], rotation[1], rotation[2]))
  if (typeof scale === 'number') _s.setScalar(scale)
  else _s.set(scale[0], scale[1], scale[2])
  return new THREE.Matrix4().compose(_p, _q, _s)
}

/** Matrix that stands a unit-height Y-axis part on a sphere, pointing along the radius. */
export function radialMatrix(point: THREE.Vector3, scale: readonly [number, number, number] | number = 1, twist = 0): THREE.Matrix4 {
  _dir.copy(point).normalize()
  _q.setFromUnitVectors(_up, _dir)
  if (twist !== 0) _q.multiply(new THREE.Quaternion().setFromAxisAngle(_up, twist))
  if (typeof scale === 'number') _s.setScalar(scale)
  else _s.set(scale[0], scale[1], scale[2])
  return new THREE.Matrix4().compose(point, _q, _s)
}

/**
 * Poses a unit-height, Y-axis cylinder so it spans from `a` to `b`.
 * Allocation free: safe to call every frame for linkages.
 */
export function spanRod(object: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3): void {
  _dir.subVectors(b, a)
  const len = _dir.length()
  object.position.copy(a).addScaledVector(_dir, 0.5)
  if (len > 1e-6) object.quaternion.setFromUnitVectors(_up, _dir.multiplyScalar(1 / len))
  object.scale.y = len
}

/** Direction on the deck plane for an angle, matching the sense of `rotation.y`. */
export const deckDir = (angle: number, radius = 1): [number, number] => [radius * Math.cos(angle), -radius * Math.sin(angle)]
