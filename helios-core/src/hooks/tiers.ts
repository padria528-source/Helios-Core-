export type PerformanceTier = 'high' | 'medium' | 'low'

export interface TierSettings {
  dprMax: number
  /** Shadow map edge in pixels; 0 disables real-time shadows. */
  shadowMapSize: number
  dust: number
  motes: number
  bloom: boolean
  /** MSAA samples on the post-processing buffer. */
  multisampling: number
  /** Planar floor reflection (a second scene render). */
  reflection: boolean
  /** Reflection buffer edge in pixels. */
  reflectionResolution: number
  filmGrain: boolean
}

export const TIER_CONFIG: Record<PerformanceTier, TierSettings> = {
  high: {
    dprMax: 1.75,
    shadowMapSize: 2048,
    dust: 260,
    motes: 110,
    bloom: true,
    multisampling: 4,
    reflection: true,
    reflectionResolution: 1024,
    filmGrain: true,
  },
  medium: {
    dprMax: 1.5,
    shadowMapSize: 1024,
    dust: 140,
    motes: 70,
    bloom: true,
    multisampling: 2,
    reflection: false,
    reflectionResolution: 512,
    filmGrain: true,
  },
  low: {
    dprMax: 1.0,
    shadowMapSize: 0,
    dust: 60,
    motes: 36,
    bloom: false,
    multisampling: 0,
    reflection: false,
    reflectionResolution: 256,
    filmGrain: false,
  },
}

const TIERS: readonly PerformanceTier[] = ['high', 'medium', 'low']

export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent))
}

/**
 * A 3x phone screen is not worth the fill-rate, so phones are capped at 1.25
 * whatever the tier. That is also the floor for a phone: the low tier has no
 * post-processing to pay for, and at 1.0 thin rings alias badly on a dense screen.
 */
export const MOBILE_DPR = 1.25

export function dprCap(tier: PerformanceTier, mobile: boolean): number {
  return mobile ? MOBILE_DPR : TIER_CONFIG[tier].dprMax
}

export function tierFromHardware(mobile: boolean, cores: number, memoryGb: number): PerformanceTier {
  if (mobile) return cores >= 8 && memoryGb >= 6 ? 'medium' : 'low'
  if (cores >= 8 && memoryGb >= 8) return 'high'
  if (cores >= 4) return 'medium'
  return 'low'
}

export function parseTierOverride(search: string): PerformanceTier | null {
  const value = new URLSearchParams(search).get('tier')
  return TIERS.includes(value as PerformanceTier) ? (value as PerformanceTier) : null
}

export function detectPerformanceTier(): PerformanceTier {
  if (typeof window === 'undefined') return 'medium'
  const override = parseTierOverride(window.location.search)
  if (override) return override
  const cores = navigator.hardwareConcurrency || 4
  const memory = (navigator as unknown as { deviceMemory?: number }).deviceMemory || 4
  return tierFromHardware(isMobileDevice(), cores, memory)
}

export function lowerTier(tier: PerformanceTier): PerformanceTier {
  return tier === 'high' ? 'medium' : 'low'
}

export function webglSupported(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(window.WebGL2RenderingContext && canvas.getContext('webgl2'))
  } catch {
    return false
  }
}
