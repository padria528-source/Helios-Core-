import {
  MODE_PROFILES,
  RING_SPECS,
  corePulse,
  finOpenTarget,
  particleTarget,
  regulatorRate,
  ringRates,
  smoothstep,
  lerp,
  type OperatingMode,
} from './modes'
import { governorLift } from './kinematics'

/** Order matters: the scene indexes highlight weights with these. */
export const ANATOMY_IDS = ['fins', 'rings', 'core', 'regulator', 'anchor'] as const
export type AnatomyId = (typeof ANATOMY_IDS)[number]

export const INTRO_DURATION = 3.2
/** Main wheel speed at nominal output, rad/s. Every regulator gear derives from it. */
export const DRIVE_BASE_RATE = 0.4
export const BALANCE_OMEGA = 7.4
export const GOVERNOR_BASE_RATE = 2.6
const XRAY_SECONDS = 0.6

export interface SimInputs {
  coreOutput: number
  ringSpeed: number
  mode: OperatingMode
  xray: boolean
  paused: boolean
  /** Index into ANATOMY_IDS, or -1. */
  selected: number
  reducedMotion: boolean
  /** False until the scene has compiled; holds the machine dark. */
  started: boolean
}

/**
 * Everything the scene animates from. One mutable object, stepped once per
 * frame, read by refs. It never enters React state.
 */
export interface SimState {
  /** Wall-clock seconds since start; never pauses. */
  clock: number
  /** Mechanical time; stops when paused. */
  time: number
  /** Plasma time; slows to a residual shimmer when paused. */
  plasmaTime: number
  introT: number
  introDone: boolean
  /** Core ignition 0..1 (intro). */
  ignite: number
  /** Exhibition lighting 0..1 (intro). */
  lights: number
  /** Mechanical spin-up 0..1 (intro). */
  spin: number
  /** Eased pause factor: 1 running, 0 held. */
  motion: number
  output: number
  ringSpeed: number
  finLag: number
  finOpen: number
  particle: number
  lightBoost: number
  regulator: number
  pulse: number
  /** Final core energy: output x ignition x pulse. Drives shaders and lights. */
  energy: number
  xrayLinear: number
  xray: number
  highlight: number[]
  anySelected: number
  ringPhase: number[]
  ringRate: number[]
  /** Main wheel angle, radians. */
  drive: number
  driveRate: number
  balancePhase: number
  governor: number
  governorRate: number
  governorLift: number
  needle: number
}

export function createSimState(): SimState {
  return {
    clock: 0,
    time: 0,
    plasmaTime: 0,
    introT: 0,
    introDone: false,
    ignite: 0,
    lights: 0,
    spin: 0,
    motion: 1,
    output: MODE_PROFILES.ignition.output,
    ringSpeed: MODE_PROFILES.ignition.ringSpeed,
    finLag: 0.06,
    finOpen: 0.06,
    particle: 0.2,
    lightBoost: 1,
    regulator: regulatorRate(MODE_PROFILES.ignition.output),
    pulse: 1,
    energy: 0,
    xrayLinear: 0,
    xray: 0,
    highlight: [0, 0, 0, 0, 0],
    anySelected: 0,
    ringPhase: [0.6, 2.1, 0, 0.9],
    ringRate: [0, 0, 0, 0],
    drive: 0,
    driveRate: 0,
    balancePhase: 0,
    governor: 0,
    governorRate: 0,
    governorLift: 0,
    needle: 0,
  }
}

/** Frame-rate independent exponential approach. */
export const damp = (current: number, target: number, lambda: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-lambda * dt))

const scratchRates = [0, 0, 0, 0]

/**
 * Advances the machine by `dtRaw` seconds.
 *
 * The time constants are deliberately unequal: the core answers first,
 * the rings follow, the fins trail both. That ordering is what makes a mode
 * change read as cause and effect instead of a cross-fade.
 */
