import { useEffect, useRef, useState } from 'react'
import { MODE_ORDER } from '../../sim/modes'
import { useExperienceStore } from '../../store/experienceStore'
import { ControlConsole } from './Console'
import { NAV, SPECIMEN } from './content'
import { AnatomyPanel, CollectPlate, SpecimenPanel, Telemetry } from './Panels'

/** Single-key shortcuts. Ignored while a form control has focus. */
function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const s = useExperienceStore.getState()
      const key = e.key.toLowerCase()
      if (key === ' ') {
        // On a focused button, Space already means "press this button".
        if (tag === 'BUTTON') return
        e.preventDefault()
        s.togglePaused()
      } else if (key === 'x') s.toggleXray()
      else if (key === 'o') s.toggleOrbit()
      else if (key === 'r') s.reset()
      else if (key === 'v') s.requestCameraReset()
      else if (key === 'escape') s.setView('observe')
      else if (key >= '1' && key <= '4') s.setOperatingMode(MODE_ORDER[Number(key) - 1])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

function Brand() {
  const [revealed, setRevealed] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current)
    },
    [],
  )

  // Maker's mark: pressing the title shows the engine's serial for a moment.
  const reveal = () => {
    setRevealed(true)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setRevealed(false), 4200)
  }

  return (
    <header className="brand">
      <p className="brand__collection">{SPECIMEN.collection}</p>
      <h1 className="brand__title">
        <button type="button" onClick={reveal} aria-label="Helios Core. Show maker's mark.">
          Helios Core
        </button>
      </h1>
      <p className="brand__tagline">
        <span className={revealed ? 'is-hidden' : ''}>{SPECIMEN.tagline}</span>
        <span className={revealed ? 'brand__serial' : 'brand__serial is-hidden'} aria-hidden={!revealed}>
          {SPECIMEN.serial}
        </span>
      </p>
    </header>
  )
}

function Navigation() {
  const view = useExperienceStore((s) => s.view)
  const setView = useExperienceStore((s) => s.setView)
  return (
    <nav className="nav" aria-label="Exhibit">
      {NAV.map((item) => (
        <button
          key={item.id}
          type="button"
          className="nav__item"
          aria-current={view === item.id ? 'page' : undefined}
          onClick={() => setView(item.id)}
          title={item.hint}
        >
          <span className="nav__index">{item.index}</span>
          <span className="nav__label">{item.label}</span>
        </button>
      ))}
    </nav>
  )
}

/** Phones keep a view reset in reach on every sheet; desktop has it beside the switches. */
function MobileViewReset() {
  const resetView = useExperienceStore((s) => s.requestCameraReset)
  return (
    <div className="viewreset">
      <button type="button" className="btn btn--quiet" onClick={resetView}>
        Reset view
      </button>
    </div>
  )
}

export function Hud() {
  const view = useExperienceStore((s) => s.view)
  const ready = useExperienceStore((s) => s.introCompleted)
  useShortcuts()

  return (
    <div className="hud" data-view={view} data-ready={ready}>
      <Brand />
      <Navigation />
      <SpecimenPanel />
      <div className="side">
        {view === 'collect' ? (
          <CollectPlate />
        ) : (
          <>
            <AnatomyPanel />
            <Telemetry />
          </>
        )}
      </div>
      <ControlConsole />
      <MobileViewReset />
    </div>
  )
}
