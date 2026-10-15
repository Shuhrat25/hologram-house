import * as THREE from 'three'

/** Общий вершинный шейдер: одинаков для всех проходов, иначе разъедется depth-prepass. */
const vertexShader = /* glsl */ `
  uniform float uAssemble;
  uniform float uSpread;
  uniform float uHeight;
  uniform float uMinY;

  varying vec3  vWorldPos;
  varying vec3  vWorldNormal;
  varying float vAssemble;

  float hash13(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  void main() {
    vec4 rest = modelMatrix * vec4(position, 1.0);

    // ---- сборка идёт снизу вверх: задержка задаётся высотой фрагмента ----
    float h = clamp((rest.y - uMinY) / max(uHeight, 1e-4), 0.0, 1.0);
    vec3 cell = floor(position * 2.2);
    float delay = h * 0.68 + hash13(cell) * 0.08;
    float t = clamp((uAssemble - delay) / 0.24, 0.0, 1.0);
    float ease = 1.0 - pow(1.0 - t, 3.0);
    vAssemble = ease;

    // uSpread = 0 по умолчанию: куски проявляются на своих местах, без разлёта
    vec3 dir = normalize(vec3(
      (hash13(cell + 19.0) - 0.5) * 0.7,
      1.0,
      (hash13(cell + 47.0) - 0.5) * 0.7
    ));
    vec3 world = rest.xyz + dir * uSpread * (1.0 - ease);

    vWorldPos = world;
    vec3 n = mat3(modelMatrix) * normal;
    vWorldNormal = dot(n, n) > 1e-12 ? normalize(n) : vec3(0.0, 1.0, 0.0);

    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3  uColor;
  uniform vec3  uEdgeColor;
  uniform float uOpacity;
  uniform float uDensity;
  uniform float uGhost;
  uniform float uGlitch;
  uniform float uFresnelPower;
  uniform float uScanDensity;
  uniform float uScanSpeed;
  uniform float uGridScale;
  uniform float uGridStrength;
  uniform float uHeight;
  uniform float uMinY;

  varying vec3  vWorldPos;
  varying vec3  vWorldNormal;
  varying float vAssemble;

  float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  // у упрощённых мешей попадаются вырожденные треугольники с нулевой нормалью;
  // normalize(vec3(0)) даёт NaN, а mipmap-блюр Bloom разносит его по всему кадру
  vec3 safeNormal(vec3 n) {
    return dot(n, n) > 1e-12 ? normalize(n) : vec3(0.0, 1.0, 0.0);
  }


  // линии постоянной экранной толщины
  float gridAt(vec2 c) {
    vec2 w = fwidth(c);
    vec2 r = abs(fract(c - 0.5) - 0.5) / max(w, vec2(1e-5));
    return 1.0 - min(min(r.x, r.y), 1.0);
  }

  float triGrid(vec3 n) {
    vec3 an = abs(n);
    float grid = gridAt(vWorldPos.yz * uGridScale) * an.x
               + gridAt(vWorldPos.xz * uGridScale) * an.y
               + gridAt(vWorldPos.xy * uGridScale) * an.z;
    return grid / max(an.x + an.y + an.z, 0.001);
  }

  /**
   * Мерцание: поверхность разбита на ячейки, каждая живёт своей жизнью и
   * с дискретным шагом времени вспыхивает или гаснет — как строки в «Матрице».
   * Геометрию не двигаем, поэтому depth-prepass остаётся согласованным.
   */
  float matrixFlicker() {
    // помехи приходят вспышкой раз в несколько секунд, как в «Человеке-пауке:
    // Через вселенные»: между вспышками картинка чистая
    float cycle = 3.6;
    float slot = floor(uTime / cycle);
    float start = slot * cycle + hash21(vec2(slot, 7.0)) * 1.9;
    float local = uTime - start;
    float burst = smoothstep(0.0, 0.035, local) * (1.0 - smoothstep(0.16, 0.33, local));
    if (burst < 0.001) return 1.0;

    float tick = floor(uTime * 13.0);
    vec2 id = vec2(floor(vWorldPos.y * 15.0), floor((vWorldPos.x + vWorldPos.z) * 4.5));
    float n = hash21(id + tick * 0.137);
    float flash = step(0.88, n);
    float dim = step(n, 0.12);

    // редкая широкая строка, пробегающая ярким разрядом
    float row = hash21(vec2(floor(vWorldPos.y * 26.0), floor(uTime * 9.0)));
    float band = step(0.988, row);

    return 1.0 + uGlitch * burst * (flash * 1.5 + band * 2.0 - dim * 0.75);
  }

  void main() {
    vec3 N = safeNormal(vWorldNormal);
    vec3 V = safeNormal(cameraPosition - vWorldPos);
    float fres = pow(max(1.0 - abs(dot(N, V)), 1e-5), uFresnelPower);
    float flicker = matrixFlicker();

  #ifdef GHOST
    // начинка за первым слоем: контуры и рёбра, чтобы объём читался насквозь
    // и контуры, и рёбра гасим к нормали: иначе плоские полы внутри дома
    // засвечивают кадр целиком
    float grid = triGrid(N) * smoothstep(0.05, 0.50, fres);
    float alpha = (smoothstep(0.12, 1.0, fres) * 0.55 + grid * 0.30 + 0.03)
                * uGhost * vAssemble * uOpacity * flicker;
    vec3 col = mix(uColor, uEdgeColor, 0.3);
    gl_FragColor = vec4(col * alpha, alpha);

  #else
    float upright = 1.0 - abs(N.y);

    // сетка проступает на скользящих углах: в лицо поверхность гладкая,
    // а к силуэту выходит плотная мелкая сетка — как на краях у Tripo
    float grid = triGrid(N) * smoothstep(0.04, 0.46, fres);

    // горизонтальные сканлайны — только на вертикальных гранях
    float lines = smoothstep(0.5, 1.0, sin((vWorldPos.y - uTime * uScanSpeed) * uScanDensity)) * 0.13 * upright;

    // широкая полоса, бегущая снизу вверх
    float sweepY = uMinY + fract(uTime * 0.13) * uHeight * 1.2 - uHeight * 0.1;
    float sweepD = (vWorldPos.y - sweepY) / (uHeight * 0.035);
    float sweep = exp(-sweepD * sweepD) * 0.5;

    // вспышка в момент материализации куска
    float assembling = 1.0 - vAssemble;
    float birthD = (vAssemble - 0.5) * 2.4;
    float birth = exp(-birthD * birthD) * step(vAssemble, 0.999);

    float alpha = 0.09 + fres * 0.50 + lines + sweep * 0.55 + grid * uGridStrength * 3.0 + birth * 0.45;
    // непроявленный кусок невидим полностью — объект собирается с пустого места
    alpha *= (0.62 + 0.38 * upright) * vAssemble * flicker;
    alpha = clamp(alpha, 0.0, 1.0) * uOpacity * uDensity;

    float hot = clamp(fres * 0.8 + sweep + birth * 0.9 + assembling * 0.55, 0.0, 1.0);
    vec3 col = mix(uColor, uEdgeColor, hot * 0.7);
    col *= 0.8 + hot * 1.7;

    gl_FragColor = vec4(col, alpha);
  #endif

    #include <colorspace_fragment>
  }
`

