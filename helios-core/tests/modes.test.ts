import { describe, expect, it } from 'vitest'
import {
  MODE_ORDER,
  MODE_PROFILES,
  OUTPUT_RANGE,
  RING_SPEED_RANGE,
  RING_SPECS,
  clampOutput,
  clampRingSpeed,
  containmentStatus,
  coreLightIntensity,
  corePulse,
  finOpenTarget,
  finPose,
  indicatedCoreTemp,
  litIndicatorCount,
  particleTarget,
  regulatorRate,
  ringRates,
} from '../src/sim/modes'

describe('control ranges', () => {
  it('clamps output to its range', () => {
    expect(clampOutput(-5)).toBe(OUTPUT_RANGE.min)
    expect(clampOutput(99)).toBe(OUTPUT_RANGE.max)
    expect(clampOutput(1.234)).toBe(1.23)
  })

  it('clamps ring speed to its range', () => {
    expect(clampRingSpeed(0)).toBe(RING_SPEED_RANGE.min)
    expect(clampRingSpeed(7)).toBe(RING_SPEED_RANGE.max)
  })

  it('falls back to the default for non-numbers', () => {
    expect(clampOutput(Number.NaN)).toBe(OUTPUT_RANGE.default)
    expect(clampRingSpeed(Number.POSITIVE_INFINITY)).toBe(RING_SPEED_RANGE.default)
  })
})

describe('operating modes', () => {
  it('escalates output, ring speed, fin openness and particles from ignition to overdrive', () => {
    for (let i = 1; i < MODE_ORDER.length; i++) {
      const prev = MODE_PROFILES[MODE_ORDER[i - 1]]
      const next = MODE_PROFILES[MODE_ORDER[i]]
      expect(next.output).toBeGreaterThan(prev.output)
      expect(next.ringSpeed).toBeGreaterThan(prev.ringSpeed)
      expect(next.finOpen).toBeGreaterThan(prev.finOpen)
      expect(next.particles).toBeGreaterThan(prev.particles)
    }
  })

  it('keeps every preset inside the control ranges', () => {
    for (const mode of MODE_ORDER) {
      const p = MODE_PROFILES[mode]
      expect(clampOutput(p.output)).toBe(p.output)
      expect(clampRingSpeed(p.ringSpeed)).toBe(p.ringSpeed)
      expect(p.finOpen).toBeGreaterThanOrEqual(0)
      expect(p.finOpen).toBeLessThanOrEqual(1)
    }
  })

  it('returns the preset fin openness at the preset output, and trims with manual output', () => {
    for (const mode of MODE_ORDER) {
      const p = MODE_PROFILES[mode]
      expect(finOpenTarget(mode, p.output)).toBeCloseTo(p.finOpen, 6)
    }
    expect(finOpenTarget('radiance', 1.6)).toBeGreaterThan(MODE_PROFILES.radiance.finOpen)
    expect(finOpenTarget('radiance', 0.4)).toBeLessThan(MODE_PROFILES.radiance.finOpen)
    expect(finOpenTarget('overdrive', OUTPUT_RANGE.max)).toBeLessThanOrEqual(1)
    expect(finOpenTarget('ignition', OUTPUT_RANGE.min)).toBeGreaterThan(0)
  })

  it('raises particle activity with output', () => {
    expect(particleTarget('radiance', 1.5)).toBeGreaterThan(particleTarget('radiance', 1.0))
    expect(particleTarget('ignition', OUTPUT_RANGE.min)).toBeGreaterThan(0)
  })
})

