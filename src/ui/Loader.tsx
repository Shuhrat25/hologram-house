import { useEffect, useState } from 'react'
import { useProgress } from '@react-three/drei'

export function Loader() {
  const { active, progress } = useProgress()
  const [gone, setGone] = useState(false)

  useEffect(() => {
    if (active || progress < 100) return
    const id = setTimeout(() => setGone(true), 700)
    return () => clearTimeout(id)
  }, [active, progress])

  if (gone) return null
  const visible = active || progress < 100

  return (
    <div className={visible ? 'loader' : 'loader done'}>
      <div className="loader-inner">
        <div className="loader-title">ИНИЦИАЛИЗАЦИЯ ПРОЕКЦИИ</div>
        <div className="loader-bar">
          <span style={{ width: `${progress.toFixed(0)}%` }} />
        </div>
        <div className="loader-pct">{progress.toFixed(0)}%</div>
      </div>
    </div>
  )
}