export type HologramUniforms = {
  uTime: { value: number }
  uColor: { value: THREE.Color }
  uEdgeColor: { value: THREE.Color }
  uOpacity: { value: number }
  uDensity: { value: number }
  uGhost: { value: number }
  uFresnelPower: { value: number }
  uScanDensity: { value: number }
  uScanSpeed: { value: number }
  uGridScale: { value: number }
  uGridStrength: { value: number }
  uGlitch: { value: number }
  uAssemble: { value: number }
  uSpread: { value: number }
  uHeight: { value: number }
  uMinY: { value: number }
}

export function createHologramUniforms(): HologramUniforms {
  return {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color('#1ec8ff') },
    uEdgeColor: { value: new THREE.Color('#dcfbff') },
    uOpacity: { value: 1 },
    uDensity: { value: 0.25 },
    uGhost: { value: 0.45 },
    uFresnelPower: { value: 2.1 },
    uScanDensity: { value: 42 },
    uScanSpeed: { value: 0.55 },
    uGridScale: { value: 3.4 },
    uGridStrength: { value: 0.22 },
    uGlitch: { value: 1 },
    uAssemble: { value: 1 },
    uSpread: { value: 0 },
    uHeight: { value: 3 },
    uMinY: { value: 0 },
  }
}

export type HoloPass = 'depth' | 'ghost' | 'front'

/**
 * Три прохода по одной геометрии и одним юниформам:
 *  depth — только глубина, прибивает ближайший слой (и даёт early-Z остальным);
 *  ghost — всё, что за ним (depthFunc Greater): начинка видна насквозь;
 *  front — сам голограммный слой (depthFunc LessEqual), ровно один слой.
 */
export function createHologramMaterial(pass: HoloPass, uniforms: HologramUniforms) {
  if (pass === 'depth') {
    return new THREE.ShaderMaterial({
      vertexShader,
      // discard там, где ещё ничего не проявилось: иначе невидимая геометрия
      // прибивает глубину и прячет то, что уже собралось
      fragmentShader: /* glsl */ `
        varying float vAssemble;
        void main() {
          if (vAssemble < 0.02) discard;
          gl_FragColor = vec4(0.0);
        }
      `,
      uniforms,
      colorWrite: false,
      depthWrite: true,
      depthTest: true,
      side: THREE.DoubleSide,
    })
  }

  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    defines: pass === 'ghost' ? { GHOST: true } : {},
    transparent: true,
    depthWrite: false,
    depthTest: true,
    depthFunc: pass === 'ghost' ? THREE.GreaterDepth : THREE.LessEqualDepth,
    blending: pass === 'front' ? THREE.NormalBlending : THREE.AdditiveBlending,
    // изнанке хватает лицевых граней — это вдвое меньше фрагментов
    side: pass === 'front' ? THREE.DoubleSide : THREE.FrontSide,
  })
}
