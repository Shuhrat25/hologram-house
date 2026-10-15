import { useEffect, useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
// берём загрузчик из three-stdlib: drei собирает GLTFLoader оттуда же,
// иначе setKTX2Loader не сходится по типам
import { KTX2Loader } from 'three-stdlib'
import { createHologramMaterial, createHologramUniforms } from '../three/hologramMaterial'
import { mergeSceneGeometry } from '../three/mergeGeometry'
import { INTRO_TIME, buildProgress } from '../three/introTimeline'
import { MODELS, PALETTES, modelUrl, type ModelDef, type Settings } from '../settings'

const TARGET_SIZE = 10

export type ModelInfo = { height: number; radius: number }

type Props = {
  model: ModelDef
  settings: Settings
  introRef: RefObject<number>
  /** Взведён, когда пользователь тронул камеру: досматриваем интро мгновенно. */
  skipRef: RefObject<boolean>
  onReady?: (info: ModelInfo) => void
}

export function ModelStage({ model, settings, introRef, skipRef, onReady }: Props) {
  const gl = useThree((s) => s.gl)
  // KTX2 остаётся сжатым в видеопамяти; транскодер лежит локально, без CDN
  const ktx2 = useMemo(
    () => new KTX2Loader().setTranscoderPath(`${import.meta.env.BASE_URL}basis/`).detectSupport(gl),
    [gl],
  )
  const { scene } = useGLTF(modelUrl(model), true, true, (loader) => loader.setKTX2Loader(ktx2))

  // кешируем по модели: возврат к уже виденному объекту не пересобирает буфер
  const geometry = useMemo(() => mergeSceneGeometry(scene, model.id), [scene, model.id])

  // единая нормализация: модель в центр по XZ, низом на y = 0, макс. габарит = TARGET_SIZE
  const fit = useMemo(() => {
    const box = geometry.boundingBox ?? new THREE.Box3()
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const scale = TARGET_SIZE / Math.max(size.x, size.y, size.z)
    return {
      scale,
      position: [-center.x * scale, -box.min.y * scale, -center.z * scale] as [number, number, number],
      height: size.y * scale,
      radius: (Math.max(size.x, size.z) * scale) / 2,
    }
  }, [geometry])

  const uniforms = useMemo(() => createHologramUniforms(), [])
  const materials = useMemo(
    () => ({
      depth: createHologramMaterial('depth', uniforms),
      ghost: createHologramMaterial('ghost', uniforms),
      front: createHologramMaterial('front', uniforms),
    }),
    [uniforms],
  )

  // только флаги теней. Прозрачность материалам НЕ включаем: 75 мешей в прозрачной
  // очереди — это пересортировка каждый кадр, отключённый early-Z и блендинг на всём.
  // Кроссфейд делает голограмма, растворяясь поверх обычной модели.
  useMemo(() => {
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
    })
  }, [scene])

  const holoRef = useRef<THREE.Group>(null)
  const ghostRef = useRef<THREE.Mesh>(null)
  const realRef = useRef<THREE.Group>(null)
  const blend = useRef(settings.mode === 'holo' ? 1 : 0)
  const introStart = useRef(performance.now())

  useEffect(() => {
    uniforms.uHeight.value = fit.height
    uniforms.uMinY.value = 0
    uniforms.uSpread.value = 0
    onReady?.({ height: fit.height, radius: fit.radius })
  }, [fit, uniforms, onReady])

  // каждое включение голограммы заново проигрывает сборку
  useEffect(() => {
    if (settings.mode !== 'holo') return
    introStart.current = performance.now()
    introRef.current = 0
    skipRef.current = false
  }, [settings.mode, introRef, skipRef])

  useEffect(() => {
    const palette = PALETTES.find((p) => p.id === settings.palette) ?? PALETTES[0]
    uniforms.uColor.value.set(palette.color)
    uniforms.uEdgeColor.value.set(palette.edge)
  }, [settings.palette, uniforms])

  // геометрию не освобождаем — она лежит в кеше mergeSceneGeometry и переживает
  // размонтирование, чтобы возврат к объекту был мгновенным
  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials])

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05)
    const target = settings.mode === 'holo' ? 1 : 0
    // на голограмму уходим быстро: текстурированная модель должна исчезнуть
    // раньше, чем начнётся сборка — объект собирается с пустого места
    blend.current = THREE.MathUtils.damp(blend.current, target, target === 1 ? 18 : 7, dt)
    if (settings.mode === 'holo') {
      // по настенным часам, а не по накопленным кадрам: при просадке fps
      // сборка всё равно идёт с нужной скоростью
      introRef.current = skipRef.current
        ? 1
        : Math.min(1, (performance.now() - introStart.current) / (INTRO_TIME * 1000))
    }

    uniforms.uTime.value = state.clock.elapsedTime
    uniforms.uOpacity.value = blend.current
    uniforms.uAssemble.value = buildProgress(introRef.current)
    // проценты из панели: оболочка тем тоньше, чем выше её прозрачность,
    // начинка — наоборот, её процент обычно ниже
    uniforms.uDensity.value = 1 - settings.shellTransparency
    uniforms.uGhost.value = (1 - settings.interiorTransparency) * 1.2
    uniforms.uScanSpeed.value = settings.scanSpeed
    uniforms.uGridStrength.value = settings.grid
    uniforms.uGlitch.value = settings.glitch

    if (holoRef.current) holoRef.current.visible = blend.current > 0.01
    // обычная модель переключается мгновенно — растворяется голограмма поверх неё
    if (realRef.current) realRef.current.visible = settings.mode === 'real'

    // пока камеру крутят, самый дорогой проход (начинка) отключаем:
    // он даёт больше всего перерисовки и не даёт early-Z ничего отсечь
    if (ghostRef.current) {
      ghostRef.current.visible = blend.current > 0.01 && state.performance.current > 0.9
    }
  })

  return (
    <group scale={fit.scale} position={fit.position}>
      <group ref={holoRef}>
        {/* 1. глубина: прибивает ближайший слой */}
        <mesh geometry={geometry} material={materials.depth} frustumCulled={false} renderOrder={0} />
        {/* 2. начинка за ним — видна насквозь */}
        <mesh ref={ghostRef} geometry={geometry} material={materials.ghost} frustumCulled={false} renderOrder={1} />
        {/* 3. сам голограммный слой */}
        <mesh geometry={geometry} material={materials.front} frustumCulled={false} renderOrder={2} />
      </group>

      <group ref={realRef}>
        <primitive object={scene} />
      </group>
    </group>
  )
}

useGLTF.preload(modelUrl(MODELS[0]))
