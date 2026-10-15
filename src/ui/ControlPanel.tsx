import { PALETTES, type Settings } from '../settings'

type Props = {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
}

const percent = (v: number) => `${Math.round(v * 100)}%`

export function ControlPanel({ settings, onChange }: Props) {
  const holo = settings.mode === 'holo'

  return (
    <div className="panel">
      <div className="segmented" role="group" aria-label="Режим отображения">
        <button
          className={!holo ? 'seg active' : 'seg'}
          onClick={() => onChange({ mode: 'real' })}
          aria-pressed={!holo}
        >
          Реальный вид
        </button>
        <button
          className={holo ? 'seg active' : 'seg'}
          onClick={() => onChange({ mode: 'holo' })}
          aria-pressed={holo}
        >
          Голограмма
        </button>
      </div>

      <div className={holo ? 'group' : 'group disabled'}>
        <div className="row">
          <span className="label">Цвет</span>
          <div className="swatches">
            {PALETTES.map((p) => (
              <button
                key={p.id}
                className={settings.palette === p.id ? 'swatch active' : 'swatch'}
                style={{ ['--sw' as string]: p.color }}
                onClick={() => onChange({ palette: p.id })}
                title={p.label}
                aria-label={p.label}
              />
            ))}
          </div>
        </div>

        <Slider
          label="Оболочка"
          title="Прозрачность внешней поверхности"
          value={settings.shellTransparency}
          min={0}
          max={0.95}
          step={0.05}
          format={percent}
          onChange={(v) => onChange({ shellTransparency: v })}
        />
        <Slider
          label="Начинка"
          title="Прозрачность внутренностей: чем ниже, тем плотнее они читаются"
          value={settings.interiorTransparency}
          min={0}
          max={0.95}
          step={0.05}
          format={percent}
          onChange={(v) => onChange({ interiorTransparency: v })}
        />
        <Slider
          label="Скан"
          value={settings.scanSpeed}
          min={0}
          max={2}
          step={0.05}
          onChange={(v) => onChange({ scanSpeed: v })}
        />
        <Slider
          label="Сетка"
          value={settings.grid}
          min={0}
          max={0.5}
          step={0.01}
          onChange={(v) => onChange({ grid: v })}
        />
        <Slider
          label="Глитч"
          value={settings.glitch}
          min={0}
          max={2}
          step={0.05}
          onChange={(v) => onChange({ glitch: v })}
        />
      </div>

      <Slider
        label="Свечение"
        value={settings.bloom}
        min={0}
        max={3}
        step={0.05}
        onChange={(v) => onChange({ bloom: v })}
      />

      <label className="check">
        <input
          autoComplete="off"
          type="checkbox"
          checked={settings.freeRotate}
          onChange={(e) => onChange({ freeRotate: e.target.checked })}
        />
        <span>Свободное вращение X / Y / Z</span>
      </label>

      <label className={settings.freeRotate ? 'check disabled' : 'check'}>
        <input
          autoComplete="off"
          type="checkbox"
          checked={settings.autoRotate}
          disabled={settings.freeRotate}
          onChange={(e) => onChange({ autoRotate: e.target.checked })}
        />
        <span>Автовращение</span>
      </label>
    </div>
  )
}

function Slider({
  label,
  title,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string
  title?: string
  value: number
  min: number
  max: number
  step: number
  format?: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <label className="row slider" title={title}>
      <span className="label">{label}</span>
      <input
        autoComplete="off"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="value">{format ? format(value) : value.toFixed(2)}</span>
    </label>
  )
}
