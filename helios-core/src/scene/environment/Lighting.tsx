import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import { coreLightIntensity } from '../../sim/modes'
import { sim } from '../../sim/runtime'
import { CORE_Y } from '../helios/constants'

const KEY_INTENSITY = 3.0
const RIM_INTENSITY = 4.2
const FILL_INTENSITY = 0.5
const KICK_INTENSITY = 1.4
const ENV_INTENSITY = 0.95

interface LightingProps {
  /** Shadow map edge in pixels; 0 turns shadows off. */
  shadowMapSize: number
}

/**
 * Exhibition rig: a warm key, an amber rim from behind, a whisper of cool
 * fill, and the core itself as a moving point light. The studio panels below
 * exist only in the environment map, where they give the brass something to
 * reflect; polished metal lit by lamps alone looks black.
 */
export function Lighting({ shadowMapSize }: LightingProps) {
  const scene = useThree((s) => s.scene)
  const key = useRef<THREE.DirectionalLight>(null)
  const rim = useRef<THREE.DirectionalLight>(null)
  const fill = useRef<THREE.DirectionalLight>(null)
  const kick = useRef<THREE.DirectionalLight>(null)
  const core = useRef<THREE.PointLight>(null)
  const deck = useRef<THREE.PointLight>(null)

  useEffect(() => {
    const light = key.current
    if (!light) return
    light.target.position.set(0, 2.4, 0)
    light.target.updateMatrixWorld()
    const cam = light.shadow.camera
    cam.left = -3.4
    cam.right = 3.4
    cam.top = 3.6
    cam.bottom = -3.6
    cam.near = 1
    cam.far = 24
    cam.updateProjectionMatrix()
  }, [])

  useFrame(() => {
    // The room comes up during the intro, then tracks the operating mode.
    const level = (0.025 + 0.975 * sim.lights) * sim.lightBoost
    // X-Ray takes a little off the key so the lit interior carries the image.
    const inspect = 1 - 0.22 * sim.xray
    if (key.current) key.current.intensity = KEY_INTENSITY * level * inspect
    if (rim.current) rim.current.intensity = RIM_INTENSITY * level
    if (fill.current) fill.current.intensity = FILL_INTENSITY * level
    if (kick.current) kick.current.intensity = KICK_INTENSITY * level
    if (core.current) core.current.intensity = coreLightIntensity(sim.energy)
    if (deck.current) deck.current.intensity = (0.3 + 0.75 * sim.energy) * level
    scene.environmentIntensity = ENV_INTENSITY * level * inspect
  })

  return (
    <group name="Lighting">
      <directionalLight
        ref={key}
        name="KeyLight"
        position={[4.6, 8.2, 5.6]}
        color="#ffe2b4"
        intensity={0}
        castShadow={shadowMapSize > 0}
        shadow-mapSize={[shadowMapSize || 512, shadowMapSize || 512]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.028}
        shadow-radius={3}
      />
      <directionalLight ref={rim} name="RimLight" position={[-5.2, 5.4, -6.2]} color="#ff9438" intensity={0} />
      <directionalLight ref={fill} name="FillLight" position={[-6.5, 2.6, 4.2]} color="#8e98aa" intensity={0} />
      <directionalLight ref={kick} name="KickLight" position={[6.2, 1.4, -4.4]} color="#ffb267" intensity={0} />

      <pointLight ref={core} name="CoreLight" position={[0, CORE_Y, 0]} color="#ffb061" intensity={0} distance={16} decay={2} />
      <pointLight ref={deck} name="PedestalLight" position={[0, 1.36, 0]} color="#ffbb6e" intensity={0} distance={3.6} decay={2} />

      <Environment resolution={256} frames={1} environmentIntensity={0}>
        <Lightformer form="rect" intensity={5.2} color="#ffddb0" position={[5, 6.5, 5]} scale={[7, 4, 1]} />
        <Lightformer form="rect" intensity={3.6} color="#ff9440" position={[-6, 3.5, -5.5]} scale={[2.2, 9, 1]} />
        <Lightformer form="rect" intensity={1.5} color="#98a2b4" position={[-7.5, 2, 4]} scale={[4, 6, 1]} />
        <Lightformer form="rect" intensity={1.9} color="#ffb060" position={[6.5, 1, -5]} scale={[1.2, 7, 1]} />
        <Lightformer form="ring" intensity={2.4} color="#ffd29e" position={[0, 9, 0]} scale={5} />
        {/* Warm bounce from below: the floor the core is lighting. Without it, every
            downward-facing surface (most of each fin) reflects nothing and goes black. */}
        <Lightformer form="circle" intensity={1.25} color="#c08442" position={[0, -5, 0]} scale={16} />
        <Lightformer form="rect" intensity={1.3} color="#ffc48a" position={[0, 0.4, 10]} scale={[14, 1.4, 1]} />
        <Lightformer form="rect" intensity={0.9} color="#ffb070" position={[0, 0.4, -10]} scale={[14, 1.4, 1]} />
      </Environment>
    </group>
  )
}
