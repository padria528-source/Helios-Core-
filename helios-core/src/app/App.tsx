import { useEffect, useState } from 'react'
import { Experience } from '../components/Experience'
import { SceneErrorBoundary, WebGLFallback } from '../components/WebGLFallback'
import { Hud } from '../components/ui/Hud'
import { LoadingScreen } from '../components/ui/LoadingScreen'
import { webglSupported } from '../hooks/tiers'
import { useExperienceStore } from '../store/experienceStore'

export default function App() {
  const [supported] = useState(webglSupported)
  const [contextLost, setContextLost] = useState(false)
  const setReducedMotion = useExperienceStore((s) => s.setReducedMotion)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(query.matches)
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [setReducedMotion])

  // A lost GPU context that is not restored within a moment gets the fallback, not a frozen frame.
  useEffect(() => {
    let timer = 0
    const onLost = (e: Event) => {
      e.preventDefault()
      timer = window.setTimeout(() => setContextLost(true), 2500)
    }
    const onRestored = () => window.clearTimeout(timer)
    window.addEventListener('webglcontextlost', onLost, true)
    window.addEventListener('webglcontextrestored', onRestored, true)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('webglcontextlost', onLost, true)
      window.removeEventListener('webglcontextrestored', onRestored, true)
    }
  }, [])

  if (!supported) return <WebGLFallback />
  if (contextLost) return <WebGLFallback failed />

  return (
    <SceneErrorBoundary>
      <Experience />
      <Hud />
      <LoadingScreen />
    </SceneErrorBoundary>
  )
}
