import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_MODE, MODE_ORDER, MODE_PROFILES, OUTPUT_RANGE, RING_SPEED_RANGE } from '../src/sim/modes'
import { defaultControls, useExperienceStore } from '../src/store/experienceStore'

const get = () => useExperienceStore.getState()

describe('experience store', () => {
  beforeEach(() => {
    get().setReducedMotion(false)
    get().reset()
  })

  it('starts in RADIANCE with nothing engaged', () => {
    const s = get()
    expect(s.operatingMode).toBe(DEFAULT_MODE)
    expect(s.coreOutput).toBe(OUTPUT_RANGE.default)
    expect(s.ringSpeed).toBe(RING_SPEED_RANGE.default)
    expect(s.xrayEnabled).toBe(false)
    expect(s.paused).toBe(false)
    expect(s.orbitEnabled).toBe(true)
    expect(s.selectedAnatomy).toBeNull()
    expect(s.view).toBe('observe')
  })

  it('clamps both dials', () => {
    get().setCoreOutput(0.01)
    expect(get().coreOutput).toBe(OUTPUT_RANGE.min)
    get().setCoreOutput(50)
    expect(get().coreOutput).toBe(OUTPUT_RANGE.max)
    get().setRingSpeed(0)
    expect(get().ringSpeed).toBe(RING_SPEED_RANGE.min)
    get().setRingSpeed(50)
    expect(get().ringSpeed).toBe(RING_SPEED_RANGE.max)
  })

  it('treats a mode as a preset that moves both dials', () => {
    for (const mode of MODE_ORDER) {
      get().setOperatingMode(mode)
      expect(get().operatingMode).toBe(mode)
      expect(get().coreOutput).toBe(MODE_PROFILES[mode].output)
      expect(get().ringSpeed).toBe(MODE_PROFILES[mode].ringSpeed)
    }
  })

  it('lets a dial override the preset without changing the mode', () => {
    get().setOperatingMode('stabilizing')
    get().setCoreOutput(1.5)
    expect(get().operatingMode).toBe('stabilizing')
    expect(get().coreOutput).toBe(1.5)
  })

  it('toggles X-Ray, orbit and pause independently', () => {
    get().toggleXray()
    get().togglePaused()
    get().toggleOrbit()
    expect(get().xrayEnabled).toBe(true)
    expect(get().paused).toBe(true)
    expect(get().orbitEnabled).toBe(false)
    get().toggleXray()
    expect(get().xrayEnabled).toBe(false)
    expect(get().paused).toBe(true)
  })

  it('selects a part, enters EXPLORE, and releases it when pressed again', () => {
    get().selectAnatomy('regulator')
    expect(get().selectedAnatomy).toBe('regulator')
    expect(get().view).toBe('explore')
    get().selectAnatomy('fins')
    expect(get().selectedAnatomy).toBe('fins')
    get().selectAnatomy('fins')
    expect(get().selectedAnatomy).toBeNull()
  })

  it('gives EXPLORE a part to look at and clears it when leaving', () => {
    get().setView('explore')
    expect(get().selectedAnatomy).toBe('core')
    get().selectAnatomy('anchor')
    get().setView('explore')
    expect(get().selectedAnatomy).toBe('anchor')
    get().setView('interact')
    expect(get().selectedAnatomy).toBeNull()
    expect(get().view).toBe('interact')
  })

  it('asks the camera to fly home on demand', () => {
    const before = get().cameraResetNonce
    get().requestCameraReset()
    expect(get().cameraResetNonce).toBe(before + 1)
  })

  it('restores every control, the view and the camera on reset', () => {
    get().setOperatingMode('overdrive')
    get().setCoreOutput(1.7)
    get().setRingSpeed(0.3)
    get().toggleXray()
    get().togglePaused()
    get().toggleOrbit()
    get().selectAnatomy('core')
    const nonce = get().cameraResetNonce
    get().reset()
    const s = get()
    expect({
      coreOutput: s.coreOutput,
      ringSpeed: s.ringSpeed,
      operatingMode: s.operatingMode,
      xrayEnabled: s.xrayEnabled,
      orbitEnabled: s.orbitEnabled,
      paused: s.paused,
      selectedAnatomy: s.selectedAnatomy,
      view: s.view,
    }).toEqual(defaultControls(false))
    expect(s.cameraResetNonce).toBe(nonce + 1)
  })

  it('keeps auto orbit off under reduced motion, including after reset', () => {
    get().setReducedMotion(true)
    expect(get().orbitEnabled).toBe(false)
    get().reset()
    expect(get().orbitEnabled).toBe(false)
    expect(defaultControls(true).orbitEnabled).toBe(false)
  })

  it('never moves the loading stage backwards', () => {
    get().setLoadStage(2)
    get().setLoadStage(1)
    expect(get().loadStage).toBe(2)
  })
})
