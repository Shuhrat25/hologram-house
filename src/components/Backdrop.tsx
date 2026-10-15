import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { PALETTES, type Settings } from '../settings'

/** Квад на весь экран: позиция пишется прямо в NDC, камера на него не влияет. */
const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.99999, 1.0);
  }
`

/**
 * Свечение вокруг объекта — это не box-shadow и не виньетка: и то и другое
 * работает от краёв кадра, а не от объекта. Здесь радиальная подложка, которая
 * подсвечивает центр сцены, а сам ореол вокруг силуэта даёт Bloom.
 */
const fragmentShader = /* glsl */ `
  uniform float uAspect;
  uniform float uGlow;
  uniform vec3  uInner;
  uniform vec3  uOuter;
  varying vec2 vUv;

  void main() {
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
    float r = clamp(length(p) * 1.45, 0.0, 1.0);
    float falloff = smoothstep(0.0, 1.0, r);
    vec3 col = mix(uInner * uGlow, uOuter, falloff);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`

export function Backdrop({ settings }: { settings: Settings }) {
  const size = useThree((s) => s.size)
  const holo = settings.mode === 'holo'

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uAspect: { value: 1.6 },
          uGlow: { value: 1 },
          uInner: { value: new THREE.Color('#0d2230') },
          uOuter: { value: new THREE.Color('#04060b') },
        },
        transparent: false,
        depthTest: false,
        depthWrite: false,
      }),
    [],
  )

  useEffect(() => {
    material.uniforms.uAspect.value = size.width / Math.max(size.height, 1)
  }, [size, material])

  useEffect(() => {
    const palette = PALETTES.find((p) => p.id === settings.palette) ?? PALETTES[0]
    const inner = new THREE.Color(holo ? palette.color : '#8fa6c4')
    // подложка лишь намекает на цвет проекции, иначе фон начинает спорить с объектом
    inner.multiplyScalar(holo ? 0.16 : 0.07).addScalar(0.012)
    material.uniforms.uInner.value.copy(inner)
    material.uniforms.uOuter.value.set(holo ? '#04060b' : '#080a0f')
  }, [settings.palette, holo, material])

  useEffect(() => () => material.dispose(), [material])

  const glow = useRef(holo ? 1 : 0.5)

  useFrame((_, delta) => {
    glow.current = THREE.MathUtils.damp(glow.current, holo ? 1 : 0.5, 6, Math.min(delta, 0.05))
    material.uniforms.uGlow.value = glow.current
  })

  return (
    <mesh material={material} frustumCulled={false} renderOrder={-2000}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  )
}
