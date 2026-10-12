import { useEffect, useRef, type ComponentRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { clamp, lerp } from '../sim/modes'
import { damp } from '../sim/simulation'
import { sim } from '../sim/runtime'
import { useExperienceStore } from '../store/experienceStore'
import { DEG, VIEW_TARGET_Y } from '../scene/helios/constants'
import { FOCUS, defaultPose, fitDistance, viewLift, type CameraPose } from './framing'

/** One revolution every 64 seconds. */
const ORBIT_RATE = (Math.PI * 2) / 64
const RESUME_DELAY_MS = 3200
const MIN_DISTANCE = 3.2
const MIN_POLAR = 0.32
const MAX_POLAR = 1.6

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

type Controls = ComponentRef<typeof OrbitControls>

const _offset = new THREE.Vector3()
const _spherical = new THREE.Spherical()
/** Stable initial target: a fresh array each render would re-apply and undo camera flights. */
const HOME_TARGET = new THREE.Vector3(0, VIEW_TARGET_Y, 0)

export function CameraController() {
  const controls = useRef<Controls>(null)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const aspect = size.width / size.height

  const flight = useRef({
    active: false,
    t: 0,
    duration: 1,
    ease: easeInOut,
    from: { theta: 0, phi: 0, radius: 1, targetY: 0 },
    to: { theta: 0, phi: 0, radius: 1, targetY: 0 },
  })
  const interacting = useRef(false)
  const resumeAt = useRef(0)
  const orbitBlend = useRef(0)
  const lift = useRef(0)
  const applied = useRef({ w: 0, h: 0, lift: -1 })
  const introStarted = useRef(false)

  const reducedMotion = useExperienceStore((s) => s.reducedMotion)
  const sceneReady = useExperienceStore((s) => s.sceneReady)
  const resetNonce = useExperienceStore((s) => s.cameraResetNonce)
  const selected = useExperienceStore((s) => s.selectedAnatomy)

  const readPose = (): CameraPose => {
    const target = controls.current?.target ?? new THREE.Vector3(0, VIEW_TARGET_Y, 0)
    _spherical.setFromVector3(_offset.copy(camera.position).sub(target))
    return { theta: _spherical.theta, phi: _spherical.phi, radius: _spherical.radius, targetY: target.y }
  }

  const flyTo = (to: CameraPose, duration: number, ease = easeInOut) => {
    const f = flight.current
    const from = readPose()
    // Take the short way round.
    let dTheta = to.theta - from.theta
    dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta))
    f.from = from
    f.to = { ...to, theta: from.theta + dTheta }
    f.t = 0
    f.duration = Math.max(duration, 0.001)
    f.ease = ease
    f.active = true
  }

  const applyPose = (p: CameraPose) => {
    const target = controls.current?.target
    if (!target) return
    target.set(0, p.targetY, 0)
    _spherical.set(p.radius, clamp(p.phi, MIN_POLAR, MAX_POLAR), p.theta)
    camera.position.setFromSpherical(_spherical).add(target)
    camera.lookAt(target)
  }

  // Opening move: start a little far and low, settle into the product angle.
  useEffect(() => {
    if (!sceneReady || introStarted.current) return
    introStarted.current = true
    const home = defaultPose(aspect)
    if (reducedMotion) {
      applyPose(home)
      return
    }
    applyPose({ ...home, radius: home.radius * 1.2, phi: home.phi + 5 * DEG, theta: home.theta - 14 * DEG })
    flyTo(home, 3.6, easeOut)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneReady])

  // RESET VIEW flies home; it never teleports.
  useEffect(() => {
    if (resetNonce === 0) return
    flyTo(defaultPose(aspect), reducedMotion ? 0.01 : 1.0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetNonce])

  // Selecting a part brings the camera to it, keeping the current heading.
  const firstSelection = useRef(true)
  useEffect(() => {
    if (firstSelection.current) {
      firstSelection.current = false
      return
    }
    const home = defaultPose(aspect)
    const here = readPose()
    const duration = reducedMotion ? 0.01 : 1.1
    if (selected) {
      const focus = FOCUS[selected]
      flyTo({ theta: here.theta, phi: focus.phi, radius: home.radius * focus.scale, targetY: focus.targetY }, duration)
    } else {
      flyTo({ ...home, theta: here.theta }, duration)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  // Wheel zoom is handled here instead of by OrbitControls, whose wheel step is a
  // fixed amount per event: glacial on a notched mouse, violent on a trackpad that
  // fires hundreds of small events. Scaling by the delta and easing toward a goal
  // gives both devices the same heavy, even zoom.
  const gl = useThree((s) => s.gl)
  const zoomGoal = useRef<number | null>(null)
  const maxDistanceRef = useRef(fitDistance(aspect) * 1.75)
  maxDistanceRef.current = fitDistance(aspect) * 1.75
  useEffect(() => {
    const canvas = gl.domElement
    const onWheel = (e: WheelEvent) => {
      if (e.target !== canvas) return
      e.preventDefault()
      e.stopPropagation()
      const c = controls.current
      if (!c) return
      const unit = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? 600 : 1
      // A pinch on a trackpad arrives as ctrl+wheel with small deltas.
      const delta = clamp(e.deltaY * unit * (e.ctrlKey ? 5 : 1), -260, 260)
      const from = zoomGoal.current ?? camera.position.distanceTo(c.target)
      zoomGoal.current = clamp(from * Math.exp(delta * 0.0016), MIN_DISTANCE, maxDistanceRef.current)
      flight.current.active = false
      resumeAt.current = performance.now() + RESUME_DELAY_MS
      const store = useExperienceStore.getState()
      if (!store.hasInteracted) store.setHasInteracted(true)
    }
    // Capture phase on the document runs before the listener OrbitControls registered.
    document.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => document.removeEventListener('wheel', onWheel, { capture: true })
  }, [gl, camera])

  // A new viewport shape gets a new framing, unless a part is being examined.
  const lastAspect = useRef(aspect)
  useEffect(() => {
    if (Math.abs(lastAspect.current - aspect) < 0.02) return
    lastAspect.current = aspect
    if (!introStarted.current || useExperienceStore.getState().selectedAnatomy) return
    const here = readPose()
    flyTo({ ...defaultPose(aspect), theta: here.theta, phi: here.phi }, 0.5)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspect])

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const c = controls.current
    if (!c) return
    const store = useExperienceStore.getState()
    const f = flight.current

    if (f.active) {
      f.t = Math.min(f.t + dt / f.duration, 1)
      const e = f.ease(f.t)
      applyPose({
        theta: lerp(f.from.theta, f.to.theta, e),
        phi: lerp(f.from.phi, f.to.phi, e),
        // Interpolate distance in log space so a zoom feels even.
        radius: Math.exp(lerp(Math.log(f.from.radius), Math.log(f.to.radius), e)),
        targetY: lerp(f.from.targetY, f.to.targetY, e),
      })
      if (f.t >= 1) f.active = false
      zoomGoal.current = null
    }

    if (zoomGoal.current !== null) {
      _offset.copy(camera.position).sub(c.target)
      const radius = _offset.length()
      const next = damp(radius, zoomGoal.current, 9, dt)
      camera.position.copy(c.target).addScaledVector(_offset, next / radius)
      if (Math.abs(next - zoomGoal.current) < 0.002) zoomGoal.current = null
    }

    // Auto orbit eases in and out instead of switching, and waits after a drag.
    const idle = !interacting.current && performance.now() > resumeAt.current
    const wantOrbit = store.orbitEnabled && sim.introDone && idle && !f.active
    orbitBlend.current = damp(orbitBlend.current, wantOrbit ? 1 : 0, wantOrbit ? 1.2 : 4, dt)
    if (orbitBlend.current > 0.001) {
      _offset.copy(camera.position).sub(c.target)
      _offset.applyAxisAngle(THREE.Object3D.DEFAULT_UP, ORBIT_RATE * orbitBlend.current * dt)
      camera.position.copy(c.target).add(_offset)
    }

    // Shift the image, not the scene, to keep the artifact clear of the interface.
    lift.current = damp(lift.current, viewLift(state.size.width / state.size.height, store.view), 4, dt)
    const a = applied.current
    const { width, height } = state.size
    if (a.w !== width || a.h !== height || Math.abs(a.lift - lift.current) > 0.0004) {
      a.w = width
      a.h = height
      a.lift = lift.current
      camera.setViewOffset(width, height, 0, lift.current * height, width, height)
    }
  }, -2)

  const handleStart = () => {
    interacting.current = true
    flight.current.active = false
    zoomGoal.current = null
    const store = useExperienceStore.getState()
    if (!store.hasInteracted) store.setHasInteracted(true)
  }

  const handleEnd = () => {
    interacting.current = false
    resumeAt.current = performance.now() + RESUME_DELAY_MS
  }

  const maxDistance = maxDistanceRef.current

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={HOME_TARGET}
      enablePan={false}
      enableDamping
      dampingFactor={0.07}
      rotateSpeed={0.55}
      zoomSpeed={0.7}
      minDistance={MIN_DISTANCE}
      maxDistance={maxDistance}
      minPolarAngle={MIN_POLAR}
      maxPolarAngle={MAX_POLAR}
      onStart={handleStart}
      onEnd={handleEnd}
    />
  )
}
