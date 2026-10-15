/**
 * Единый таймлайн появления (0..1). Все участники сцены читают одни и те же
 * границы, поэтому луч приходит ровно тогда, когда его участок материализуется.
 */
export const INTRO_TIME = 4.6

/** Дроны влетают. */
export const DRONE_IN_END = 0.17
/** Сборка модели: начинается, едва дроны заняли позиции. */
export const BUILD_START = 0.15
export const BUILD_END = 0.82
/** Пауза «скан завершён»: дроны разворачиваются к объекту. */
export const HOLD_END = 0.9

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Прогресс сборки модели внутри общего таймлайна. */
export const buildProgress = (intro: number) => clamp01((intro - BUILD_START) / (BUILD_END - BUILD_START))

export const smootherstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
