import { describe, expect, it } from 'vitest'
import { fourBarJoint, governorArmAngle, governorLift, meshedAngle, pitchRadius, sliderCrank } from '../src/sim/kinematics'

const wrap = (a: number, period: number) => ((a % period) + period) % period

describe('gear meshing', () => {
  it('turns the driven gear the other way, at the tooth ratio', () => {
    const a = meshedAngle(0, 48, 12, 0.7)
    const b = meshedAngle(0.1, 48, 12, 0.7)
    expect(b - a).toBeCloseTo(-0.4, 9)
  })

  it('puts a gap of the driven gear opposite a tooth of the driver', () => {
    for (const [n1, n2, phi] of [
      [48, 12, 0.3],
      [30, 10, -2.6],
      [120, 12, 1.9],
    ]) {
      for (const tooth of [0, 3, 11]) {
        // Driver has a tooth pointing straight at the driven gear.
        const driver = phi + (tooth * Math.PI * 2) / n1
        const driven = meshedAngle(driver, n1, n2, phi)
        // A gap of the driven gear must point back at the driver.
        const pitch = (Math.PI * 2) / n2
        const offset = wrap(phi + Math.PI - driven - pitch / 2, pitch)
        expect(Math.min(offset, pitch - offset)).toBeLessThan(1e-9)
      }
    }
  })

  it('computes pitch radius from teeth and module', () => {
    expect(pitchRadius(48, 0.02)).toBeCloseTo(0.48, 12)
  })
})

describe('slider-crank', () => {
  it('travels between rod - crank and rod + crank', () => {
    const r = 0.17
    const l = 0.42
    let lo = Infinity
    let hi = -Infinity
    for (let a = 0; a < Math.PI * 2; a += 0.01) {
      const d = sliderCrank(a, r, l)
      lo = Math.min(lo, d)
      hi = Math.max(hi, d)
    }
    expect(lo).toBeCloseTo(l - r, 3)
    expect(hi).toBeCloseTo(l + r, 3)
  })

  it('keeps the connecting rod at its length', () => {
    const r = 0.17
    const l = 0.42
    for (let a = 0; a < Math.PI * 2; a += 0.37) {
      const d = sliderCrank(a, r, l)
      const rod = Math.hypot(d - r * Math.cos(a), r * Math.sin(a))
      expect(rod).toBeCloseTo(l, 9)
    }
  })

  it('stays finite when the rod is shorter than the crank', () => {
    expect(Number.isFinite(sliderCrank(Math.PI / 2, 0.5, 0.1))).toBe(true)
  })
})

describe('four-bar linkage', () => {
  const pivot = { x: 0.86, y: -0.4 }
  const centre = { x: 0.59, y: 0.1 }

  it('keeps both links at their lengths through a full crank turn', () => {
    const joint = { x: 0, y: 0 }
    for (let a = 0; a < Math.PI * 2; a += 0.2) {
      const pin = { x: centre.x + 0.05 * Math.cos(a), y: centre.y + 0.05 * Math.sin(a) }
      expect(fourBarJoint(pin, pivot, 0.5, 0.2, joint)).toBe(true)
      expect(Math.hypot(joint.x - pin.x, joint.y - pin.y)).toBeCloseTo(0.5, 9)
      expect(Math.hypot(joint.x - pivot.x, joint.y - pivot.y)).toBeCloseTo(0.2, 9)
    }
  })

  it('stays in one assembly mode, so the rocker never flips', () => {
    const joint = { x: 0, y: 0 }
    let last: { x: number; y: number } | null = null
    for (let a = 0; a < Math.PI * 2; a += 0.05) {
      const pin = { x: centre.x + 0.05 * Math.cos(a), y: centre.y + 0.05 * Math.sin(a) }
      fourBarJoint(pin, pivot, 0.5, 0.2, joint)
      if (last) expect(Math.hypot(joint.x - last.x, joint.y - last.y)).toBeLessThan(0.02)
      last = { ...joint }
    }
  })

  it('reports an unreachable configuration and leaves the output alone', () => {
    const joint = { x: 7, y: 7 }
    expect(fourBarJoint({ x: 0, y: 0 }, { x: 10, y: 0 }, 1, 1, joint)).toBe(false)
    expect(fourBarJoint({ x: 0, y: 0 }, { x: 0, y: 0 }, 1, 1, joint)).toBe(false)
    expect(joint).toEqual({ x: 7, y: 7 })
  })
})

describe('governor', () => {
  it('lifts with speed and saturates below 1', () => {
    expect(governorLift(0, 3)).toBe(0)
    expect(governorLift(3, 3)).toBeGreaterThan(governorLift(1.5, 3))
    expect(governorLift(300, 3)).toBeLessThanOrEqual(1)
    expect(governorLift(-3, 3)).toBeCloseTo(governorLift(3, 3), 12)
  })

  it('opens the arms as lift rises and clamps out-of-range lift', () => {
    expect(governorArmAngle(1)).toBeGreaterThan(governorArmAngle(0))
    expect(governorArmAngle(5)).toBe(governorArmAngle(1))
    expect(governorArmAngle(-5)).toBe(governorArmAngle(0))
    expect(governorArmAngle(1)).toBeLessThan(Math.PI / 2)
  })
})
