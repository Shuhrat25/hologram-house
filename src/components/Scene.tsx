import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AdaptiveDpr, OrbitControls, TrackballControls } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette, ChromaticAberration, Noise } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import { ModelStage, type ModelInfo } from './ModelStage'
import { Backdrop } from './Backdrop'
import { MatrixRain } from './MatrixRain'
import { IntroRays } from './IntroRays'
import { IntroDrones, DRONE_COUNT } from './IntroDrones'
import { MODELS, type Settings } from '../settings'

/** Свет для текстурированного режима — гаснет, когда включена голограмма. */
function StageLights({ mode, shadowKey }: { mode: Settings['mode']; shadowKey: string }) {
  const key = useRef<THREE.DirectionalLight>(null)
  const fill = useRef<THREE.DirectionalLight>(null)
  const amb = useRef<THREE.HemisphereLight>(null)
  const level = useRef(mode === 'real' ? 1 : 0)

  // карта теней статична: свет и модель не двигаются. Пересчитываем её только
  // при смене режима или объекта, а не 60 раз в секунду по 466k треугольников.
  useEffect(() => {
    if (!key.current) return
    key.current.shadow.autoUpdate = false
    key.current.shadow.needsUpdate = true
  }, [shadowKey])

  useFrame((_, delta) => {
    level.current = THREE.MathUtils.damp(level.current, mode === 'real' ? 1 : 0, 7, Math.min(delta, 0.05))
    if (key.current) {
      key.current.intensity = 3.1 * level.current
      // теневой проход не нужен, пока модель скрыта голограммой
      key.current.castShadow = level.current > 0.02
    }
    if (fill.current) fill.current.intensity = 0.9 * level.current
    if (amb.current) amb.current.intensity = 0.85 * level.current
  })

  return (
    <>
      <hemisphereLight ref={amb} color="#dceaff" groundColor="#2a2118" intensity={0} />
      <directionalLight
        ref={key}
        position={[11, 9, 6]}
        intensity={0}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      >
        <orthographicCamera attach="shadow-camera" args={[-8, 8, 8, -8, 1, 34]} />
      </directionalLight>
      <directionalLight ref={fill} position={[-8, 6, -9]} intensity={0} color="#9fc4ff" />
    </>
  )
}

/** Ставит камеру по габаритам выбранной модели: домик плоский, титан вытянут. */
function CameraRig({ info, modelId }: { info: ModelInfo; modelId: string }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3; update: () => void } | null

  useEffect(() => {
    // вписываем габаритную сферу в кадр по узкой из двух сторон экрана,
    // иначе на вытянутом окне модель вылезает за края
    const persp = camera as THREE.PerspectiveCamera
    const radius = Math.max(info.radius, info.height * 0.5) * 1.45
    const vFov = THREE.MathUtils.degToRad(persp.fov)
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * persp.aspect)
    const dist = radius / Math.sin(Math.min(vFov, hFov) / 2)
    camera.position.set(dist * 0.5, info.height * 0.62, dist * 0.78)
    camera.lookAt(0, info.height * 0.45, 0)
    if (controls) {
      controls.target.set(0, info.height * 0.45, 0)
      controls.update()
    }
  }, [info, modelId, camera, controls])

  return null
}

function Regressor({ dragging }: { dragging: RefObject<boolean> }) {
  const regress = useThree((s) => s.performance.regress)
  useFrame(() => {
    if (dragging.current) regress()
  })
  return null
}

function Effects({ settings }: { settings: Settings }) {
  const offset = useMemo(() => new THREE.Vector2(0.00035, 0.00025), [])
  const holo = settings.mode === 'holo'
  return (
    <EffectComposer multisampling={2}>
      <Bloom
        intensity={settings.bloom * (holo ? 1 : 0.4)}
        luminanceThreshold={holo ? 0.42 : 0.75}
        luminanceSmoothing={0.28}
        mipmapBlur
      />
      <ChromaticAberration offset={offset} radialModulation modulationOffset={0.35} />
      <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={holo ? 0.35 : 0.12} />
      <Vignette eskil={false} offset={0.25} darkness={0.85} />
    </EffectComposer>
  )
}

export function Scene({ settings }: { settings: Settings }) {
  const [info, setInfo] = useState<ModelInfo>({ radius: 5, height: 6 })
  const onReady = useCallback((next: ModelInfo) => setInfo(next), [])
  const introRef = useRef(0)
  const skipRef = useRef(false)
  const dragging = useRef(false)
  // позиции дронов, из которых бьют лучи
  const emittersRef = useRef(new Float32Array(DRONE_COUNT * 3))
  const model = MODELS.find((m) => m.id === settings.modelId) ?? MODELS[0]

  return (
    <Canvas
      shadows={{ type: THREE.PCFShadowMap }}
      dpr={[1, 1.5]}
      // просадка разрешения на время вращения. 0.85 почти незаметно глазом;
      // ниже картинка начинает мылить, а это раздражает сильнее, чем помогает
      performance={{ min: 0.85 }}
      gl={{ antialias: false, powerPreference: 'high-performance', toneMapping: THREE.NeutralToneMapping, preserveDrawingBuffer: import.meta.env.DEV }}
      camera={{ position: [10.5, 6.5, 12.5], fov: 42, near: 0.1, far: 200 }}
      onCreated={(state) => {
        if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__three = state
      }}
    >
      <color attach="background" args={['#04060b']} />
      <Backdrop settings={settings} />

      <MatrixRain settings={settings} introRef={introRef} />

      <Suspense fallback={null}>
        {/* key: смена модели — это полный перезапуск сцены и сборки */}
        <ModelStage
          key={model.id}
          model={model}
          settings={settings}
          introRef={introRef}
          skipRef={skipRef}
          onReady={onReady}
        />
        <IntroDrones
          settings={settings}
          introRef={introRef}
          emittersRef={emittersRef}
          radius={info.radius}
          height={info.height}
        />
      </Suspense>

      <IntroRays
        settings={settings}
        introRef={introRef}
        emittersRef={emittersRef}
        radius={info.radius}
        height={info.height}
      />

      <StageLights mode={settings.mode} shadowKey={model.id + ':' + settings.mode + ':' + info.height.toFixed(2)} />
      <CameraRig info={info} modelId={model.id} />

      {settings.freeRotate ? (
        // свободное вращение по всем трём осям, включая крен
        <TrackballControls
          makeDefault
          onStart={() => {
            skipRef.current = true
            dragging.current = true
          }}
          onEnd={() => (dragging.current = false)}
          // без инерции: камера идёт ровно за курсором
          staticMoving
          rotateSpeed={2.4}
          zoomSpeed={1.1}
          panSpeed={0.5}
          minDistance={4}
          maxDistance={60}
        />
      ) : (
        // полная сфера: 360° по горизонтали и по вертикали, включая вид снизу.
        // Демпфирование выключено намеренно: с ним камера догоняет курсор
        // с задержкой, и резкая смена направления читается как лаг
        <OrbitControls
          makeDefault
          enableDamping={false}
          onStart={() => {
            skipRef.current = true
            dragging.current = true
          }}
          onEnd={() => (dragging.current = false)}
          autoRotate={settings.autoRotate}
          autoRotateSpeed={0.45}
          minDistance={4}
          maxDistance={60}
          minPolarAngle={0.001}
          maxPolarAngle={Math.PI - 0.001}
        />
      )}

      <Regressor dragging={dragging} />
      <AdaptiveDpr />
      <Effects settings={settings} />
    </Canvas>
  )
}
