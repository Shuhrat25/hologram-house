import * as THREE from 'three'

/**
 * Собранная геометрия переживает размонтирование: вернувшись к объекту,
 * пользователь не должен ждать пересборку полумиллиона вершин заново.
 */
const cache = new Map<string, THREE.BufferGeometry>()

type Part = {
  geometry: THREE.BufferGeometry
  matrix: THREE.Matrix4
  normalMatrix: THREE.Matrix3
  vertexCount: number
  indexCount: number
}

/**
 * Сливает все меши объекта в один буфер (position + normal).
 *
 * Собирается за ОДИН проход в заранее выделенные массивы. Наивный путь —
 * построить по временной BufferGeometry на меш, прогнать `applyMatrix4`
 * и скормить всё `mergeGeometries` — это три полных прохода по вершинам
 * и 75 промежуточных объектов на выброс; на доме в 512k вершин он заметно
 * подвешивал кадр при смене объекта.
 *
 * Матрица применяется вручную, потому что `applyMatrix4` по нормализованным
 * Int16-позициям (KHR_mesh_quantization) писал бы дробные значения в
 * целочисленный массив и рвал модель.
 *
 * Результат живёт в системе координат РОДИТЕЛЯ root — ровно там же, где
 * рендерится сам root, и независимо от того, куда его потом примонтируют.
 */
export function mergeSceneGeometry(root: THREE.Object3D, cacheKey?: string): THREE.BufferGeometry {
  if (cacheKey) {
    const hit = cache.get(cacheKey)
    if (hit) return hit
  }

  root.updateWorldMatrix(true, true)
  const toRootParent = new THREE.Matrix4()
  if (root.parent) {
    root.parent.updateWorldMatrix(true, false)
    toRootParent.copy(root.parent.matrixWorld).invert()
  }

  // --- 1. перепись мешей и подсчёт итоговых размеров ---
  const parts: Part[] = []
  let vertexTotal = 0
  let indexTotal = 0

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const position = mesh.geometry.getAttribute('position')
    if (!position) return

    const matrix = new THREE.Matrix4().multiplyMatrices(toRootParent, mesh.matrixWorld)
    const indexCount = mesh.geometry.index ? mesh.geometry.index.count : position.count

    parts.push({
      geometry: mesh.geometry,
      matrix,
      normalMatrix: new THREE.Matrix3().getNormalMatrix(matrix),
      vertexCount: position.count,
      indexCount,
    })
    vertexTotal += position.count
    indexTotal += indexCount
  })

  if (!parts.length) throw new Error('В модели нет мешей с позициями')

  // --- 2. один проход: читаем, трансформируем и сразу пишем в итоговый буфер ---
  const positions = new Float32Array(vertexTotal * 3)
  const normals = new Float32Array(vertexTotal * 3)
  const indices = vertexTotal > 65535 ? new Uint32Array(indexTotal) : new Uint16Array(indexTotal)

  let vertexOffset = 0
  let indexOffset = 0

  for (const part of parts) {
    const position = part.geometry.getAttribute('position')
    const normal = part.geometry.getAttribute('normal')
    const m = part.matrix.elements
    const n = part.normalMatrix.elements

    for (let i = 0; i < part.vertexCount; i++) {
      const x = position.getX(i)
      const y = position.getY(i)
      const z = position.getZ(i)
      const o = (vertexOffset + i) * 3

      positions[o] = m[0] * x + m[4] * y + m[8] * z + m[12]
      positions[o + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]
      positions[o + 2] = m[2] * x + m[6] * y + m[10] * z + m[14]

      if (normal) {
        const nx = normal.getX(i)
        const ny = normal.getY(i)
        const nz = normal.getZ(i)
        const tx = n[0] * nx + n[3] * ny + n[6] * nz
        const ty = n[1] * nx + n[4] * ny + n[7] * nz
        const tz = n[2] * nx + n[5] * ny + n[8] * nz
        const lenSq = tx * tx + ty * ty + tz * tz
        const inv = lenSq > 1e-12 ? 1 / Math.sqrt(lenSq) : 0
        normals[o] = tx * inv
        normals[o + 1] = ty * inv
        normals[o + 2] = tz * inv
      }
    }

    const index = part.geometry.index
    if (index) {
      // индексы всегда плоский целочисленный массив — читаем напрямую, без аксессора
      const src = index.array as ArrayLike<number>
      for (let i = 0; i < part.indexCount; i++) indices[indexOffset + i] = src[i] + vertexOffset
    } else {
      for (let i = 0; i < part.indexCount; i++) indices[indexOffset + i] = vertexOffset + i
    }

    vertexOffset += part.vertexCount
    indexOffset += part.indexCount
  }

  const merged = new THREE.BufferGeometry()
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  merged.setIndex(new THREE.BufferAttribute(indices, 1))
  merged.computeBoundingBox()
  merged.computeBoundingSphere()

  if (cacheKey) cache.set(cacheKey, merged)
  return merged
}