export function stepSimulation(s: SimState, inp: SimInputs, dtRaw: number): void {
  const dt = Math.min(Math.max(dtRaw, 0), 0.05)
  s.clock += dt

  if (!inp.started) {
    s.energy = 0
    return
  }

  // Intro timeline. Reduced motion collapses it to a quick fade.
  s.introT = Math.min(s.introT + dt * (inp.reducedMotion ? 5 : 1), 30)
  const it = s.introT
  s.ignite = smoothstep(0.4, 2.0, it)
  s.lights = smoothstep(0.9, 2.8, it)
  s.spin = smoothstep(1.9, 3.9, it)
  const finRelease = smoothstep(2.3, 3.6, it)
  s.introDone = it >= INTRO_DURATION

  // Pause eases out like a heavy rotor coasting to rest.
  const motionTarget = inp.paused ? 0 : inp.reducedMotion ? 0.45 : 1
  s.motion = damp(s.motion, motionTarget, inp.paused ? 3.4 : 2.2, dt)
  if (inp.paused && s.motion < 0.002) s.motion = 0
  const dtm = dt * s.motion

  s.time += dtm
  s.plasmaTime += dt * lerp(0.035, 1, s.motion)

  // Commanded values: core first, rings second.
  s.output = damp(s.output, inp.coreOutput, 3.4, dt)
  s.ringSpeed = damp(s.ringSpeed, inp.ringSpeed, 1.7, dtm)
  s.regulator = regulatorRate(s.output)

  // Fins trail through two stages, which delays their start as well as their finish.
  s.finLag = damp(s.finLag, finOpenTarget(inp.mode, inp.coreOutput), 2.0, dtm)
  s.finOpen = damp(s.finOpen, lerp(0.06, s.finLag, finRelease), 2.4, dtm)

  s.particle = damp(s.particle, particleTarget(inp.mode, inp.coreOutput), 1.5, dt)
  s.lightBoost = damp(s.lightBoost, MODE_PROFILES[inp.mode].lightBoost, 1.5, dt)

  // Gyro rings integrate their own phase so speed changes never cause a jump.
  ringRates(s.ringSpeed, s.output, scratchRates)
  for (let i = 0; i < RING_SPECS.length; i++) {
    const rate = scratchRates[i] * s.spin
    s.ringRate[i] = rate * s.motion
    s.ringPhase[i] += rate * dtm
  }

  // Regulator train.
  s.driveRate = DRIVE_BASE_RATE * s.regulator * s.spin
  s.drive += s.driveRate * dtm
  s.balancePhase += BALANCE_OMEGA * (0.7 + 0.3 * s.regulator) * Math.sqrt(s.spin) * dtm

  // Flyball governor at the crown: spins with the rings, lifts with its own speed,
  // and so drops when the machine is held.
  s.governorRate =
    GOVERNOR_BASE_RATE * (0.3 + 0.7 * s.ringSpeed) * (0.75 + 0.25 * s.regulator) * s.spin * s.motion
  s.governor += s.governorRate * dt
  s.governorLift = damp(s.governorLift, governorLift(s.governorRate, GOVERNOR_BASE_RATE * 1.25), 1.8, dt)

  // Inspection state.
  const xrayStep = dt / XRAY_SECONDS
  s.xrayLinear = inp.xray ? Math.min(s.xrayLinear + xrayStep, 1) : Math.max(s.xrayLinear - xrayStep, 0)
  s.xray = smoothstep(0, 1, s.xrayLinear)
  for (let i = 0; i < s.highlight.length; i++) {
    s.highlight[i] = damp(s.highlight[i], inp.selected === i ? 1 : 0, 5.5, dt)
  }
  s.anySelected = damp(s.anySelected, inp.selected >= 0 ? 1 : 0, 5.5, dt)

  // Core energy.
  s.pulse = corePulse(s.plasmaTime, s.output)
  s.energy = s.output * s.ignite * s.pulse * (1 + 0.14 * s.highlight[2])
  s.needle = damp(s.needle, s.output * s.ignite, 4, dt)
}
