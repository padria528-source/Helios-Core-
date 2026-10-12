import type { CSSProperties } from 'react'
import { MODE_ORDER, MODE_PROFILES, OUTPUT_RANGE, RING_SPEED_RANGE } from '../../sim/modes'
import { useExperienceStore } from '../../store/experienceStore'

interface DialProps {
  id: string
  label: string
  value: number
  range: { min: number; max: number; step: number }
  format: (v: number) => string
  onChange: (v: number) => void
}

/** A range input dressed as a graduated instrument scale. */
function Dial({ id, label, value, range, format, onChange }: DialProps) {
  const fill = ((value - range.min) / (range.max - range.min)) * 100
  return (
    <div className="dial">
      <label className="dial__label" htmlFor={id}>
        <span>{label}</span>
        <output htmlFor={id}>{format(value)}</output>
      </label>
      <input
        id={id}
        className="dial__input"
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        style={{ '--fill': `${fill}%` } as CSSProperties}
        aria-valuetext={format(value)}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

/**
 * Mode and the two dials on the left, the four switches on the right.
 * On a phone both halves stack into one sheet.
 */
export function ControlConsole() {
  const mode = useExperienceStore((s) => s.operatingMode)
  const coreOutput = useExperienceStore((s) => s.coreOutput)
  const ringSpeed = useExperienceStore((s) => s.ringSpeed)
  const xray = useExperienceStore((s) => s.xrayEnabled)
  const orbit = useExperienceStore((s) => s.orbitEnabled)
  const paused = useExperienceStore((s) => s.paused)
  const interacted = useExperienceStore((s) => s.hasInteracted)
  const store = useExperienceStore.getState()

  return (
    <div className="controls">
      <section className="console" aria-label="Core control">
        <div className="console__group">
          <h2 className="eyebrow">Operating mode</h2>
          <div className="modes" role="radiogroup" aria-label="Operating mode">
            {MODE_ORDER.map((id, i) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={mode === id}
                className="mode"
                onClick={() => store.setOperatingMode(id)}
                title={`Key ${i + 1}`}
              >
                {MODE_PROFILES[id].label}
              </button>
            ))}
          </div>
        </div>

        <div className="console__group console__group--dials">
          <Dial
            id="core-output"
            label="Output"
            value={coreOutput}
            range={OUTPUT_RANGE}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={store.setCoreOutput}
          />
          <Dial
            id="ring-speed"
            label="Ring speed"
            value={ringSpeed}
            range={RING_SPEED_RANGE}
            format={(v) => `${v.toFixed(2)}x`}
            onChange={store.setRingSpeed}
          />
        </div>
      </section>

      <section className="actions" aria-label="Instrument switches">
        {/* The gesture hint retires once the visitor has moved the camera. */}
        <p className={interacted ? 'actions__hint is-hidden' : 'actions__hint'} aria-hidden={interacted}>
          <span className="hint__fine">Drag to orbit · Scroll to zoom</span>
          <span className="hint__coarse">Drag to orbit · Pinch to zoom</span>
        </p>
        <button type="button" className="btn btn--quiet actions__view" onClick={store.requestCameraReset} title="Fly the camera home (V)">
          Reset view
        </button>
        <div className="actions__row">
          <button type="button" className="btn" onClick={store.reset} title="Restore every control and the camera (R)">
            Reset
          </button>
          <button type="button" className="btn" aria-pressed={xray} onClick={store.toggleXray} title="See through the outer shells (X)">
            X-Ray
          </button>
          <button type="button" className="btn" aria-pressed={orbit} onClick={store.toggleOrbit} title="Slow automatic orbit (O)">
            Orbit
          </button>
          <button type="button" className="btn" aria-pressed={paused} onClick={store.togglePaused} title="Hold the mechanism (Space)">
            {paused ? 'Resume' : 'Pause'}
          </button>
        </div>
      </section>
    </div>
  )
}
