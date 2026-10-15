import { useEffect, useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { DRONE_COUNT } from './IntroDrones'
import { BUILD_END, BUILD_START, HOLD_END, smootherstep } from '../three/introTimeline'
import { PALETTES, type Settings } from '../settings'

const RAYS = 180
const SEGMENTS = 14

/**
 * Начало луча берётся из позиции дрона, конец запечён в геометрию.
 * Поэтому перестраивать буфер каждый кадр не нужно — двигается юниформ.
 */
const vertexShader = /* glsl */ `
  uniform vec3 uEmitters[${DRONE_COUNT}];
  attribute float aT;
  attribute float aSeed;
  attribute float aEmitter;
  varying float vT;
  varying float vSeed;

  void main() {
    vT = aT;
    vSeed = aSeed;

    vec3 from = uEmitters[0];
    for (int i = 1; i < ${DRONE_COUNT}; i++) {
      if (abs(aEmitter - float(i)) < 0.5) from = uEmitters[i];
    }

    vec3 p = mix(from, position, aT);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform float uBuild;
  uniform float uOpacity;
  uniform vec3  uColor;
  uniform vec3  uEdgeColor;
  varying float vT;
  varying float vSeed;

  void main() {
    // фаза жизни луча: 0 — только пошёл, 1 — дотянулся до цели, дальше гаснет
    float phase = (uBuild - vSeed * 0.62) / 0.16;
    if (phase <= 0.0) discard;

    float reach = min(phase, 1.0);
    // фрагменты дальше фронта ещё не зажглись — луч ТЯНЕТСЯ, а не летит
    if (vT > reach) discard;

    // непрерывное тело от дрона до цели, разгорается к точке касания
    float t2 = vT * vT;
    float body = 0.07 + 0.42 * t2 * vT;
    // мягкое уплотнение у фронта, пока он движется
    float frontD = (reach - vT) * 7.0;
    float front = exp(-frontD * frontD) * (1.0 - step(0.999, reach)) * 0.45;
    // отработал — плавно гаснет
    float life = 1.0 - smoothstep(1.0, 2.2, phase);

    float alpha = (body + front) * life * uOpacity;
    vec3 col = mix(uColor, uEdgeColor, clamp(t2 * vT * 0.6 + front, 0.0, 1.0));
    gl_FragColor = vec4(col * alpha, alpha);
    #include <colorspace_fragment>
  }
`

type Props = {
  settings: Settings
  introRef: RefObject<number>
  emittersRef: RefObject<Float32Array>
  radius: number
  height: number
}

export function IntroRays({ settings, introRef, emittersRef, radius, height }: Props) {
  const geometry = useMemo(() => {
    const positions: number[] = []
    const ts: number[] = []
    const seeds: number[] = []
    const emitters: number[] = []
    const to = new THREE.Vector3()

    for (let i = 0; i < RAYS; i++) {
      const ty = Math.random()
      to.set((Math.random() - 0.5) * radius * 1.8, ty * height, (Math.random() - 0.5) * radius * 1.8)
      const emitter = i % DRONE_COUNT

      for (let s = 0; s < SEGMENTS; s++) {
        for (const t of [s / SEGMENTS, (s + 1) / SEGMENTS]) {
          // в буфер кладём КОНЕЦ луча, начало подставит шейдер
          positions.push(to.x, to.y, to.z)
          ts.push(t)
          // чем ниже цель, тем раньше приходит луч — как и сборка снизу вверх
          seeds.push(ty)
          emitters.push(emitter)
        }
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('aT', new THREE.Float32BufferAttribute(ts, 1))
    geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1))
    geo.setAttribute('aEmitter', new THREE.Float32BufferAttribute(emitters, 1))
    return geo
  }, [radius, height])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uBuild: { value: 0 },
          uOpacity: { value: 0 },
          uColor: { value: new THREE.Color('#1ec8ff') },
          uEdgeColor: { value: new THREE.Color('#ffffff') },
          uEmitters: { value: Array.from({ length: DRONE_COUNT }, () => new THREE.Vector3()) },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
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

  const ref = useRef<THREE.LineSegments>(null)

  useFrame(() => {
    const intro = introRef.current
    // лучи живут только пока идёт сборка
    const level =
      settings.mode === 'holo'
        ? smootherstep(BUILD_START * 0.4, BUILD_START, intro) * (1 - smootherstep(BUILD_END, HOLD_END, intro))
        : 0

    const emitters = material.uniforms.uEmitters.value as THREE.Vector3[]
    const src = emittersRef.current
    if (src) {
      for (let i = 0; i < DRONE_COUNT; i++) emitters[i].set(src[i * 3], src[i * 3 + 1], src[i * 3 + 2])
    }

    material.uniforms.uBuild.value = (intro - BUILD_START) / (BUILD_END - BUILD_START)
    material.uniforms.uOpacity.value = level
    if (ref.current) ref.current.visible = level > 0.005
  })

  return (
    <lineSegments ref={ref} geometry={geometry} material={material} frustumCulled={false} visible={false} renderOrder={4} />
  )
}
