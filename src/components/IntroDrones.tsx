import { useEffect, useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { mergeSceneGeometry } from '../three/mergeGeometry'
import { BUILD_END, BUILD_START, DRONE_IN_END, HOLD_END, clamp01, smootherstep } from '../three/introTimeline'
import { PALETTES, type Settings } from '../settings'

const DRONE_URL = `${import.meta.env.BASE_URL}models/spark_drone.glb`
export const DRONE_COUNT = 3

const vertexShader = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    vec3 n = mat3(modelMatrix) * normal;
    vWorldNormal = dot(n, n) > 1e-12 ? normalize(n) : vec3(0.0, 1.0, 0.0);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

/** Дрон мелкий в кадре, поэтому один проход: френель-оболочка и тёплое ядро. */
const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3  uColor;
  uniform vec3  uEdgeColor;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;

  // у упрощённых мешей попадаются вырожденные треугольники с нулевой нормалью;
  // normalize(vec3(0)) даёт NaN, а mipmap-блюр Bloom разносит его по всему кадру
  vec3 safeNormal(vec3 n) {
    return dot(n, n) > 1e-12 ? normalize(n) : vec3(0.0, 1.0, 0.0);
  }

  void main() {
    vec3 N = safeNormal(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float ndv = 1.0 - abs(dot(N, V));
    float fres = ndv * ndv;
    float pulse = 0.86 + 0.14 * sin(uTime * 6.0);

    float alpha = (0.18 + fres * 1.05) * uOpacity * pulse;
    vec3 col = mix(uColor, uEdgeColor, fres * 0.8) * (0.7 + fres * 1.6);

    gl_FragColor = vec4(col * alpha, alpha);
    #include <colorspace_fragment>
  }
`

type Props = {
  settings: Settings
  introRef: RefObject<number>
  /** Позиции дронов в мире — отсюда лучи берут своё начало. */
  emittersRef: RefObject<Float32Array>
  radius: number
  height: number
}

export function IntroDrones({ settings, introRef, emittersRef, radius, height }: Props) {
  const { scene } = useGLTF(DRONE_URL)

  // приводим дрон к единичному размеру и центру, чтобы ставить его матрицей
  const geometry = useMemo(() => {
    const geo = mergeSceneGeometry(scene)
    const box = geo.boundingBox ?? new THREE.Box3()
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const k = 1 / Math.max(size.x, size.y, size.z)
    geo.translate(-center.x, -center.y, -center.z)
    geo.scale(k, k, k)
    geo.computeBoundingBox()
    geo.computeBoundingSphere()
    return geo
  }, [scene])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uOpacity: { value: 0 },
          uColor: { value: new THREE.Color('#1ec8ff') },
          uEdgeColor: { value: new THREE.Color('#ffffff') },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.FrontSide,
      }),
    [],
  )

  useEffect(() => {
    const palette = PALETTES.find((p) => p.id === settings.palette) ?? PALETTES[0]
    material.uniforms.uColor.value.set(palette.color)
    material.uniforms.uEdgeColor.value.set(palette.edge)
  }, [settings.palette, material])

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  const group = useRef<THREE.Group>(null)
  const drones = useRef<(THREE.Mesh | null)[]>([])
  const look = useMemo(() => new THREE.Vector3(), [])

  const droneScale = Math.max(height, radius) * 0.26
  const orbit = Math.max(radius * 1.15, height * 0.8)

  useFrame((state) => {
    const intro = introRef.current
    const active = settings.mode === 'holo' && intro < 0.999
    if (group.current) group.current.visible = active
    if (!active) return

    // влёт, работа, разворот к объекту, отлёт
    const arrive = smootherstep(0, DRONE_IN_END, intro)
    const leave = smootherstep(HOLD_END, 1, intro)
    const fade = Math.min(smootherstep(0, DRONE_IN_END * 0.7, intro), 1 - leave)

    material.uniforms.uTime.value = state.clock.elapsedTime
    material.uniforms.uOpacity.value = fade

    // высота дронов идёт за фронтом сборки — видно, что они его и ведут
    const build = clamp01((intro - BUILD_START) / (BUILD_END - BUILD_START))
    // дроны идут над фронтом сборки: свет всегда падает сверху вниз
    const workY = height * (0.95 + build * 0.85)
    const spin = intro * Math.PI * 1.5

    for (let i = 0; i < DRONE_COUNT; i++) {
      const mesh = drones.current[i]
      if (!mesh) continue
      const phase = spin + (i / DRONE_COUNT) * Math.PI * 2
      // радиус: снаружи -> рабочая орбита -> снова наружу
      const r = THREE.MathUtils.lerp(orbit * 3.2, orbit, arrive) + leave * orbit * 3.0
      const y = THREE.MathUtils.lerp(height * 2.6, workY, arrive) + leave * height * 1.6

      mesh.position.set(Math.cos(phase) * r, y, Math.sin(phase) * r)
      mesh.scale.setScalar(droneScale)
      look.set(0, height * 0.5, 0)
      mesh.lookAt(look)

      if (emittersRef.current) {
        emittersRef.current[i * 3] = mesh.position.x
        emittersRef.current[i * 3 + 1] = mesh.position.y
        emittersRef.current[i * 3 + 2] = mesh.position.z
      }
    }
  })

  return (
    <group ref={group} visible={false}>
      {Array.from({ length: DRONE_COUNT }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            drones.current[i] = m
          }}
          geometry={geometry}
          material={material}
          frustumCulled={false}
          renderOrder={5}
        />
      ))}
    </group>
  )
}

useGLTF.preload(DRONE_URL)
