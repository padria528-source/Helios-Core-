import { useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { damp } from '../../sim/simulation'
import { sim } from '../../sim/runtime'
import { useExperienceStore } from '../../store/experienceStore'
import { CentralAxis } from './CentralAxis'
import { Core } from './Core'
import { Gyroscope } from './Gyroscope'
import { updateMaterials } from './materials'
import { Pedestal } from './Pedestal'
import { Regulator } from './Regulator'
import { SolarFins } from './SolarFins'
import { Stabilizer } from './Stabilizer'

/** Marks which meshes take part in the shadow pass. Glass, plasma and lamps never do. */
function flagShadows(node: THREE.Object3D, enabled: boolean, inherited = false) {
  const skip = inherited || node.userData.noShadow === true
  const mesh = node as THREE.Mesh
  if (mesh.isMesh) {
    const material = mesh.material as THREE.Material & { isShaderMaterial?: boolean; isMeshBasicMaterial?: boolean }
    const lit = !material.isShaderMaterial && !material.isMeshBasicMaterial
    const ok = enabled && !skip && lit
    mesh.castShadow = ok && !material.transparent
    mesh.receiveShadow = ok
  }
  for (const child of node.children) flagShadows(child, enabled, skip)
}

interface HeliosCoreProps {
  shadows: boolean
  /** Plasma noise octaves for the current performance tier. */
  octaves: number
}

export function HeliosCore({ shadows, octaves }: HeliosCoreProps) {
  const root = useRef<THREE.Group>(null)

  useLayoutEffect(() => {
    if (root.current) flagShadows(root.current, shadows)
  }, [shadows, octaves])

  useFrame((state, dt) => {
    updateMaterials(sim)
    // The artifact turns a hair toward the cursor. Meant to be felt, not noticed.
    const group = root.current
    if (!group) return
    const reduced = useExperienceStore.getState().reducedMotion
    const target = reduced ? 0 : state.pointer.x * 0.02 * sim.lights
    group.rotation.y = damp(group.rotation.y, target, 2.2, Math.min(dt, 0.05))
  })

  return (
    <group ref={root} name="HeliosCoreRoot">
      <Pedestal />
      <CentralAxis />
      <Core octaves={octaves} />
      <Gyroscope />
      <SolarFins />
      <Regulator />
      <Stabilizer />
    </group>
  )
}
