import { describe, expect, it } from 'vitest'
import { MODE_PROFILES } from '../src/sim/modes'
import { ANATOMY_IDS, INTRO_DURATION, createSimState, damp, stepSimulation, type SimInputs, type SimState } from '../src/sim/simulation'

const FRAME = 1 / 60

const inputs = (over: Partial<SimInputs> = {}): SimInputs => ({
  coreOutput: MODE_PROFILES.radiance.output,
  ringSpeed: MODE_PROFILES.radiance.ringSpeed,
  mode: 'radiance',
  xray: false,
  paused: false,
  selected: -1,
  reducedMotion: false,
  started: true,
  ...over,
})

function run(s: SimState, inp: SimInputs, seconds: number) {
  const steps = Math.round(seconds / FRAME)
  for (let i = 0; i < steps; i++) stepSimulation(s, inp, FRAME)
}

/** A machine that has finished its intro and settled in RADIANCE. */
function settled(): SimState {
  const s = createSimState()
  run(s, inputs(), 14)
  return s
}

describe('damp', () => {
  it('approaches the target without overshooting, independent of step size', () => {
    let coarse = 0
    let fine = 0
    for (let i = 0; i < 10; i++) coarse = damp(coarse, 1, 3, 0.1)
    for (let i = 0; i < 100; i++) fine = damp(fine, 1, 3, 0.01)
    expect(coarse).toBeLessThan(1)
    expect(coarse).toBeCloseTo(fine, 6)
  })
})

describe('start-up', () => {
  it('stays dark until the scene is ready', () => {
    const s = createSimState()
    run(s, inputs({ started: false }), 3)
    expect(s.energy).toBe(0)
    expect(s.introT).toBe(0)
    expect(s.introDone).toBe(false)
  })

  it('ignites the core before the mechanism spins up', () => {
    const s = createSimState()
    run(s, inputs(), 1.6)
    expect(s.ignite).toBeGreaterThan(0.5)
    expect(s.spin).toBe(0)
    expect(s.introDone).toBe(false)
  })

  it('finishes the intro on schedule and reaches the commanded state', () => {
    const s = createSimState()
    run(s, inputs(), INTRO_DURATION + 0.05)
    expect(s.introDone).toBe(true)
    run(s, inputs(), 12)
    expect(s.ignite).toBe(1)
    expect(s.spin).toBe(1)
    expect(s.output).toBeCloseTo(1, 3)
    expect(s.ringSpeed).toBeCloseTo(1, 3)
    expect(s.finOpen).toBeCloseTo(MODE_PROFILES.radiance.finOpen, 2)
  })

  it('collapses the intro for reduced motion', () => {
    const s = createSimState()
    run(s, inputs({ reducedMotion: true }), 1)
    expect(s.introDone).toBe(true)
  })
})

describe('mode changes', () => {
  it('answers in order: core, then rings, then fins', () => {
    const s = settled()
    const from = { output: s.output, ring: s.ringSpeed, fin: s.finOpen }
    const target = MODE_PROFILES.overdrive
    const inp = inputs({ mode: 'overdrive', coreOutput: target.output, ringSpeed: target.ringSpeed })
    run(s, inp, 0.5)
    const progress = (now: number, start: number, end: number) => (now - start) / (end - start)
    const core = progress(s.output, from.output, target.output)
    const rings = progress(s.ringSpeed, from.ring, target.ringSpeed)
    const fins = progress(s.finOpen, from.fin, target.finOpen)
    expect(core).toBeGreaterThan(rings)
    expect(rings).toBeGreaterThan(fins)
    expect(fins).toBeGreaterThan(0)
  })

  it('settles on the new profile without overshoot', () => {
    const s = settled()
    const target = MODE_PROFILES.overdrive
    const inp = inputs({ mode: 'overdrive', coreOutput: target.output, ringSpeed: target.ringSpeed })
    let peak = 0
    for (let i = 0; i < 600; i++) {
      stepSimulation(s, inp, FRAME)
      peak = Math.max(peak, s.output)
    }
    expect(peak).toBeLessThanOrEqual(target.output + 1e-9)
    expect(s.output).toBeCloseTo(target.output, 3)
    expect(s.finOpen).toBeCloseTo(target.finOpen, 2)
  })

  it('never lets core energy go negative or non-finite across the whole control range', () => {
    const s = settled()
    for (const coreOutput of [0.35, 1.75, 0.35, 1.0]) {
      for (let i = 0; i < 240; i++) {
        stepSimulation(s, inputs({ coreOutput }), FRAME)
        expect(Number.isFinite(s.energy)).toBe(true)
        expect(s.energy).toBeGreaterThan(0)
      }
    }
  })
})

