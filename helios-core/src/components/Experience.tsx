import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import { Bloom, EffectComposer, Noise, ToneMapping, Vignette } from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode } from 'postprocessing'
import { CameraController } from '../controls/CameraController'
import { CAMERA_FOV, defaultPose } from '../controls/framing'
import { dprCap, isMobileDevice, parseTierOverride, type TierSettings } from '../hooks/tiers'
import { usePerformanceTier } from '../hooks/usePerformanceTier'
import { Atmosphere } from '../scene/environment/Atmosphere'
import { BACKGROUND, Chamber, FOG_DENSITY } from '../scene/environment/Chamber'
import { Lighting } from '../scene/environment/Lighting'
import { HeliosCore } from '../scene/helios/HeliosCore'
import { ANATOMY_IDS, stepSimulation, type SimInputs } from '../sim/simulation'
import { sim } from '../sim/runtime'
import { useExperienceStore, type PerformanceTier } from '../store/experienceStore'

const MIN_LOADING_MS = 900
const OCTAVES: Record<PerformanceTier, number> = { high: 4, medium: 3, low: 2 }

/** Steps the machine once per frame, before anything reads it. */
function SimulationDriver() {
  const inputs = useRef<SimInputs>({
    coreOutput: 1,
    ringSpeed: 1,
    mode: 'radiance',
    xray: false,
    paused: false,
    selected: -1,
    reducedMotion: false,
    started: false,
  })

  useFrame((_, dt) => {
    const store = useExperienceStore.getState()
    const inp = inputs.current
    inp.coreOutput = store.coreOutput
    inp.ringSpeed = store.ringSpeed
    inp.mode = store.operatingMode
    inp.xray = store.xrayEnabled
    inp.paused = store.paused
    inp.selected = store.selectedAnatomy ? ANATOMY_IDS.indexOf(store.selectedAnatomy) : -1
    inp.reducedMotion = store.reducedMotion
    inp.started = store.sceneReady
    stepSimulation(sim, inp, dt)
    if (sim.introDone && !store.introCompleted) store.setIntroCompleted(true)
  }, -10)

  return null
}

/**
 * Reports real milestones to the loading line: canvas mounted, shaders
 * compiled, first frames presented. No invented percentages.
 */
function ReadySignal() {
  const { gl, scene, camera } = useThree()

  useEffect(() => {
    let cancelled = false
    const started = performance.now()
    const store = useExperienceStore.getState()
    const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    ;(async () => {
      store.setLoadStage(1)
      try {
        await Promise.race([gl.compileAsync(scene, camera), new Promise((r) => setTimeout(r, 4000))])
      } catch {
        // Parallel compile is a hint; rendering will compile on demand.
      }
      if (cancelled) return
      store.setLoadStage(2)
      await nextFrame()
      await nextFrame()
      if (cancelled) return
      store.setLoadStage(3)
      const wait = Math.max(0, MIN_LOADING_MS - (performance.now() - started))
      await new Promise((r) => setTimeout(r, wait))
      if (cancelled) return
      store.setSceneReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [gl, scene, camera])

  return null
}

function Effects({ tier, settings }: { tier: PerformanceTier; settings: TierSettings }) {
  if (!settings.bloom) return null
  // A high threshold: the plasma clears it easily, a specular glint on brass does not.
  return (
    <EffectComposer key={tier} multisampling={settings.multisampling} enableNormalPass={false} frameBufferType={THREE.HalfFloatType}>
      <Bloom
        intensity={tier === 'high' ? 0.6 : 0.5}
        luminanceThreshold={2.1}
        luminanceSmoothing={0.35}
        mipmapBlur
        radius={0.7}
        levels={tier === 'high' ? 7 : 5}
      />
      <Vignette offset={0.26} darkness={0.72} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      {/* A trace of grain keeps the dark gradients from banding. */}
      {settings.filmGrain && <Noise premultiply opacity={0.055} blendFunction={BlendFunction.SOFT_LIGHT} />}
    </EffectComposer>
  )
}

export function Experience() {
  const { tier, settings, degrade } = usePerformanceTier()
  const mobile = useMemo(isMobileDevice, [])
  const pinned = useMemo(() => parseTierOverride(window.location.search) !== null, [])
  const dpr = Math.min(window.devicePixelRatio || 1, dprCap(tier, mobile))
  const initial = useMemo(() => {
    const pose = defaultPose(window.innerWidth / window.innerHeight)
    return new THREE.Vector3().setFromSphericalCoords(pose.radius, pose.phi, pose.theta).add(new THREE.Vector3(0, pose.targetY, 0))
  }, [])

  return (
    <div className="stage" role="img" aria-label="HELIOS CORE, an interactive 3D mechanical sun. Drag to orbit, scroll or pinch to zoom.">
      <Canvas
        dpr={dpr}
        shadows={settings.shadowMapSize > 0 ? 'percentage' : false}
        camera={{ fov: CAMERA_FOV, near: 0.1, far: 140, position: initial.toArray() }}
        gl={{ antialias: true, powerPreference: 'high-performance', alpha: false, stencil: false }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1
        }}
      >
        {/* These attach to their parent, so they must sit directly under the scene root. */}
        <color attach="background" args={[BACKGROUND]} />
        <fogExp2 attach="fog" args={[BACKGROUND, FOG_DENSITY]} />
        <SimulationDriver />
        <CameraController />
        <Chamber reflection={settings.reflection} reflectionResolution={settings.reflectionResolution} />
        <Lighting shadowMapSize={settings.shadowMapSize} />
        <HeliosCore shadows={settings.shadowMapSize > 0} octaves={OCTAVES[tier]} />
        <Atmosphere key={tier} dust={settings.dust} motes={settings.motes} />
        <Effects tier={tier} settings={settings} />
        <ReadySignal />
        {/* Sustained low frame rate steps the tier down once; it never climbs back mid-session. */}
        {!pinned && tier !== 'low' && <PerformanceMonitor ms={300} iterations={8} threshold={0.8} flipflops={1} onDecline={degrade} />}
      </Canvas>
    </div>
  )
}