describe('gyro rings', () => {
  it('has four rings on four distinct radii', () => {
    const radii = RING_SPECS.map((r) => r.radius)
    expect(radii).toHaveLength(4)
    expect(new Set(radii).size).toBe(4)
    // Enough clearance that neighbouring bands can never touch.
    for (let i = 1; i < radii.length; i++) expect(radii[i] - radii[i - 1]).toBeGreaterThan(0.1)
  })

  it('counter-rotates the two precessing rings at different speeds', () => {
    const [r1, r2] = ringRates(1, 1)
    expect(Math.sign(r1)).not.toBe(Math.sign(r2))
    expect(Math.abs(r1)).not.toBeCloseTo(Math.abs(r2), 2)
  })

  it('never gives two rings the same angular speed', () => {
    const rates = ringRates(1, 1).map(Math.abs)
    expect(new Set(rates.map((r) => r.toFixed(4))).size).toBe(rates.length)
  })

  it('scales with the speed control while keeping the ratios between rings', () => {
    const slow = ringRates(0.5, 1)
    const fast = ringRates(2, 1)
    for (let i = 0; i < slow.length; i++) expect(fast[i] / slow[i]).toBeCloseTo(4, 6)
  })

  it('couples only the innermost ring to core output', () => {
    const cool = ringRates(1, 0.5)
    const hot = ringRates(1, 1.5)
    expect(Math.abs(hot[0])).toBeGreaterThan(Math.abs(cool[0]))
    for (let i = 1; i < cool.length; i++) expect(hot[i]).toBeCloseTo(cool[i], 9)
  })
})

describe('output mappings', () => {
  it('drives the regulator, the core light and the fins monotonically', () => {
    expect(regulatorRate(1.5)).toBeGreaterThan(regulatorRate(0.5))
    expect(coreLightIntensity(1.5)).toBeGreaterThan(coreLightIntensity(0.5))
    expect(coreLightIntensity(0)).toBe(0)
    expect(coreLightIntensity(-1)).toBe(0)
    const closed = finPose(0)
    const open = finPose(1)
    for (let i = 0; i < 3; i++) expect(open[i]).toBeGreaterThan(closed[i])
  })

  it('clamps fin pose input', () => {
    expect(finPose(9)).toEqual(finPose(1))
    expect(finPose(-9)).toEqual(finPose(0))
  })

  it('lights between one and all indicator lamps', () => {
    expect(litIndicatorCount(OUTPUT_RANGE.min, 24)).toBe(1)
    expect(litIndicatorCount(OUTPUT_RANGE.max, 24)).toBe(24)
    expect(litIndicatorCount(-10, 24)).toBe(1)
    expect(litIndicatorCount(10, 24)).toBe(24)
    expect(litIndicatorCount(1.2, 24)).toBeGreaterThan(litIndicatorCount(0.6, 24))
  })

  it('breathes within a narrow, non-negative band', () => {
    for (let t = 0; t < 120; t += 0.37) {
      for (const output of [OUTPUT_RANGE.min, 1, OUTPUT_RANGE.max]) {
        const p = corePulse(t, output)
        expect(p).toBeGreaterThan(0.85)
        expect(p).toBeLessThan(1.15)
      }
    }
  })

  it('pulses harder at higher output', () => {
    const spread = (output: number) => {
      let lo = Infinity
      let hi = -Infinity
      for (let t = 0; t < 200; t += 0.11) {
        const p = corePulse(t, output)
        lo = Math.min(lo, p)
        hi = Math.max(hi, p)
      }
      return hi - lo
    }
    expect(spread(1.6)).toBeGreaterThan(spread(0.4))
  })
})

describe('telemetry', () => {
  it('names containment by output band', () => {
    expect(containmentStatus(0)).toBe('DORMANT')
    expect(containmentStatus(0.45)).toBe('NOMINAL')
    expect(containmentStatus(1)).toBe('STABLE')
    expect(containmentStatus(1.35)).toBe('ELEVATED')
    expect(containmentStatus(1.75)).toBe('STRAINED')
  })

  it('reports a finite, rising instrument temperature', () => {
    expect(indicatedCoreTemp(1.5)).toBeGreaterThan(indicatedCoreTemp(0.5))
    expect(Number.isFinite(indicatedCoreTemp(-3))).toBe(true)
  })
})