describe('pause', () => {
  it('coasts the mechanism to a stop and holds it there', () => {
    const s = settled()
    run(s, inputs({ paused: true }), 4)
    expect(s.motion).toBe(0)
    const held = { rings: [...s.ringPhase], drive: s.drive, balance: s.balancePhase, time: s.time, fin: s.finOpen }
    run(s, inputs({ paused: true }), 3)
    expect(s.ringPhase).toEqual(held.rings)
    expect(s.drive).toBe(held.drive)
    expect(s.balancePhase).toBe(held.balance)
    expect(s.time).toBe(held.time)
    expect(s.finOpen).toBe(held.fin)
    expect(s.ringRate.every((r) => r === 0)).toBe(true)
  })

  it('keeps a residual shimmer in the core while held', () => {
    const s = settled()
    run(s, inputs({ paused: true }), 4)
    const before = s.plasmaTime
    run(s, inputs({ paused: true }), 2)
    expect(s.plasmaTime).toBeGreaterThan(before)
    expect(s.plasmaTime - before).toBeLessThan(0.2)
    expect(s.energy).toBeGreaterThan(0.5)
  })

  it('drops the governor while held and lifts it again on resume', () => {
    const s = settled()
    const running = s.governorLift
    run(s, inputs({ paused: true }), 5)
    expect(s.governorLift).toBeLessThan(running * 0.2)
    run(s, inputs(), 6)
    expect(s.governorLift).toBeCloseTo(running, 2)
  })

  it('resumes from where it stopped, with no jump', () => {
    const s = settled()
    run(s, inputs({ paused: true }), 4)
    const held = s.ringPhase[0]
    stepSimulation(s, inputs(), FRAME)
    expect(Math.abs(s.ringPhase[0] - held)).toBeLessThan(0.001)
  })

  it('holds fin motion commanded during a pause until the mechanism runs again', () => {
    const s = settled()
    run(s, inputs({ paused: true }), 4)
    const held = s.finOpen
    const target = MODE_PROFILES.ignition
    run(s, inputs({ paused: true, mode: 'ignition', coreOutput: target.output, ringSpeed: target.ringSpeed }), 3)
    expect(s.finOpen).toBe(held)
    // The glow still follows the control.
    expect(s.output).toBeCloseTo(target.output, 2)
  })
})

describe('rings', () => {
  it('turns neighbouring rings in opposite senses at different rates', () => {
    const s = settled()
    const start = [...s.ringPhase]
    run(s, inputs(), 2)
    const moved = s.ringPhase.map((p, i) => p - start[i])
    expect(Math.sign(moved[0])).not.toBe(Math.sign(moved[1]))
    expect(Math.abs(moved[0])).not.toBeCloseTo(Math.abs(moved[1]), 2)
    expect(moved.every((m) => m !== 0)).toBe(true)
  })

  it('integrates phase, so a speed change cannot make a ring jump', () => {
    const s = settled()
    const before = s.ringPhase[0]
    stepSimulation(s, inputs({ ringSpeed: 2 }), FRAME)
    expect(Math.abs(s.ringPhase[0] - before)).toBeLessThan(0.02)
  })
})

describe('inspection', () => {
  it('fades X-Ray in and out over about 0.6 s, monotonically', () => {
    const s = settled()
    let last = 0
    for (let i = 0; i < 30; i++) {
      stepSimulation(s, inputs({ xray: true }), FRAME)
      expect(s.xray).toBeGreaterThanOrEqual(last)
      last = s.xray
    }
    expect(last).toBeGreaterThan(0.4)
    expect(last).toBeLessThan(1)
    run(s, inputs({ xray: true }), 0.2)
    expect(s.xray).toBe(1)
    run(s, inputs({ xray: false }), 0.7)
    expect(s.xray).toBe(0)
  })

  it('raises only the selected anatomy weight', () => {
    const s = settled()
    const index = ANATOMY_IDS.indexOf('regulator')
    run(s, inputs({ selected: index }), 2)
    s.highlight.forEach((w, i) => {
      if (i === index) expect(w).toBeGreaterThan(0.99)
      else expect(w).toBeLessThan(0.01)
    })
    expect(s.anySelected).toBeGreaterThan(0.99)
    run(s, inputs({ selected: -1 }), 2)
    expect(s.anySelected).toBeLessThan(0.01)
  })

  it('lifts core energy a little when the core is selected', () => {
    const plain = settled()
    const selected = settled()
    run(selected, inputs({ selected: ANATOMY_IDS.indexOf('core') }), 2)
    run(plain, inputs(), 2)
    expect(selected.energy).toBeGreaterThan(plain.energy)
  })
})

describe('robustness', () => {
  it('ignores a huge frame gap, as after a backgrounded tab', () => {
    const s = settled()
    const before = s.ringPhase[0]
    stepSimulation(s, inputs(), 45)
    expect(Math.abs(s.ringPhase[0] - before)).toBeLessThan(0.05)
  })

  it('tolerates a negative or zero time step', () => {
    const s = settled()
    const before = s.time
    stepSimulation(s, inputs(), -1)
    stepSimulation(s, inputs(), 0)
    expect(s.time).toBe(before)
  })
})
