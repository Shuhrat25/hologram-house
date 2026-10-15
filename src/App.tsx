import { useCallback, useEffect, useState } from 'react'
import { Scene } from './components/Scene'
import { ControlPanel } from './ui/ControlPanel'
import { ModelSwitcher } from './ui/ModelSwitcher'
import { Loader } from './ui/Loader'
import { DEFAULT_SETTINGS, MODELS, PALETTES, type Settings } from './settings'
import './App.css'

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const patch = useCallback((p: Partial<Settings>) => setSettings((s) => ({ ...s, ...p })), [])

  // H или пробел — переключение режима
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.code === 'Space' || e.key.toLowerCase() === 'h' || e.key.toLowerCase() === 'р') {
        e.preventDefault()
        setSettings((s) => ({ ...s, mode: s.mode === 'holo' ? 'real' : 'holo' }))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const palette = PALETTES.find((p) => p.id === settings.palette) ?? PALETTES[0]
  const model = MODELS.find((m) => m.id === settings.modelId) ?? MODELS[0]
  const holo = settings.mode === 'holo'

  return (
    <div className="app" style={{ ['--accent' as string]: holo ? palette.color : '#c8d4e6' }}>
      <Scene settings={settings} />

      <header className="hud">
        <div className="hud-title">{model.name}</div>
        <div className="hud-sub">
          {holo ? 'РЕЖИМ ПРОЕКЦИИ · СКАНИРОВАНИЕ АКТИВНО' : 'РЕЖИМ ПРОСМОТРА · МАТЕРИАЛЫ PBR'}
        </div>
      </header>

      <div className="hint">ЛКМ — поворот 360° · колесо — зум · ПКМ — сдвиг · H / Пробел — режим</div>

      <ModelSwitcher current={model.id} onSelect={(id) => patch({ modelId: id })} />

      <ControlPanel settings={settings} onChange={patch} />

      <footer className="credits">
        «{model.name}» — {model.author} (Sketchfab), {model.license}
      </footer>

      <Loader />
    </div>
  )
}
