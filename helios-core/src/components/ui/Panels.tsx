import { useEffect, useRef, useState } from 'react'
import { MODE_PROFILES, containmentStatus, indicatedCoreTemp } from '../../sim/modes'
import { sim } from '../../sim/runtime'
import { useExperienceStore } from '../../store/experienceStore'
import { capturePlate, downloadBlob } from './capture'
import { ANATOMY, PLATE, SPECIMEN } from './content'

export function SpecimenPanel() {
  return (
    <aside className="specimen panel" aria-label="Specimen record">
      <p className="eyebrow">{SPECIMEN.number}</p>
      <h2 className="specimen__name">{SPECIMEN.name}</h2>
      <dl className="facts">
        {SPECIMEN.facts.map(([term, value]) => (
          <div key={term} className="facts__row">
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="specimen__verse">
        {SPECIMEN.verse[0]}
        <br />
        {SPECIMEN.verse[1]}
      </p>
    </aside>
  )
}

export function AnatomyPanel() {
  const selected = useExperienceStore((s) => s.selectedAnatomy)
  const select = useExperienceStore((s) => s.selectAnatomy)

  return (
    <section className="anatomy panel" aria-label="Anatomy">
      <h2 className="eyebrow eyebrow--rule">Anatomy</h2>
      <ul className="anatomy__list">
        {ANATOMY.map((part, i) => {
          const active = selected === part.id
          return (
            <li key={part.id}>
              <button
                type="button"
                className="anatomy__item"
                aria-pressed={active}
                onClick={() => select(part.id)}
                title={active ? 'Release' : `Examine the ${part.name.toLowerCase()}`}
              >
                <span className="anatomy__index">{String(i + 1).padStart(2, '0')}</span>
                <span className="anatomy__body">
                  <span className="anatomy__name">{part.name}</span>
                  <span className="anatomy__material">{part.material}</span>
                  <span className="anatomy__note" aria-hidden={!active}>
                    <span>{part.note}</span>
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/**
 * Live instrument readout. It samples the simulation a few times a second and
 * writes straight to the DOM, so the numbers move without re-rendering React.
 */
export function Telemetry() {
  const output = useRef<HTMLElement>(null)
  const velocity = useRef<HTMLElement>(null)
  const containment = useRef<HTMLElement>(null)
  const state = useRef<HTMLElement>(null)
  const temperature = useRef<HTMLElement>(null)

  useEffect(() => {
    const write = (el: HTMLElement | null, text: string) => {
      if (el && el.textContent !== text) el.textContent = text
    }
    const tick = () => {
      const store = useExperienceStore.getState()
      const live = sim.output * sim.ignite
      // Ring velocity as actually turning: it lags the control and falls to zero on hold.
      const turning = sim.ringSpeed * sim.spin * sim.motion
      write(output.current, `${Math.round(live * 100)}%`)
      write(velocity.current, `${turning.toFixed(2)}x`)
      write(containment.current, containmentStatus(live))
      write(state.current, store.paused ? 'HELD' : MODE_PROFILES[store.operatingMode].label)
      write(temperature.current, `${indicatedCoreTemp(sim.energy).toLocaleString('en-US').replace(',', ' ')} °A`)
    }
    tick()
    const id = window.setInterval(tick, 120)
    return () => window.clearInterval(id)
  }, [])

  return (
    <section className="telemetry panel" aria-label="Telemetry">
      <h2 className="eyebrow eyebrow--rule">Telemetry</h2>
      <dl className="readout" aria-live="off">
        <div className="readout__row">
          <dt>Core output</dt>
          <dd ref={output}>0%</dd>
        </div>
        <div className="readout__row">
          <dt>Ring velocity</dt>
          <dd ref={velocity}>0.00x</dd>
        </div>
        <div className="readout__row">
          <dt>Containment</dt>
          <dd ref={containment}>DORMANT</dd>
        </div>
        <div className="readout__row">
          <dt>State</dt>
          <dd ref={state} className="readout__state">
            IGNITION
          </dd>
        </div>
        <div className="readout__row">
          <dt>
            Core temp <abbr title="Indicated on the atelier's own instrument scale">ind.</abbr>
          </dt>
          <dd ref={temperature}>— °A</dd>
        </div>
      </dl>
      <p className="telemetry__note">°A · Atelier scale. In-world instrumentation.</p>
    </section>
  )
}

export function CollectPlate() {
  const [status, setStatus] = useState<'idle' | 'working' | 'saved' | 'failed'>('idle')

  const save = async () => {
    if (status === 'working') return
    setStatus('working')
    const blob = await capturePlate()
    if (!blob) {
      setStatus('failed')
      return
    }
    downloadBlob(blob, 'helios-core-plate.png')
    setStatus('saved')
  }

  return (
    <section className="plate panel" aria-label={PLATE.title}>
      <h2 className="eyebrow eyebrow--rule">{PLATE.title}</h2>
      <dl className="facts facts--plate">
        {PLATE.lines.map(([term, value]) => (
          <div key={term} className="facts__row">
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <dl className="facts facts--mobile">
        {SPECIMEN.facts.map(([term, value]) => (
          <div key={term} className="facts__row">
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <button type="button" className="btn btn--wide" onClick={save} disabled={status === 'working'}>
        {status === 'working' ? 'Composing plate…' : 'Save plate · PNG'}
      </button>
      <p className="plate__note" role="status">
        {status === 'saved' ? 'Plate saved to your downloads.' : status === 'failed' ? 'The plate could not be captured.' : PLATE.note}
      </p>
    </section>
  )
}
