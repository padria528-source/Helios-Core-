import { describe, expect, it } from 'vitest'
import { TIER_CONFIG, detectPerformanceTier, dprCap, lowerTier, parseTierOverride, tierFromHardware } from '../src/hooks/tiers'
import { FOCUS, defaultPose, fitDistance, viewLift } from '../src/controls/framing'
import { ANATOMY_IDS } from '../src/sim/simulation'

describe('performance tiers', () => {
  it('spends less on each lower tier', () => {
    const { high, medium, low } = TIER_CONFIG
    expect(high.dprMax).toBeGreaterThan(medium.dprMax)
    expect(medium.dprMax).toBeGreaterThan(low.dprMax)
    expect(high.dust).toBeGreaterThan(medium.dust)
    expect(medium.dust).toBeGreaterThan(low.dust)
    expect(high.shadowMapSize).toBeGreaterThan(medium.shadowMapSize)
    expect(low.shadowMapSize).toBe(0)
    expect(low.bloom).toBe(false)
    expect(low.reflection).toBe(false)
    expect(low.dprMax).toBe(1)
  })

  it('caps phone pixel ratio well below native, on every tier', () => {
    for (const tier of ['high', 'medium', 'low'] as const) {
      expect(dprCap(tier, true)).toBe(1.25)
      expect(dprCap(tier, false)).toBe(TIER_CONFIG[tier].dprMax)
    }
  })

  it('maps hardware to a tier, and never gives a phone the high tier', () => {
    expect(tierFromHardware(false, 16, 16)).toBe('high')
    expect(tierFromHardware(false, 4, 4)).toBe('medium')
    expect(tierFromHardware(false, 2, 2)).toBe('low')
    expect(tierFromHardware(true, 8, 8)).toBe('medium')
    expect(tierFromHardware(true, 4, 4)).toBe('low')
    expect(tierFromHardware(true, 32, 32)).not.toBe('high')
  })

  it('reads a valid ?tier= override and ignores anything else', () => {
    expect(parseTierOverride('?tier=low')).toBe('low')
    expect(parseTierOverride('?tier=high&x=1')).toBe('high')
    expect(parseTierOverride('?tier=ultra')).toBeNull()
    expect(parseTierOverride('')).toBeNull()
  })

  it('only ever steps down, and stops at low', () => {
    expect(lowerTier('high')).toBe('medium')
    expect(lowerTier('medium')).toBe('low')
    expect(lowerTier('low')).toBe('low')
  })

  it('falls back to medium where there is no window', () => {
    expect(detectPerformanceTier()).toBe('medium')
  })
})

describe('camera framing', () => {
  it('stands further back for a narrow viewport than for a wide one', () => {
    expect(fitDistance(390 / 844)).toBeGreaterThan(fitDistance(16 / 9))
    expect(fitDistance(16 / 9)).toBeCloseTo(fitDistance(21 / 9), 6)
  })

  it('opens on a three-quarter angle slightly above the horizon', () => {
    const pose = defaultPose(1.6)
    expect(pose.theta).toBeGreaterThan(0.2)
    expect(pose.theta).toBeLessThan(0.9)
    expect(pose.phi).toBeLessThan(Math.PI / 2)
    expect(pose.phi).toBeGreaterThan(1.1)
  })

  it('has a closer, in-range focus pose for every anatomy part', () => {
    for (const id of ANATOMY_IDS) {
      expect(FOCUS[id].scale).toBeGreaterThan(0.3)
      expect(FOCUS[id].scale).toBeLessThan(1)
      expect(FOCUS[id].phi).toBeGreaterThan(0.32)
      expect(FOCUS[id].phi).toBeLessThan(1.6)
    }
  })

  it('lifts the image more on a phone when a sheet is open', () => {
    expect(viewLift(0.46, 'interact')).toBeGreaterThan(viewLift(0.46, 'observe'))
    expect(viewLift(1.6, 'interact')).toBe(viewLift(1.6, 'observe'))
  })
})
