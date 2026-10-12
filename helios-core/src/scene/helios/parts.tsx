import { useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'

/** Builds a value on first use and keeps it for the life of the page. */
export function lazy<T>(make: () => T): () => T {
  let value: T | undefined
  return () => (value ??= make())
}

interface InstancedProps {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  matrices: readonly THREE.Matrix4[]
  name?: string
}

/** Bolts, scale marks and other repeated hardware in a single draw call. */
export function Instanced({ geometry, material, matrices, name }: InstancedProps) {
  const ref = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    for (let i = 0; i < matrices.length; i++) mesh.setMatrixAt(i, matrices[i])
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [matrices])

  return <instancedMesh ref={ref} name={name} args={[geometry, material, matrices.length]} />
}

/** Shared primitive geometry, unit sized so instances scale it. */
export const unitBox = lazy(() => new THREE.BoxGeometry(1, 1, 1))
/** Unit-height cylinder on Y, radius 1. */
export const unitCylinder = lazy(() => new THREE.CylinderGeometry(1, 1, 1, 20))
/** Unit-height hex prism on Y, across-corners radius 1. */
export const hexBolt = lazy(() => new THREE.CylinderGeometry(1, 1, 1, 6))
export const unitSphere = lazy(() => new THREE.SphereGeometry(1, 28, 20))
