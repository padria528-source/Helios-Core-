import { create } from 'zustand'
import { detectPerformanceTier, type PerformanceTier } from '../hooks/tiers'
import {
  DEFAULT_MODE,
  MODE_PROFILES,
  OUTPUT_RANGE,
  RING_SPEED_RANGE,
  clampOutput,
  clampRingSpeed,
  type OperatingMode,
} from '../sim/modes'
import type { AnatomyId } from '../sim/simulation'

export type { PerformanceTier, OperatingMode, AnatomyId }

/** The four navigation states. They re-weight the interface; none is a separate page. */
export type ViewId = 'observe' | 'explore' | 'interact' | 'collect'
export const VIEW_ORDER: readonly ViewId[] = ['observe', 'explore', 'interact', 'collect']

/** Real initialisation milestones, shown on the loading line. */
export type LoadStage = 0 | 1 | 2 | 3

export interface ExperienceState {
  coreOutput: number
  ringSpeed: number
  operatingMode: OperatingMode
  xrayEnabled: boolean
  orbitEnabled: boolean
  paused: boolean
  selectedAnatomy: AnatomyId | null
  view: ViewId
  introCompleted: boolean
  sceneReady: boolean
  loadStage: LoadStage
  hasInteracted: boolean
  reducedMotion: boolean
  performanceTier: PerformanceTier
  /** Incremented to ask the camera to fly home. */
  cameraResetNonce: number

  setCoreOutput: (value: number) => void
  setRingSpeed: (value: number) => void
  setOperatingMode: (mode: OperatingMode) => void
  toggleXray: () => void
  toggleOrbit: () => void
  togglePaused: () => void
  selectAnatomy: (id: AnatomyId | null) => void
  setView: (view: ViewId) => void
  requestCameraReset: () => void
  setIntroCompleted: (done: boolean) => void
  setSceneReady: (ready: boolean) => void
  setLoadStage: (stage: LoadStage) => void
  setHasInteracted: (interacted: boolean) => void
  setReducedMotion: (reduced: boolean) => void
  setPerformanceTier: (tier: PerformanceTier) => void
  reset: () => void
}

/** Everything RESET puts back. Orbit depends on the motion preference. */
export function defaultControls(reducedMotion: boolean) {
  return {
    coreOutput: OUTPUT_RANGE.default,
    ringSpeed: RING_SPEED_RANGE.default,
    operatingMode: DEFAULT_MODE,
    xrayEnabled: false,
    orbitEnabled: !reducedMotion,
    paused: false,
    selectedAnatomy: null as AnatomyId | null,
    view: 'observe' as ViewId,
  }
}

export const useExperienceStore = create<ExperienceState>((set) => ({
  ...defaultControls(false),
  introCompleted: false,
  sceneReady: false,
  loadStage: 0,
  hasInteracted: false,
  reducedMotion: false,
  performanceTier: detectPerformanceTier(),
  cameraResetNonce: 0,

  setCoreOutput: (value) => set({ coreOutput: clampOutput(value) }),
  setRingSpeed: (value) => set({ ringSpeed: clampRingSpeed(value) }),

  // A mode is a preset: it moves both controls to its own values.
  setOperatingMode: (operatingMode) =>
    set({
      operatingMode,
      coreOutput: MODE_PROFILES[operatingMode].output,
      ringSpeed: MODE_PROFILES[operatingMode].ringSpeed,
    }),

  toggleXray: () => set((s) => ({ xrayEnabled: !s.xrayEnabled })),
  toggleOrbit: () => set((s) => ({ orbitEnabled: !s.orbitEnabled })),
  togglePaused: () => set((s) => ({ paused: !s.paused })),

  // Selecting the active part again releases it. Picking a part means exploring.
  selectAnatomy: (id) =>
    set((s) => {
      const next = id !== null && id === s.selectedAnatomy ? null : id
      return { selectedAnatomy: next, view: next ? 'explore' : s.view }
    }),

  setView: (view) =>
    set((s) => ({
      view,
      selectedAnatomy: view === 'explore' ? (s.selectedAnatomy ?? 'core') : null,
    })),

  requestCameraReset: () => set((s) => ({ cameraResetNonce: s.cameraResetNonce + 1 })),
  setIntroCompleted: (introCompleted) => set({ introCompleted }),
  setSceneReady: (sceneReady) => set({ sceneReady }),
  setLoadStage: (loadStage) => set((s) => ({ loadStage: Math.max(s.loadStage, loadStage) as LoadStage })),
  setHasInteracted: (hasInteracted) => set({ hasInteracted }),
  setReducedMotion: (reducedMotion) =>
    set((s) => ({ reducedMotion, orbitEnabled: reducedMotion ? false : s.orbitEnabled })),
  setPerformanceTier: (performanceTier) => set({ performanceTier }),

  reset: () =>
    set((s) => ({
      ...defaultControls(s.reducedMotion),
      cameraResetNonce: s.cameraResetNonce + 1,
    })),
}))

if (typeof window !== 'undefined') {
  ;(window as unknown as { __HELIOS_STORE__: typeof useExperienceStore }).__HELIOS_STORE__ = useExperienceStore
}
