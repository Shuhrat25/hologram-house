import { useState } from 'react'
import { MODELS, thumbUrl, type ModelDef } from '../settings'

type Props = {
  current: string
  onSelect: (id: string) => void
}

export function ModelSwitcher({ current, onSelect }: Props) {
  return (
    <nav className="models" aria-label="Объекты">
      {MODELS.map((m) => (
        <button
          key={m.id}
          className={m.id === current ? 'model-card active' : 'model-card'}
          onClick={() => onSelect(m.id)}
          aria-pressed={m.id === current}
        >
          <Thumb model={m} />
          <span className="model-name">{m.name}</span>
          <span className="model-tris">{(m.tris / 1000).toFixed(0)}k △</span>
        </button>
      ))}
    </nav>
  )
}

/** Пока превью не отрисовано, показываем каркасный кубик-заглушку. */
function Thumb({ model }: { model: ModelDef }) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <span className="model-thumb">
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
            <path d="M24 6 42 15v18l-18 9-18-9V15z" opacity="0.9" />
            <path d="M6 15l18 9 18-9M24 24v18" opacity="0.45" />
          </g>
        </svg>
      </span>
    )
  }

  return (
    <span className="model-thumb">
      <img src={thumbUrl(model)} alt="" loading="lazy" onError={() => setFailed(true)} />
    </span>
  )
}
