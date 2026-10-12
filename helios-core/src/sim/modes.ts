/**
 * Operating profiles and the pure mappings that turn the two user-facing
 * controls (output, ring speed) into everything the machine does.
 * Nothing in this file touches three.js or React, so it is unit-tested directly.
 */

export type OperatingMode = 'ignition' | 'stabilizing' | 'radiance' | 'overdrive'

export const MODE_ORDER: readonly OperatingMode[] = ['ignition', 'stabilizing', 'radiance', 'overdrive']

export interface ModeProfile {
  label: string
  /** Commanded core output, 1.0 = nominal. */
  output: number
  /** Gyro ring speed multiplier. */
  ringSpeed: number
  /** Solar fin openness, 0 = shielding the core, 1 = fully retracted. */
  finOpen: number
  /** Energy mote activity multiplier. */
  particles: number
  /** Scales the exhibition lighting slightly so brighter modes feel brighter. */
  lightBoost: number
}

export const MODE_PROFILES: Record<OperatingMode, ModeProfile> = {
  ignition: { label: 'IGNITION', output: 0.45, ringSpeed: 0.35, finOpen: 0.24, particles: 0.35, lightBoost: 0.86 },
  stabilizing: { label: 'STABILIZING', output: 0.7, ringSpeed: 0.65, finOpen: 0.46, particles: 0.62, lightBoost: 0.94 },
  radiance: { label: 'RADIANCE', output: 1.0, ringSpeed: 1.0, finOpen: 0.7, particles: 1.0, lightBoost: 1.0 },
  overdrive: { label: 'OVERDRIVE', output: 1.35, ringSpeed: 1.35, finOpen: 0.9, particles: 1.7, lightBoost: 1.08 },
}

export const DEFAULT_MODE: OperatingMode = 'radiance'

export const OUTPUT_RANGE = { min: 0.35, max: 1.75, default: MODE_PROFILES.radiance.output, step: 0.01 } as const
export const RING_SPEED_RANGE = { min: 0.25, max: 2.0, default: MODE_PROFILES.radiance.ringSpeed, step: 0.01 } as const

export const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

const round2 = (v: number) => Math.round(v * 100) / 100

export const clampOutput = (v: number) =>
  Number.isFinite(v) ? clamp(round2(v), OUTPUT_RANGE.min, OUTPUT_RANGE.max) : OUTPUT_RANGE.default

export const clampRingSpeed = (v: number) =>
  Number.isFinite(v) ? clamp(round2(v), RING_SPEED_RANGE.min, RING_SPEED_RANGE.max) : RING_SPEED_RANGE.default

/* ------------------------------------------------------------------ */
/* Gyro rings                                                          */
/* ------------------------------------------------------------------ */

export type RingMotion = 'precess' | 'nutate' | 'meridian'

export interface RingSpec {
  id: string
  radius: number
  /** Inclination of the ring plane from horizontal, radians. */
  tilt: number
  /** Signed rate at 1.0x, rad/s. For `nutate` this is the oscillation phase rate. */
  rate: number
  motion: RingMotion
  /** Nutation amplitude, radians (only for `nutate`). */
  amplitude: number
}

const DEG = Math.PI / 180

/**
 * Four rings, four different jobs. Signs alternate so neighbours counter-rotate,
 * and no two rates share a simple ratio, so the pattern never visibly repeats.
 */
export const RING_SPECS: readonly RingSpec[] = [
  { id: 'ring01', radius: 0.92, tilt: -36 * DEG, rate: 0.205, motion: 'precess', amplitude: 0 },
  { id: 'ring02', radius: 1.06, tilt: 58 * DEG, rate: -0.128, motion: 'precess', amplitude: 0 },
  { id: 'ring03', radius: 1.2, tilt: 17 * DEG, rate: 0.43, motion: 'nutate', amplitude: 6.5 * DEG },
  { id: 'ring04', radius: 1.36, tilt: 90 * DEG, rate: 0.052, motion: 'meridian', amplitude: 0 },
]

