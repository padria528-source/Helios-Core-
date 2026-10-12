import React from 'react'

interface FallbackProps {
  /** True when the scene started and then failed, as opposed to WebGL being unavailable. */
  failed?: boolean
}

export function WebGLFallback({ failed = false }: FallbackProps) {
  return (
    <main className="fallback" role="alert">
      <p className="fallback__collection">Mechanica Collection</p>
      <h1 className="fallback__title">Helios Core</h1>
      <p className="fallback__body">
        {failed
          ? 'The interactive visualization stopped unexpectedly. Reloading the page usually restores it.'
          : 'Interactive visualization requires WebGL 2. Enable hardware acceleration in your browser, or open this page on a device with a current graphics driver.'}
      </p>
      {failed && (
        <button type="button" className="btn" onClick={() => window.location.reload()}>
          Reload
        </button>
      )}
    </main>
  )
}

interface BoundaryProps {
  children: React.ReactNode
}

interface BoundaryState {
  hasError: boolean
}

/** Keeps a renderer or shader failure from leaving a silent black page. */
export class SceneErrorBoundary extends React.Component<BoundaryProps, BoundaryState> {
  constructor(props: BoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    console.error('HELIOS CORE scene failure:', error)
  }

  render() {
    if (this.state.hasError) return <WebGLFallback failed />
    return this.props.children
  }
}
