import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { MeshReflectorMaterial } from '@react-three/drei'
import { sim } from '../../sim/runtime'
import { CORE_Y, FIN_AZIMUTH_OFFSET } from '../helios/constants'
import { matrixFrom } from '../helios/geometry'
import { Instanced, lazy, unitBox } from '../helios/parts'

export const BACKGROUND = '#040404'
/** Exponential-squared fog density; the floor is fully lost by about 45 units. */
export const FOG_DENSITY = 0.036
const FLOOR_COLOR = '#0b0a09'

/** Layer for things the floor mirror must not see (it would reflect them into themselves). */
const NO_REFLECT_LAYER = 1

const poolVertex = /* glsl */ `
varying vec2 vPos;
void main() {
  vPos = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

/**
 * Light that the core throws on the floor. An inverse-square pool from a
 * source at core height, cut by six soft spokes where the fins stand in the way.
 */
const poolFragment = /* glsl */ `
uniform float uEnergy;
uniform float uSpoke;
uniform float uHeight;
uniform float uRadius;
varying vec2 vPos;
void main() {
  float r = length(vPos);
  // atan(0, 0) is undefined; the offset keeps the exact centre well defined.
  float theta = atan(vPos.y, vPos.x + 0.00001);
  float pool = pow(uHeight * uHeight / (uHeight * uHeight + r * r), 1.5);
  // The pedestal shades the floor right around its own foot.
  float contact = smoothstep(2.1, 3.1, r);
  float spoke = smoothstep(0.45, 1.0, 0.5 + 0.5 * cos(6.0 * (theta - uSpoke)));
  float shade = 1.0 - 0.55 * spoke * smoothstep(2.3, 3.2, r) * (1.0 - smoothstep(4.5, 10.0, r));
  float edge = 1.0 - smoothstep(uRadius * 0.5, uRadius, r);
  vec3 col = vec3(1.0, 0.5, 0.17) * pool * contact * shade * edge * uEnergy * 0.085;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

const silhouettes = lazy(() => {
  // A broken colonnade far out in the fog. Heights and spacing are deliberately uneven.
  const columns: THREE.Matrix4[] = []
  const count = 18
  for (let k = 0; k < count; k++) {
    const a = (k / count) * Math.PI * 2 + 0.2
    const wobble = Math.sin(k * 12.9898) * 43758.5453
    const f = wobble - Math.floor(wobble)
    if (f < 0.16) continue
    const r = 25 + f * 9
    const h = 14 + f * 10
    const w = 1.1 + f * 0.9
    columns.push(matrixFrom([r * Math.cos(a), h / 2, -r * Math.sin(a)], [0, a + 0.3, 0], [w, h, w]))
  }
  return { columns }
})

interface ChamberProps {
  reflection: boolean
  reflectionResolution: number
}

/** The exhibition hall: a floor that fades into fog, and very little else. */
export function Chamber({ reflection, reflectionResolution }: ChamberProps) {
  const camera = useThree((s) => s.camera)
  const s = silhouettes()

  useEffect(() => {
    camera.layers.enable(NO_REFLECT_LAYER)
  }, [camera])

  const mats = useMemo(() => {
    // The floor must not sample the studio environment: at grazing angles it
    // would mirror the light panels and glow orange to the horizon. Giving the
    // mirror material its own black environment switches that off.
    // 64x32, not 1x1: the prefilter derives its cube size from the width, and a
    // sub-texel cube produces shader constants that fail to compile.
    const blackEnv = new THREE.DataTexture(new Uint8Array(64 * 32 * 4), 64, 32)
    blackEnv.mapping = THREE.EquirectangularReflectionMapping
    blackEnv.needsUpdate = true
    return {
      blackEnv,
      pool: new THREE.ShaderMaterial({
        uniforms: {
          uEnergy: { value: 0 },
          uSpoke: { value: FIN_AZIMUTH_OFFSET },
          uHeight: { value: CORE_Y },
          uRadius: { value: 14 },
        },
        vertexShader: poolVertex,
        fragmentShader: poolFragment,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      // Lambert ignores the environment map, which is exactly what these need.
      floor: new THREE.MeshLambertMaterial({ color: FLOOR_COLOR, dithering: true }),
      stone: new THREE.MeshLambertMaterial({ color: '#0d0c0a' }),
    }
  }, [])

  useFrame(() => {
    mats.pool.uniforms.uEnergy.value = sim.energy
  })

  return (
    <group name="Chamber">
      {reflection ? (
        <mesh name="Floor" rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[70, 96]} />
          <MeshReflectorMaterial
            resolution={reflectionResolution}
            blur={[480, 140]}
            mixBlur={1}
            // The reflection is multiplied by the near-black floor colour, so it needs a large gain.
            mixStrength={16}
            mixContrast={1}
            depthScale={0}
            mirror={0.6}
            color={FLOOR_COLOR}
            // Fully rough: a glossier floor throws the rim light back as an orange sheen.
            roughness={1}
            metalness={0}
            envMap={mats.blackEnv}
            envMapIntensity={0}
            dithering
          />
        </mesh>
      ) : (
        <mesh name="Floor" rotation={[-Math.PI / 2, 0, 0]} material={mats.floor} receiveShadow>
          <circleGeometry args={[70, 96]} />
        </mesh>
      )}

      <mesh
        name="FloorLight"
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.006, 0]}
        material={mats.pool}
        layers={NO_REFLECT_LAYER}
        renderOrder={-1}
      >
        <circleGeometry args={[14, 96]} />
      </mesh>

      <Instanced name="Colonnade" geometry={unitBox()} material={mats.stone} matrices={s.columns} />
    </group>
  )
}
