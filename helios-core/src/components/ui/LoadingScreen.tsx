import { useExperienceStore } from '../../store/experienceStore'

/** What is actually happening at each stage of start-up. */
const STAGES = ['Preparing chamber', 'Forging geometry', 'Compiling shaders', 'Igniting'] as const

export function LoadingScreen() {
  const stage = useExperienceStore((s) => s.loadStage)
  const ready = useExperienceStore((s) => s.sceneReady)

  return (
    <div className={ready ? 'loading is-done' : 'loading'} role="status" aria-live="polite" aria-hidden={ready}>
      <p className="loading__title">Helios Core</p>
      <p className="loading__subtitle">Initializing stellar engine</p>
      <div className="loading__line" aria-hidden="true">
        <span style={{ transform: `scaleX(${(stage + (ready ? 1 : 0.35)) / STAGES.length})` }} />
      </div>
      <p className="loading__stage">{STAGES[stage]}</p>
    </div>
  )
}