/**
 * Angular rates for the four rings. The speed control scales all of them and
 * keeps their ratios; only the innermost ring also listens to core output,
 * because it sits closest to the heat.
 */
export function ringRates(ringSpeed: number, output: number, out: number[] = [0, 0, 0, 0]): number[] {
  for (let i = 0; i < RING_SPECS.length; i++) {
    const coupling = i === 0 ? 0.82 + 0.18 * output : 1
    out[i] = RING_SPECS[i].rate * ringSpeed * coupling
  }
  return out
}

/* ------------------------------------------------------------------ */
/* Output driven mappings                                              */
/* ------------------------------------------------------------------ */

/** How hard the regulator train runs for a given core output. */
export const regulatorRate = (output: number) => 0.3 + 0.7 * output

/** Fins follow the mode, then trim themselves if the operator overrides output. */
export function finOpenTarget(mode: OperatingMode, output: number): number {
  const p = MODE_PROFILES[mode]
  return clamp(p.finOpen + (output - p.output) * 0.24, 0.05, 1)
}

export function particleTarget(mode: OperatingMode, output: number): number {
  const p = MODE_PROFILES[mode]
  return clamp(p.particles + (output - p.output) * 0.9, 0.15, 2.4)
}

/** Fin pose in radians for an openness value: [hinge, mid joint, tip joint]. */
export function finPose(open: number, out: number[] = [0, 0, 0]): number[] {
  const t = clamp(open, 0, 1)
  out[0] = lerp(-1.5, 23, t) * DEG
  out[1] = lerp(0, 7.5, t) * DEG
  out[2] = lerp(0, 9, t) * DEG
  return out
}

/** Intensity of the point light sitting inside the core. */
export const coreLightIntensity = (energy: number) => 11 * Math.pow(Math.max(energy, 0), 1.25)

/** Number of pedestal indicator lamps lit for a given output. */
export function litIndicatorCount(output: number, total: number): number {
  const t = (output - OUTPUT_RANGE.min) / (OUTPUT_RANGE.max - OUTPUT_RANGE.min)
  return clamp(Math.round(1 + t * (total - 1)), 1, total)
}

/** Smooth, deterministic 1D value noise in [-1, 1]. */
export function noise1(x: number): number {
  const i = Math.floor(x)
  const f = x - i
  const u = f * f * (3 - 2 * f)
  const h = (n: number) => {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
    return (s - Math.floor(s)) * 2 - 1
  }
  return lerp(h(i), h(i + 1), u)
}

/**
 * Core breathing. Three incommensurate sines plus slow noise, so the eye never
 * locks onto a beat. Amplitude grows with output: a hotter core is a less calm one.
 */
export function corePulse(t: number, output: number): number {
  const amp = 0.55 + 0.55 * output
  return (
    1 +
    amp *
      (0.034 * Math.sin(t * 0.7) +
        0.021 * Math.sin(t * 1.9 + 1.3) +
        0.011 * Math.sin(t * 4.3 + 0.4) +
        0.016 * noise1(t * 1.3))
  )
}

/* ------------------------------------------------------------------ */
/* Telemetry (in-world instrumentation, not physics)                   */
/* ------------------------------------------------------------------ */

export type ContainmentStatus = 'DORMANT' | 'NOMINAL' | 'STABLE' | 'ELEVATED' | 'STRAINED'

export function containmentStatus(output: number): ContainmentStatus {
  if (output < 0.2) return 'DORMANT'
  if (output < 0.6) return 'NOMINAL'
  if (output <= 1.12) return 'STABLE'
  if (output <= 1.5) return 'ELEVATED'
  return 'STRAINED'
}

/** Reading on the atelier's own thermal scale. Deliberately not kelvin. */
export const indicatedCoreTemp = (energy: number) => Math.round(1200 + 4580 * Math.pow(Math.max(energy, 0), 0.82))
