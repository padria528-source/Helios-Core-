import * as THREE from 'three'
import { ANATOMY_IDS, type AnatomyId, type SimState } from '../../sim/simulation'

/**
 * The material library. Every finish is created once and shared.
 *
 * Each anatomy group owns its own copy of the five metal finishes. That costs
 * a handful of extra materials and buys the two inspection features: a group
 * can be lifted or dimmed, or faded for X-Ray, without touching its neighbours.
 */

export type Finish = 'brass' | 'polished' | 'steel' | 'black' | 'copper'
export type MetalSet = Record<Finish, THREE.MeshStandardMaterial>

const FINISHES: Record<Finish, { color: string; metalness: number; roughness: number }> = {
  // Antique brass: warm and deep, never lemon yellow.
  brass: { color: '#a9813c', metalness: 1.0, roughness: 0.34 },
  polished: { color: '#d3ab5d', metalness: 1.0, roughness: 0.2 },
  // Gunmetal, not black, so it still reads under a dark sky.
  steel: { color: '#4b4e55', metalness: 0.82, roughness: 0.4 },
  black: { color: '#222327', metalness: 0.7, roughness: 0.52 },
  copper: { color: '#b3623a', metalness: 1.0, roughness: 0.3 },
}

export const PALETTE = {
  brass: new THREE.Color(FINISHES.brass.color),
  polished: new THREE.Color(FINISHES.polished.color),
  steel: new THREE.Color(FINISHES.steel.color),
  black: new THREE.Color(FINISHES.black.color),
  copper: new THREE.Color(FINISHES.copper.color),
  etch: new THREE.Color('#3a2b12'),
  amber: new THREE.Color('#ff9a3c'),
}

interface Tracked {
  material: THREE.MeshStandardMaterial
  base: THREE.Color
  /** Index into ANATOMY_IDS. */
  group: number
  /** Opacity reached at full X-Ray; 1 means the material never fades. */
  minOpacity: number
  /** Emissive added at full X-Ray, for parts X-Ray is meant to reveal. */
  xrayGlow: number
  lastGain: number
  lastEmissive: number
  lastOpacity: number
}

const tracked: Tracked[] = []
const cache = new Map<string, THREE.Material>()
const sets = new Map<AnatomyId, MetalSet>()

function track(material: THREE.MeshStandardMaterial, group: AnatomyId, minOpacity = 1, xrayGlow = 0) {
  tracked.push({
    material,
    base: material.color.clone(),
    group: ANATOMY_IDS.indexOf(group),
    minOpacity,
    xrayGlow,
    lastGain: 1,
    lastEmissive: 0,
    lastOpacity: 1,
  })
}

function makeMetal(finish: Finish): THREE.MeshStandardMaterial {
  const spec = FINISHES[finish]
  const m = new THREE.MeshStandardMaterial({
    color: spec.color,
    metalness: spec.metalness,
    roughness: spec.roughness,
  })
  // The highlight lifts a part with its own colour, so brass glows brass.
  m.emissive.copy(m.color)
  m.emissiveIntensity = 0
  return m
}

/** The five finishes for one anatomy group. */
export function metals(group: AnatomyId): MetalSet {
  const hit = sets.get(group)
  if (hit) return hit
  const set = {} as MetalSet
  for (const finish of Object.keys(FINISHES) as Finish[]) {
    const m = makeMetal(finish)
    m.name = `${group}/${finish}`
    track(m, group)
    set[finish] = m
  }
  sets.set(group, set)
  return set
}

/** A finish that becomes see-through under X-Ray (outer shells, cover plates). */
export function shellMetal(group: AnatomyId, finish: Finish, minOpacity: number): THREE.MeshStandardMaterial {
  const key = `shell:${group}:${finish}:${minOpacity}`
  const hit = cache.get(key) as THREE.MeshStandardMaterial | undefined
  if (hit) return hit
  const m = makeMetal(finish)
  m.name = key
  track(m, group, minOpacity)
  cache.set(key, m)
  return m
}

