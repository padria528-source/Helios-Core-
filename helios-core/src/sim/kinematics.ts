/**
 * Small closed-form mechanism solvers. They keep the regulator honest:
 * gears stay in mesh, connecting rods keep their length.
 */

export interface Point2 {
  x: number
  y: number
}

/** Pitch radius of a spur gear. */
export const pitchRadius = (teeth: number, module: number) => (teeth * module) / 2

/**
 * Angle of a driven gear so its teeth interleave with the driver's.
 * `phi` is the direction from the driver's centre to the driven gear's centre.
 * Both gears are assumed to have a tooth centred on their local angle 0.
 */
export function meshedAngle(driverAngle: number, driverTeeth: number, drivenTeeth: number, phi: number): number {
  return -(driverTeeth / drivenTeeth) * (driverAngle - phi) + phi + Math.PI - Math.PI / drivenTeeth
}

/**
 * Slider-crank: distance from the crank centre to the crosshead, measured
 * along the slide axis, with the crank angle measured from that axis.
 */
export function sliderCrank(crankAngle: number, crankRadius: number, rodLength: number): number {
  const s = crankRadius * Math.sin(crankAngle)
  return crankRadius * Math.cos(crankAngle) + Math.sqrt(Math.max(rodLength * rodLength - s * s, 0))
}

/**
 * Four-bar linkage: finds the joint shared by the connecting rod and the rocker.
 * Of the two circle intersections, returns the one on the left of the line
 * from the crank pin to the rocker pivot, which keeps the linkage in one assembly mode.
 * Returns false if the links cannot reach (the output is left untouched).
 */
export function fourBarJoint(pin: Point2, pivot: Point2, rodLength: number, rockerLength: number, out: Point2): boolean {
  const dx = pivot.x - pin.x
  const dy = pivot.y - pin.y
  const d = Math.hypot(dx, dy)
  if (d < 1e-9 || d > rodLength + rockerLength || d < Math.abs(rodLength - rockerLength)) return false
  const a = (rodLength * rodLength - rockerLength * rockerLength + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(rodLength * rodLength - a * a, 0))
  const mx = pin.x + (a * dx) / d
  const my = pin.y + (a * dy) / d
  out.x = mx - (h * dy) / d
  out.y = my + (h * dx) / d
  return true
}

/** Flyball governor: arm angle from vertical (radians) for a lift of 0..1. */
export const governorArmAngle = (lift: number) => (22 + 44 * Math.min(Math.max(lift, 0), 1)) * (Math.PI / 180)

/** Normalised governor lift for a spin rate, saturating like a real flyball. */
export function governorLift(rate: number, referenceRate: number): number {
  const r = Math.abs(rate) / referenceRate
  return Math.min(Math.max(1 - Math.exp(-1.35 * r * r), 0), 1)
}
