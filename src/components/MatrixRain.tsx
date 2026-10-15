import { useEffect, useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { BUILD_END, BUILD_START } from '../three/introTimeline'
import { PALETTES, type Settings } from '../settings'

/** Квад на весь экран: позиция пишется прямо в NDC, камера на него не влияет. */
const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.9999, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform float uAspect;
  uniform vec3  uColor;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    // ячейки под символы
    float cols = 134.0;
    vec2 cell = vec2(cols, floor(cols / uAspect * 0.66));
    vec2 id = floor(vUv * cell);
    vec2 f = fract(vUv * cell);

    // колонка падает со своей скоростью
    float colSeed = hash(vec2(id.x, 17.0));
    float head = fract(uTime * (0.22 + colSeed * 0.5) + colSeed);
    float y = 1.0 - vUv.y;
    float tail = fract(head - y);
    float bright = exp(-tail * 7.5);
    bright += smoothstep(0.985, 1.0, 1.0 - tail) * 1.6;   // белая голова

    // грубый знакогенератор 3x5 точек
    vec2 sub = floor(f * vec2(4.0, 6.0));
    float glyph = step(0.58, hash(id * 7.3 + sub + floor(uTime * 7.0)));
    glyph *= step(0.16, f.x) * step(f.x, 0.84) * step(0.10, f.y) * step(f.y, 0.90);

    // центр оставляем модели — дождь идёт по бокам
    float side = smoothstep(0.30, 0.85, abs(vUv.x - 0.5) * 2.0);

    float alpha = glyph * bright * side * uOpacity;
    vec3 col = mix(uColor, vec3(1.0), smoothstep(1.0, 2.2, bright));

    gl_FragColor = vec4(col * alpha, alpha);
    #include <colorspace_fragment>
  }
`

type Props = { settings: Settings; introRef: RefObject<number> }

export function MatrixRain({ settings, introRef }: Props) {
  const size = useThree((s) => s.size)

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uOpacity: { value: 0 },
          uAspect: { value: 1.6 },
          uColor: { value: new THREE.Color('#1ec8ff') },
        },
        transparent: false,
        blending: THREE.AdditiveBlending,
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
    material.uniforms.uColor.value.set(palette.color)
  }, [settings.palette, material])

  useEffect(() => () => material.dispose(), [material])

  const ref = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    const intro = introRef.current
    // быстро проявляется, гаснет к концу сборки
    const level =
      settings.mode === 'holo'
        ? Math.min(1, intro / (BUILD_START * 0.8)) * (1 - smootherstep(BUILD_END * 0.75, BUILD_END + 0.06, intro))
        : 0
    material.uniforms.uTime.value = state.clock.elapsedTime
    material.uniforms.uOpacity.value = level
    if (ref.current) ref.current.visible = level > 0.005
  })

  return (
    <mesh ref={ref} material={material} frustumCulled={false} renderOrder={-1000} visible={false}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  )
}

function smootherstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