/** Bearing steel: glows faintly under X-Ray so the pivots can be found. */
export function bearingMetal(group: AnatomyId): THREE.MeshStandardMaterial {
  const key = `bearing:${group}`
  const hit = cache.get(key) as THREE.MeshStandardMaterial | undefined
  if (hit) return hit
  const m = new THREE.MeshStandardMaterial({ color: '#2f3237', metalness: 0.95, roughness: 0.28 })
  m.emissive.copy(PALETTE.amber)
  m.emissiveIntensity = 0
  m.name = key
  track(m, group, 1, 0.55)
  cache.set(key, m)
  return m
}

/** Fin armour: one material, finishes painted per vertex (brass face, steel underside, etched rays). */
export function finMetal(): THREE.MeshStandardMaterial {
  const key = 'fin'
  const hit = cache.get(key) as THREE.MeshStandardMaterial | undefined
  if (hit) return hit
  const m = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    vertexColors: true,
    metalness: 1.0,
    roughness: 0.27,
  })
  m.emissive.copy(PALETTE.brass)
  m.emissiveIntensity = 0
  m.name = key
  track(m, 'fins', 0.12)
  cache.set(key, m)
  return m
}

function once<T extends THREE.Material>(key: string, make: () => T): T {
  const hit = cache.get(key) as T | undefined
  if (hit) return hit
  const m = make()
  m.name = key
  cache.set(key, m)
  return m
}

/** Darkened inlay for engraved lines and scale marks. */
export const etchMaterial = () =>
  once('etch', () => new THREE.MeshStandardMaterial({ color: '#17120a', metalness: 0.5, roughness: 0.62 }))

export const rubyMaterial = () =>
  once(
    'ruby',
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#7a0c1a',
        emissive: '#48030a',
        emissiveIntensity: 0.55,
        roughness: 0.07,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.04,
        ior: 1.76,
      }),
  )

/** Small amber lenses; brightness follows the core. */
export const amberLensMaterial = () =>
  once(
    'amberLens',
    () =>
      new THREE.MeshStandardMaterial({
        color: '#ffab4a',
        emissive: '#ff8a1c',
        emissiveIntensity: 1.2,
        roughness: 0.22,
        metalness: 0,
      }),
  )

export const smokedGlassMaterial = () =>
  once(
    'smokedGlass',
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#120d09',
        transparent: true,
        opacity: 0.38,
        roughness: 0.04,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
        depthWrite: false,
      }),
  )

/** Unlit lamp body; instances carry their own HDR colour. */
export const lampMaterial = () => once('lamp', () => new THREE.MeshBasicMaterial({ color: '#ffffff' }))

/**
 * Applies highlight, dimming and X-Ray to the tracked materials.
 * Called once per frame; it only writes when a value actually changed.
 */
export function updateMaterials(s: SimState): void {
  for (let i = 0; i < tracked.length; i++) {
    const t = tracked[i]
    const hl = s.highlight[t.group]
    const gain = (1 - 0.3 * s.anySelected * (1 - hl)) * (1 + 0.1 * hl)
    if (Math.abs(gain - t.lastGain) > 1e-4) {
      t.material.color.copy(t.base).multiplyScalar(gain)
      t.lastGain = gain
    }

    const emissive = 0.15 * hl + t.xrayGlow * s.xray
    if (Math.abs(emissive - t.lastEmissive) > 1e-4) {
      t.material.emissiveIntensity = emissive
      t.lastEmissive = emissive
    }

    if (t.minOpacity < 1) {
      const opacity = 1 - (1 - t.minOpacity) * s.xray
      if (Math.abs(opacity - t.lastOpacity) > 1e-4) {
        const transparent = opacity < 0.999
        if (t.material.transparent !== transparent) {
          t.material.transparent = transparent
          t.material.depthWrite = !transparent
          t.material.needsUpdate = true
        }
        t.material.opacity = opacity
        t.lastOpacity = opacity
      }
    }
  }
  amberLensMaterial().emissiveIntensity = 0.25 + 1.5 * s.energy
}
