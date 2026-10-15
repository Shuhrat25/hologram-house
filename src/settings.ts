export type Mode = 'holo' | 'real'

export type Palette = {
  id: string
  label: string
  color: string
  edge: string
}

export const PALETTES: Palette[] = [
  { id: 'cyan',   label: 'Циан',    color: '#1ec8ff', edge: '#dcfbff' },
  { id: 'violet', label: 'Фиолет',  color: '#9a6bff', edge: '#f0e6ff' },
  { id: 'lime',   label: 'Изумруд', color: '#2bffa3', edge: '#e6fff4' },
  { id: 'amber',  label: 'Янтарь',  color: '#ffab2e', edge: '#fff3d6' },
]

export type ModelDef = {
  id: string
  name: string
  file: string
  author: string
  license: string
  /** Треугольников после оптимизации — показываем в карточке. */
  tris: number
}

export const MODELS: ModelDef[] = [
  {
    id: 'house',
    name: 'Home Sweet Home',
    file: 'home_sweet_home_web.glb',
    author: 'Home Design 3D',
    license: 'CC BY-NC-SA 4.0',
    tris: 466099,
  },
  {
    id: 'titan',
    name: 'Horned Titan',
    file: 'horned_titan.glb',
    author: 'iRahulRajput',
    license: 'CC BY 4.0',
    tris: 329746,
  },
  {
    id: 'sword',
    name: 'Da Vinci Sword',
    file: 'davinci_sword.glb',
    author: 'nodgerty',
    license: 'CC BY 4.0',
    tris: 35769,
  },
  {
    id: 'spark',
    name: '343 Guilty Spark',
    file: 'guilty_spark.glb',
    author: 'jameslucino117',
    license: 'CC BY 4.0',
    tris: 120801,
  },
]

export const modelUrl = (m: ModelDef) => `${import.meta.env.BASE_URL}models/${m.file}`
export const thumbUrl = (m: ModelDef) => `${import.meta.env.BASE_URL}thumbs/${m.id}.png`

export type Settings = {
  mode: Mode
  modelId: string
  palette: string
  /** Доля прозрачности внешней оболочки: 0.75 = 75%. */
  shellTransparency: number
  /** Доля прозрачности начинки. Ниже оболочки — внутренности читаются плотнее. */
  interiorTransparency: number
  scanSpeed: number
  grid: number
  glitch: number
  bloom: number
  autoRotate: boolean
  freeRotate: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  // первым показываем обычную модель — на голограмму пользователь переходит сам
  mode: 'real',
  modelId: MODELS[0].id,
  palette: 'cyan',
  shellTransparency: 0.75,
  interiorTransparency: 0.45,
  scanSpeed: 0.55,
  grid: 0.22,
  glitch: 1,
  bloom: 0.9,
  autoRotate: true,
  freeRotate: false,
}
