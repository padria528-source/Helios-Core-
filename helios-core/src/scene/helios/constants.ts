import { RING_SPECS } from '../../sim/modes'

/** Master layout of the artifact, in scene units. The floor is y = 0. */

export const DEG = Math.PI / 180

/** Centre of the stellar core. */
export const CORE_Y = 2.85
/** Radius of the amber containment sphere. */
export const GLASS_R = 0.62

/** Top surface of the pedestal, where the regulator lives. */
export const DECK_Y = 0.56

export const RING_OUTER_R = RING_SPECS[3].radius
/** Where the meridian ring meets the axis. */
export const SOUTH_Y = CORE_Y - RING_OUTER_R
export const NORTH_Y = CORE_Y + RING_OUTER_R

export const FIN_COUNT = 6
/** Inner radius of a fin in its closed pose; must clear the ring sphere. */
export const FIN_R = 1.53
export const FIN_THICKNESS = 0.02
export const FIN_LAT0 = -50 * DEG
export const FIN_LAT1 = 27 * DEG
/** Rotates the fin set so the default camera looks through a gap, not at a plate. */
export const FIN_AZIMUTH_OFFSET = -32 * DEG

/** Fin hinge line, relative to the floor. */
export const HINGE_R = FIN_R * Math.cos(FIN_LAT0)
export const HINGE_Y = CORE_Y + FIN_R * Math.sin(FIN_LAT0)

/** Camera aim point and default distance for a landscape viewport. */
export const VIEW_TARGET_Y = 2.56
export const TOP_Y = 5.3
