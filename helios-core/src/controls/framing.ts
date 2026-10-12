import { CORE_Y, DEG, TOP_Y, VIEW_TARGET_Y } from '../scene/helios/constants'
import type { AnatomyId } from '../sim/simulation'
import type { ViewId } from '../store/experienceStore'

/**
 * Where the camera stands. Pure numbers, no three.js or React, so the framing
 * rules can be tested on their own.
 */

export const CAMERA_FOV = 38
const ARTIFACT_WIDTH = 4.3

export interface CameraPose {
  /** Azimuth around Y, measured from +Z toward +X. */
  theta: number
  /** Polar angle from +Y. */
  phi: number
  radius: number
  targetY: number
}

/** Distance that frames the whole artifact for a given viewport shape. */
export function fitDistance(aspect: number): number {
  const tanHalf = Math.tan((CAMERA_FOV / 2) * DEG)
  const portrait = aspect < 0.85
  const heightShare = portrait ? 0.54 : 0.61
  const widthShare = portrait ? 0.94 : 0.5
  const byHeight = TOP_Y / heightShare / (2 * tanHalf)
  const byWidth = ARTIFACT_WIDTH / widthShare / (2 * tanHalf * aspect)
  return Math.max(byHeight, byWidth)
}

/** Three-quarter product angle, a little above the core. */
export function defaultPose(aspect: number): CameraPose {
  return { theta: 28 * DEG, phi: 79 * DEG, radius: fitDistance(aspect), targetY: VIEW_TARGET_Y }
}

/** Where the camera settles when a part is selected in the anatomy panel. */
export const FOCUS: Record<AnatomyId, { targetY: number; scale: number; phi: number }> = {
  fins: { targetY: 2.5, scale: 0.8, phi: 80 * DEG },
  rings: { targetY: CORE_Y, scale: 0.68, phi: 75 * DEG },
  core: { targetY: CORE_Y, scale: 0.46, phi: 82 * DEG },
  regulator: { targetY: 0.98, scale: 0.47, phi: 58 * DEG },
  anchor: { targetY: 0.95, scale: 0.63, phi: 74 * DEG },
}

/** Fraction of the viewport height to lift the image by, so the artifact sits clear of the interface. */
export function viewLift(aspect: number, view: ViewId): number {
  if (aspect < 0.85) return view === 'observe' ? 0.02 : 0.085
  return 0.04
}
