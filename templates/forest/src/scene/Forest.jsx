import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { sections } from '../data/content.js'
import { modelUrl } from '../hi3d.js'

// ── 构图 ─────────────────────────────────────────────────────────────
// 人眼高度，从空地边缘望向林子深处。首屏就是这个机位，不需要任何「进入」动作。
const CAMERA_POS = [0, 1.68, 11.2]
const CAMERA_TARGET = [0, 1.26, -3.4]

// 小径的中心线：一条很轻的 S 形，从近处一直延伸进雾里
function pathX(z) {
  return 0.55 * Math.sin(z * 0.25) + 0.22 * Math.sin(z * 0.62)
}

// 林口立四块真木头路牌（Hi3D 苔藓旧木牌模型），分两排：
// 近处两块贴在画面左右两侧，稍深两块收到中间，把视线和狗一起框在小径上。
// 全是面向来客的正面牌，字才读得清；深浅错开让画面有层次，也不会挡住往里走的路。
const SIGN_SPOTS = [
  { x: -2.86, z: 5.15, h: 1.32, face: 0.62, lean: 0.018, base: 0, tone: 1.02 },
  { x: -2.26, z: 2.05, h: 1.46, face: 0.7, lean: -0.012, base: 1, tone: 0.93 },
  { x: 2.3, z: 1.55, h: 1.44, face: 0.7, lean: 0.008, base: 2, tone: 1.05 },
  { x: 2.88, z: 4.95, h: 1.28, face: 0.62, lean: -0.02, base: 3, tone: 0.96 },
]

// 竖屏：横向几乎没有空间，四块大牌按原坐标会互相压住，
// 改成「两近两深」——两侧各一块贴着画面边缘，中间两块退到路尽头，
// 角度刚好错开、谁也不挡谁的字。
const SIGN_SPOTS_PORTRAIT = [
  { x: -2.6, z: 5.05, h: 1.34, face: 0.66, lean: 0.018, base: 0, tone: 1.02 },
  { x: -1.24, z: 2.15, h: 1.5, face: 0.72, lean: -0.012, base: 1, tone: 0.93 },
  { x: 1.9, z: 1.65, h: 1.48, face: 0.72, lean: 0.008, base: 2, tone: 1.05 },
  { x: 2.62, z: 4.85, h: 1.31, face: 0.66, lean: -0.02, base: 3, tone: 0.96 },
]

// 林间倒木（Hi3D 风格化苔藓枯木）：一根横躺的朽木比十几丛蕨更能说明「这片林子很久没人来过」，
// 也给平铺的地面加一条横向的暗色带，画面不再只有竖直的树。
// 模型是沿 +z 躺着的圆木（长 1、径 0.314），所以按「这根木头要多长」来缩放，而不是按高度。
// 四根：左边一根长的主力横在树线前、右边一根稍短的斜躺、路尽头一根小的透在雾里、
// 右侧近景一根断木，让近处也有可看的东西。
const LOG_SPOTS = [
  // 近处路左：一小截端头对着镜头的断木，树皮和苔看得最清楚
  { x: -2.05, z: 4.15, len: 1.75, rot: 1.32, tilt: 0.02, roll: 0.05, tone: 0.62 },
  // 近处路右：稍小一点，和左边错开，别像一对摆件
  { x: 2.3, z: 3.75, len: 1.5, rot: -1.55, tilt: -0.016, roll: -0.06, tone: 0.66 },
  // 路当中偏深处一根长的横木，压在画面中段那条空带上
  { x: -0.3, z: -2.6, len: 3.2, rot: 1.05, tilt: 0.012, roll: 0.03, tone: 0.52 },
  // 路尽头雾里的一根，只留个轮廓，告诉人林子还往里
  { x: 1.7, z: -7.2, len: 2.1, rot: 1.0, tilt: 0.03, roll: 0.02, tone: 0.44 },
]

// 柱脚小景：四根柱子脚下不能是同一套石头+蕨，否则一眼看出是复制粘贴
const SIGN_BASES = [
  [{ type: 'rock', h: 0.38, at: [0.28, -0.1, 0.2], rot: 1.1 }, { type: 'shrub', h: 0.44, at: [-0.42, -0.02, 0.18], rot: 2.3 }],
  [{ type: 'shrub', h: 0.54, at: [0.42, -0.02, 0.24], rot: 0.6 }, { type: 'shrub', h: 0.34, at: [-0.31, -0.02, 0.1], rot: 3.4 }],
  [{ type: 'rock', h: 0.44, at: [-0.33, -0.11, 0.22], rot: 2.6 }, { type: 'shrub', h: 0.3, at: [0.27, -0.02, 0.13], rot: 1.7 }],
  [{ type: 'rock', h: 0.27, at: [0.24, -0.08, 0.16], rot: 0.4 }, { type: 'rock', h: 0.36, at: [-0.37, -0.1, 0.28], rot: 1.9 }],
]

// 首屏只留一只狗：奔跑姿态定格在小径正中、正面朝着来访者（相机在 +z）。
// 不做循环位移，也不是「路过」，而是「正朝你跑来」的那一刻。
const DOG_SPOT = [0.55, 0, 2.6]

// 随机撒的蕨与石头要绕开狗和每块路牌的柱脚，别把主体糊住
const SCATTER_AVOID = [
  [DOG_SPOT[0], DOG_SPOT[2], 1.5],
  ...SIGN_SPOTS.map((s) => [s.x, s.z, 1.25]),
  // 倒木周围别长蕨，否则一排蕨尖从木头上冒出来
  ...LOG_SPOTS.map((s) => [s.x, s.z, s.len * 0.4 + 0.3]),
]

// 竖屏手机：视口太窄，默认机位会把两侧的路牌切掉。
// 把机位往后拉、视角放宽，路牌横向再收一点，四块牌才都还留在画面里。
function CameraRig() {
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const controls = useThree((state) => state.controls)
  useEffect(() => {
    const aspect = size.width / Math.max(size.height, 1)
    const narrow = aspect < 0.95
    const mid = aspect >= 0.95 && aspect < 1.3
    camera.position.set(0, narrow ? 1.7 : 1.68, narrow ? 18.4 : mid ? 13.2 : 11.2)
    camera.fov = narrow ? 60 : 50
    camera.updateProjectionMatrix()
    if (controls) {
      controls.minDistance = narrow ? 9 : 6
      controls.maxDistance = narrow ? 23 : 16
      controls.update()
    }
  }, [camera, size, controls])
  return null
}

function mulberry32(seed) {
  return function random() {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Hi3D 贴图自带烘焙光照，暗部容易发死。轻微提亮 + 一点环境自发光。
function tuneMaterials(root, tint = 1.12) {
  root.traverse((obj) => {
    if (!obj.isMesh) return
    obj.castShadow = true
    obj.receiveShadow = true
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
    mats.forEach((mat) => {
      if (!mat || mat.userData.tuned) return
      mat.userData.tuned = true
      if (mat.color && tint !== 1) mat.color.multiplyScalar(tint)
      if ('roughness' in mat) mat.roughness = 0.92
      if ('metalness' in mat) mat.metalness = 0
      if ('envMapIntensity' in mat) mat.envMapIntensity = 0.5
      if (mat.emissive) {
        mat.emissive = new THREE.Color('#33471f')
        mat.emissiveIntensity = 0.24
      }
    })
  })
  return root
}

function makeGroundedClone(scene, targetHeight, tint = 1.12) {
  const clone = scene.clone(true)
  clone.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(clone)
  const size = new THREE.Vector3()
  const center = new THREE.Vector3()
  box.getSize(size)
  box.getCenter(center)
  const s = targetHeight / Math.max(size.y, 0.001)
  clone.scale.multiplyScalar(s)
  clone.position.set(-center.x * s, -box.min.y * s, -center.z * s)
  return tuneMaterials(clone, tint)
}

function Hi3DModel({ url, targetHeight = 1.8, tint = 1.12, ...props }) {
  const { scene } = useGLTF(url)
  const model = useMemo(
    () => makeGroundedClone(scene, targetHeight, tint),
    [scene, targetHeight, tint],
  )
  return (
    <group {...props}>
      <primitive object={model} />
    </group>
  )
}

// ── 天空：顶部青绿、地平线暖白，右上有一轮柔化的太阳 ──────────────────
function SkyDome() {
  const uniforms = useMemo(
    () => ({
      uTop: { value: new THREE.Color('#aee2c6') },
      uHorizon: { value: new THREE.Color('#fdfbe4') },
      uSun: { value: new THREE.Color('#fffbe0') },
    }),
    [],
  )
  return (
    <mesh renderOrder={-10}>
      <sphereGeometry args={[90, 32, 24]} />
      <shaderMaterial
        side={THREE.BackSide}
        depthWrite={false}
        uniforms={uniforms}
        vertexShader={`
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          uniform vec3 uTop;
          uniform vec3 uHorizon;
          uniform vec3 uSun;
          varying vec3 vDir;
          void main() {
            float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
            vec3 col = mix(uHorizon, uTop, smoothstep(0.42, 0.95, h));
            vec3 sunDir = normalize(vec3(0.58, 0.62, -0.52));
            float d = max(dot(normalize(vDir), sunDir), 0.0);
            col += uSun * pow(d, 6.0) * 0.72;
            col += uSun * pow(d, 48.0) * 1.15;
            gl_FragColor = vec4(col, 1.0);
          }
        `}
      />
    </mesh>
  )
}

function makeGlowTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
  g.addColorStop(0, 'rgba(255,253,222,0.95)')
  g.addColorStop(0.16, 'rgba(255,248,195,0.58)')
  g.addColorStop(0.52, 'rgba(255,244,182,0.17)')
  g.addColorStop(1, 'rgba(255,244,182,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 256)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function SunGlow() {
  const texture = useMemo(makeGlowTexture, [])
  return (
    <sprite position={[22, 17, -26]} scale={[27, 27, 1]} renderOrder={1}>
      <spriteMaterial
        map={texture}
        transparent
        opacity={0.55}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
        fog={false}
      />
    </sprite>
  )
}

// ── 穿过树冠的阳光束 ─────────────────────────────────────────────────
function makeBeamTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, 512)
  g.addColorStop(0, 'rgba(255,250,210,0)')
  g.addColorStop(0.22, 'rgba(255,250,210,0.85)')
  g.addColorStop(0.55, 'rgba(255,248,200,0.5)')
  g.addColorStop(1, 'rgba(255,250,220,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 512)
  const side = ctx.createLinearGradient(0, 0, 128, 0)
  side.addColorStop(0, 'rgba(0,0,0,1)')
  side.addColorStop(0.5, 'rgba(0,0,0,0)')
  side.addColorStop(1, 'rgba(0,0,0,1)')
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = side
  ctx.fillRect(0, 0, 128, 512)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function Sunbeams() {
  const group = useRef()
  const texture = useMemo(makeBeamTexture, [])
  const beams = useMemo(() => {
    const rnd = mulberry32(2026)
    return new Array(9).fill(0).map((_, i) => ({
      x: -7 + i * 1.9 + (rnd() - 0.5) * 1.4,
      z: -3 - rnd() * 7,
      w: 1.2 + rnd() * 2.2,
      tilt: -0.26 - rnd() * 0.16,
      phase: rnd() * Math.PI * 2,
      speed: 0.12 + rnd() * 0.18,
      opacity: 0.26 + rnd() * 0.2,
    }))
  }, [])

  useFrame(({ clock }) => {
    if (!group.current) return
    const t = clock.elapsedTime
    group.current.children.forEach((child, i) => {
      const b = beams[i]
      if (!b || !child.material) return
      child.material.opacity = b.opacity * (0.68 + Math.sin(t * b.speed + b.phase) * 0.32)
    })
  })

  return (
    <group ref={group}>
      {beams.map((b, i) => (
        <mesh key={i} position={[b.x, 5.2, b.z]} rotation={[0, 0, b.tilt]} renderOrder={3}>
          <planeGeometry args={[b.w, 15]} />
          <meshBasicMaterial
            map={texture}
            transparent
            opacity={b.opacity}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  )
}

// ── 地面斑驳光点，缓慢移动像树影在晃 ─────────────────────────────────
function makeDappleTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, 512, 512)
  const rnd = mulberry32(1234)
  for (let i = 0; i < 52; i++) {
    const x = rnd() * 512
    const y = rnd() * 512
    const r = 32 + rnd() * 92
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, `rgba(34,58,26,${0.13 + rnd() * 0.18})`)
    g.addColorStop(1, 'rgba(16,36,14,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  for (let i = 0; i < 95; i++) {
    const x = rnd() * 512
    const y = rnd() * 512
    const r = 7 + rnd() * 38
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, `rgba(255,246,186,${0.32 + rnd() * 0.5})`)
    g.addColorStop(1, 'rgba(255,246,186,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  return tex
}

function DappleLight() {
  const texture = useMemo(makeDappleTexture, [])
  useFrame((_, delta) => {
    texture.offset.x += delta * 0.004
    texture.offset.y += delta * 0.0016
  })
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.022, 0]} renderOrder={1}>
      <circleGeometry args={[29, 64]} />
      <meshBasicMaterial map={texture} transparent opacity={0.88} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

// ── 浮尘 ─────────────────────────────────────────────────────────────
function Motes() {
  const pointsRef = useRef()
  const seeds = useMemo(() => {
    const rnd = mulberry32(77)
    return new Array(110).fill(0).map(() => ({
      base: [(rnd() - 0.5) * 20, 0.5 + rnd() * 6.5, (rnd() - 0.5) * 20],
      phase: rnd() * Math.PI * 2,
      speed: 0.08 + rnd() * 0.2,
    }))
  }, [])
  const positions = useMemo(() => {
    const arr = new Float32Array(seeds.length * 3)
    seeds.forEach((s, i) => {
      arr[i * 3] = s.base[0]
      arr[i * 3 + 1] = s.base[1]
      arr[i * 3 + 2] = s.base[2]
    })
    return arr
  }, [seeds])

  useFrame(({ clock }) => {
    const attr = pointsRef.current?.geometry?.attributes?.position
    if (!attr) return
    const t = clock.elapsedTime
    seeds.forEach((s, i) => {
      attr.array[i * 3] = s.base[0] + Math.sin(t * s.speed + s.phase) * 0.45
      attr.array[i * 3 + 1] = s.base[1] + Math.sin(t * s.speed * 0.8 + s.phase) * 0.35
      attr.array[i * 3 + 2] = s.base[2] + Math.cos(t * s.speed + s.phase) * 0.45
    })
    attr.needsUpdate = true
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#fff8d9"
        size={0.035}
        sizeAttenuation
        transparent
        opacity={0.72}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

// ── 林间小径：一条柔边土带，把视线自然引向林子深处 ────────────────────
function PathRibbon() {
  const uniforms = useMemo(
    () => ({
      uPath: { value: new THREE.Color('#d8c08c') },
      uEdge: { value: new THREE.Color('#a79a68') },
    }),
    [],
  )
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.014, -2]} renderOrder={2}>
      <planeGeometry args={[14, 30, 1, 1]} />
      <shaderMaterial
        transparent
        depthWrite={false}
        uniforms={uniforms}
        vertexShader={`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          uniform vec3 uPath;
          uniform vec3 uEdge;
          varying vec2 vUv;
          float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                       mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
          }
          void main() {
            float x = (vUv.x - 0.5) * 14.0;
            float z = mix(13.0, -17.0, vUv.y);
            float center = 0.55 * sin(z * 0.25) + 0.22 * sin(z * 0.62);
            float width = 1.05 + 0.14 * sin(z * 0.4);
            float d = abs(x - center);
            float core = 1.0 - smoothstep(width * 0.5, width, d);
            float soft = 1.0 - smoothstep(width, width * 1.85, d);
            float grain = noise(vec2(x, z) * 7.0);
            vec3 col = mix(uEdge, uPath, core) * (0.87 + grain * 0.22);
            float alpha = soft * (0.22 + core * 0.40);
            // 越往远处越淡，融进雾里
            alpha *= mix(0.55, 1.0, smoothstep(-17.0, 6.0, z));
            gl_FragColor = vec4(col, alpha);
          }
        `}
      />
    </mesh>
  )
}

// ── 树层：全部 Hi3D 写实 GLB；正前方留出望进林中的走廊 ──────────────────
function TreeLayer({ url, count, minR, maxR, minH, maxH, seed, tint, gap = 0.3 }) {
  const { scene } = useGLTF(url)
  const trees = useMemo(() => {
    const rnd = mulberry32(seed)
    const mobile = typeof window !== 'undefined' && window.innerWidth < 760
    const list = []
    for (let i = 0; i < (mobile ? Math.ceil(count * 0.65) : count); i++) {
      // 只在前方半圆（z <= 0）布树：相机侧后方若有树，树冠会怼到镜头上糊满半屏
      const angle = Math.PI + rnd() * Math.PI
      // 3π/2 是正前方，留出一条望进林中的走廊
      if (Math.abs(angle - Math.PI * 1.5) < gap) continue
      const radius = minR + rnd() * (maxR - minR)
      list.push({
        pos: [Math.cos(angle) * radius, 0, Math.sin(angle) * radius],
        rot: rnd() * Math.PI * 2,
        height: minH + rnd() * (maxH - minH),
      })
    }
    return list
  }, [count, minR, maxR, minH, maxH, seed, gap])

  const models = useMemo(
    () => trees.map((tree) => makeGroundedClone(scene, tree.height, tint)),
    [scene, trees, tint],
  )
  return models.map((model, i) => (
    <group key={i} position={trees[i].pos} rotation={[0, trees[i].rot, 0]}>
      <primitive object={model} />
    </group>
  ))
}

// 左右各两棵侧树压住画面边缘，形成半包围；离相机 10m 以上，不会怼到镜头上
function SideTrees({ oak, fir }) {
  const list = [
    { url: oak, pos: [-8.6, 0, 1.4], h: 7.6, rot: 0.4 },
    { url: fir, pos: [8.9, 0, 0.6], h: 7.9, rot: -0.55 },
    { url: fir, pos: [-10.4, 0, -3.6], h: 8.2, rot: 1.1 },
    { url: oak, pos: [10.8, 0, -4.4], h: 8.0, rot: -1.2 },
  ]
  return list
    .filter((item) => item.url)
    .map((item, i) => (
      <Suspense key={i} fallback={null}>
        <Hi3DModel url={item.url} targetHeight={item.h} tint={1.32} position={item.pos} rotation={[0, item.rot, 0]} />
      </Suspense>
    ))
}

// ── 倒木 ─────────────────────────────────────────────────────────────
// 按「长度」缩放而不是高度：模型是沿 +z 躺着的圆木，len 就是它躺在地上的长度。
// 每根单独 clone 一份材质，再乘一点点色差，四根才不会像同一根木头复制了四遍。
function makeLogClone(scene, length, tint = 1, cast = [1, 1, 1]) {
  const clone = scene.clone(true)
  clone.traverse((obj) => {
    if (!obj.isMesh) return
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
    const next = mats.map((mat) => {
      const copy = mat.clone()
      copy.userData = {}
      return copy
    })
    obj.material = Array.isArray(obj.material) ? next : next[0]
  })
  clone.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(clone)
  const size = new THREE.Vector3()
  box.getSize(size)
  const s = length / Math.max(size.z, 0.001)
  clone.scale.multiplyScalar(s)
  // 轴心放在圆木的轴线上（不是贴地的底面），这样 roll 是「滚木头」，
  // 而不是连人带轴把整根木头甩进地里
  const radius = (size.y * s) / 2
  clone.position.set(0, -((box.min.y + box.max.y) / 2) * s, 0)
  tuneMaterials(clone, tint)
  // 模型的贴图是偏浅棕的烘焙色，直接乘亮度会发灰；压一点红、留一点绿，
  // 才像在林子里淋了几十年雨的木头
  clone.traverse((obj) => {
    if (!obj.isMesh) return
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
    mats.forEach((mat) => {
      if (mat && mat.color) mat.color.setRGB(mat.color.r * cast[0], mat.color.g * cast[1], mat.color.b * cast[2])
    })
  })
  clone.userData.radius = radius
  return clone
}

function FallenLogs({ url }) {
  const { scene } = useGLTF(url)
  const models = useMemo(
    () => LOG_SPOTS.map((spot) => makeLogClone(scene, spot.len, spot.tone ?? 1, [0.86, 0.98, 0.72])),
    [scene],
  )
  return models.map((model, i) => {
    const spot = LOG_SPOTS[i]
    // 沉进地面一点点，木头才像被苔草吃住，而不是摆在地上
    const y = model.userData.radius * 0.88 - 0.02
    return (
      <group key={i} position={[spot.x, y, spot.z]} rotation={[spot.tilt || 0, spot.rot, spot.roll || 0]}>
        <primitive object={model} />
      </group>
    )
  })
}

function GroundScatter({ url, count, minR, maxR, minSize, maxSize, sink = 0, seed, avoid = [] }) {
  const { scene } = useGLTF(url)
  const items = useMemo(() => {
    const rnd = mulberry32(seed)
    const list = []
    for (let i = 0; i < count; i++) {
      const angle = rnd() * Math.PI * 2
      const radius = minR + rnd() * (maxR - minR)
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      // 小径上不摆石头，留出干净的动线
      if (Math.abs(x - pathX(z)) < 1.5) continue
      // 狗与路标周围留空，主体不被蕨挡住
      if (avoid.some(([ax, az, ar]) => (x - ax) ** 2 + (z - az) ** 2 < ar * ar)) continue
      list.push({ pos: [x, -sink, z], rot: rnd() * Math.PI * 2, size: minSize + rnd() * (maxSize - minSize) })
    }
    return list
  }, [count, minR, maxR, minSize, maxSize, sink, seed, avoid])

  const models = useMemo(() => items.map((item) => makeGroundedClone(scene, item.size)), [scene, items])
  return models.map((model, i) => (
    <group key={i} position={items[i].pos} rotation={[0, items[i].rot, 0]}>
      <primitive object={model} />
    </group>
  ))
}

// ── 近景地被：草叶、落叶、野花、路缘碎石 ─────────────────────────────
// 全部是程序化 InstancedMesh，不额外加载 GLB。相机脚下到小径两侧的空地
// 由此有了层次，又不挡住狗、木牌和路心；飘落的几片叶子让林子「活」一点。
// 地面原本是一整块纯色，近景会显得空。铺一层无缝的柔和斑驳：
// 苔色深浅 + 细碎草点，只改质感，不再往画面里塞几何体。
function makeGroundTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 512
  const ctx = canvas.getContext('2d')
  // 地面：偏黄绿的苔草色，不再是深橄榄；斑块只做质感，别压出一片脏影
  ctx.fillStyle = '#83905a'
  ctx.fillRect(0, 0, 512, 512)
  const rnd = mulberry32(555)
  const blob = (x, y, r, inner) => {
    // 边缘的斑块在对侧补画一份，repeat 时才看不出接缝
    for (const dx of [-512, 0, 512]) {
      for (const dy of [-512, 0, 512]) {
        const cx = x + dx
        const cy = y + dy
        if (cx + r < 0 || cx - r > 512 || cy + r < 0 || cy - r > 512) continue
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
        g.addColorStop(0, inner)
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
  for (let i = 0; i < 150; i++) {
    const dark = rnd() < 0.45
    blob(
      rnd() * 512,
      rnd() * 512,
      34 + rnd() * 110,
      dark ? 'rgba(58,74,38,0.16)' : 'rgba(190,200,124,0.2)',
    )
  }
  for (let i = 0; i < 1100; i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(54,70,36,0.14)' : 'rgba(206,214,146,0.16)'
    ctx.beginPath()
    ctx.arc(rnd() * 512, rnd() * 512, 0.8 + rnd() * 2.2, 0, Math.PI * 2)
    ctx.fill()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(12, 12)
  tex.anisotropy = 8
  return tex
}

function bladeGeometry() {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(
      new Float32Array([-0.018, 0, 0, 0.018, 0, 0, 0.003, 0.34, 0.012]),
      3,
    ),
  )
  geometry.setIndex([0, 1, 2])
  geometry.computeVertexNormals()
  return geometry
}

function makeInstanced(geometry, material, placements) {
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length)
  const dummy = new THREE.Object3D()
  placements.forEach((p, i) => {
    dummy.position.set(p.pos[0], p.pos[1], p.pos[2])
    dummy.rotation.set(p.rot[0], p.rot[1], p.rot[2])
    dummy.scale.set(p.scale[0], p.scale[1], p.scale[2])
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
    if (p.color) mesh.setColorAt(i, new THREE.Color(p.color))
  })
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.frustumCulled = false
  return mesh
}

function buildGroundDetails() {
  const rnd = mulberry32(404)
  const grass = []
  const leaves = []
  const stems = []
  const petals = []
  const stones = []
  // 颜色压到贴近地面，别让地被变成一片高对比的亮绿噪点
  const grassColors = ['#71843f', '#7d9049', '#657a38', '#87994f', '#768a44']
  const leafColors = ['#a58a4c', '#8f7840', '#b39a5c', '#7d8a42', '#a37c40']
  const petalColors = ['#f0f2c8', '#fdf6d6', '#e9ecc0', '#fff9dd', '#ecefc6']
  const blocked = [...SCATTER_AVOID, [DOG_SPOT[0], DOG_SPOT[2], 1.9]]
  const isBlocked = (x, z) => blocked.some(([ax, az, ar]) => (x - ax) ** 2 + (z - az) ** 2 < ar * ar)

  // 六成沿小径两侧成带（把路的边界勾出来），四成稀疏铺开；越靠近相机越稀
  for (let i = 0; i < 280; i++) {
    const z = 3.4 + rnd() * 3.8
    if (z > 5.6 && rnd() < 0.55) continue
    const x =
      rnd() < 0.62
        ? pathX(z) + (rnd() < 0.5 ? -1 : 1) * (1.06 + rnd() * 1.5)
        : (rnd() - 0.5) * 15
    if (Math.abs(x - pathX(z)) < 1.0 || isBlocked(x, z)) continue
    const h = 0.09 + rnd() * 0.16
    grass.push({
      pos: [x, 0.012, z],
      rot: [0, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.3],
      scale: [0.5 + rnd() * 0.5, h / 0.34, 1],
      color: grassColors[Math.floor(rnd() * grassColors.length)],
    })
  }

  // 落叶也撒一些在路上，土带才不显得干净得假
  for (let i = 0; i < 90; i++) {
    const z = 1.8 + rnd() * 6.5
    const x = pathX(z) + (rnd() - 0.5) * (rnd() < 0.5 ? 3.0 : 11)
    if (isBlocked(x, z)) continue
    leaves.push({
      pos: [x, 0.034, z],
      rot: [-Math.PI / 2, rnd() * Math.PI * 2, 0],
      scale: [0.6 + rnd() * 0.5, 0.6 + rnd() * 0.5, 1],
      color: leafColors[Math.floor(rnd() * leafColors.length)],
    })
  }

  // 零星野花：细茎 + 一小朵，只在路肩外侧，别成一片白点
  for (let i = 0; i < 12; i++) {
    const z = 3.6 + rnd() * 3.6
    const x = pathX(z) + (rnd() < 0.5 ? -1 : 1) * (1.4 + rnd() * 3.4)
    if (isBlocked(x, z)) continue
    const h = 0.14 + rnd() * 0.14
    stems.push({
      pos: [x, 0.012, z],
      rot: [0, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.2],
      scale: [0.55, h / 0.34, 1],
      color: '#4f6635',
    })
    petals.push({
      pos: [x, h, z],
      rot: [0, rnd() * Math.PI * 2, 0],
      scale: [0.7 + rnd() * 0.3, 0.7 + rnd() * 0.3, 0.7 + rnd() * 0.3],
      color: petalColors[Math.floor(rnd() * petalColors.length)],
    })
  }

  // 路缘碎石，压住土带与草的接缝
  for (let i = 0; i < 9; i++) {
    const z = 2.4 + rnd() * 5.4
    const x = pathX(z) + (rnd() < 0.5 ? -1 : 1) * (1.0 + rnd() * 2.2)
    if (isBlocked(x, z)) continue
    stones.push({
      pos: [x, 0.015, z],
      rot: [0, rnd() * Math.PI * 2, 0],
      scale: [0.8 + rnd() * 0.8, 0.45 + rnd() * 0.3, 0.7 + rnd() * 0.5],
      color: '#5a5746',
    })
  }

  return { grass, leaves, stems, petals, stones }
}

function GroundDetails() {
  const meshes = useMemo(() => {
    const d = buildGroundDetails()
    const mat = () =>
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, side: THREE.DoubleSide })
    return [
      makeInstanced(bladeGeometry(), mat(), d.grass),
      makeInstanced(new THREE.CircleGeometry(0.05, 5), mat(), d.leaves),
      makeInstanced(bladeGeometry(), mat(), d.stems),
      makeInstanced(new THREE.IcosahedronGeometry(0.019, 0), mat(), d.petals),
      makeInstanced(new THREE.SphereGeometry(0.06, 6, 4), mat(), d.stones),
    ]
  }, [])
  useEffect(
    () => () =>
      meshes.forEach((mesh) => {
        mesh.geometry.dispose()
        mesh.material.dispose()
      }),
    [meshes],
  )
  return (
    <group>
      {meshes.map((mesh, i) => (
        <primitive key={i} object={mesh} />
      ))}
    </group>
  )
}

// ── 木牌刻字用的毛笔字体 ────────────────────────────────────────────
// Ma Shan Zheng（SIL OFL）做成 232 字子集随仓库走，不依赖外部 CDN；
// 字体是异步的，加载完成后所有木牌统一重绘一次。
const MARKER_FONT_NAME = 'Ma Shan Zheng'
const MARKER_FONT_URL = `${import.meta.env.BASE_URL || '/'}forest/fonts/mashanzheng.woff2`
let markerFontState = 'idle'
let markerFontPromise = null
const markerFontListeners = new Set()

function ensureMarkerFont() {
  if (markerFontState === 'ready' || markerFontState === 'failed') return Promise.resolve(markerFontState)
  if (!markerFontPromise) {
    markerFontState = 'loading'
    markerFontPromise = new FontFace(MARKER_FONT_NAME, `url("${MARKER_FONT_URL}") format('woff2')`)
      .load()
      .then((face) => {
        document.fonts.add(face)
        markerFontState = 'ready'
      })
      .catch(() => {
        markerFontState = 'failed'
      })
      .then(() => {
        markerFontListeners.forEach((fn) => fn())
        return markerFontState
      })
  }
  return markerFontPromise
}

// ── 林口路牌：Hi3D 的苔藓旧木牌 + 手写墨字 ────────────────────────────
// 模型是一根立柱挑一块空白旧木牌（单 mesh，总高 1.0，牌面 0.868×0.424，
// 牌面在 z=0.121），所以字用一张透明贴图叠在牌面正前方，像有人拿墨直接写在木头上。
// 模型已按「最低点贴地」归一到高度 1，所以牌的纵向位置要加上 0.5 的抬升。
const BOARD_FACE_Z = 0.121
const BOARD_CY = 0.623
const LABEL_W = 0.755
const LABEL_H = 0.315

function makeLabelTexture(label, seed) {
  const W = 1024
  const H = 428
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  const rnd = mulberry32(900 + seed * 53)

  const fontStack =
    markerFontState === 'ready'
      ? '"Ma Shan Zheng", "KaiTi", "STKaiti", serif'
      : '"KaiTi", "STKaiti", "Kaiti SC", "SimSun", serif'

  // 字号按牌面宽度收：两字写大，三字收一点，别顶到牌框
  let size = 300
  ctx.font = `${size}px ${fontStack}`
  const measured = ctx.measureText(label).width
  const maxWidth = W * 0.84
  if (measured > maxWidth) size = (size * maxWidth) / measured

  ctx.save()
  ctx.translate(W / 2, H / 2 + size * 0.03)
  ctx.rotate(-0.012 + (rnd() - 0.5) * 0.02)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `${size}px ${fontStack}`

  // 墨渗进木纹：先铺一层近乎透明的墨晕，再压一层实墨，边缘才不是剪贴画
  ctx.fillStyle = 'rgba(46,33,20,0.34)'
  ctx.filter = 'blur(3px)'
  ctx.fillText(label, 0, 0)
  ctx.filter = 'none'

  ctx.fillStyle = 'rgba(40,28,16,0.9)'
  ctx.fillText(label, 0, 0)
  // 笔锋处更浓，模仿蘸墨不均
  ctx.fillStyle = 'rgba(24,16,8,0.45)'
  ctx.fillText(label, 1.5, -1.5)
  ctx.restore()

  // 风吹日晒的褪色：沿木纹方向擦掉一些墨，字才不会像刚印上去的
  ctx.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < 150; i++) {
    const x = rnd() * W
    const y = rnd() * H
    const rx = 2 + rnd() * 26
    const ry = 1 + rnd() * 4
    ctx.globalAlpha = 0.08 + rnd() * 0.3
    ctx.beginPath()
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

function narrowSpot(spot, squeeze) {
  if (squeeze === 1) return spot
  return { ...spot, x: spot.x * squeeze }
}

// 一块牌 = 一根立柱 + 一块旧木牌 + 叠在牌面上的墨字。
// 四块牌共用同一个 GLB（clone 共享几何与材质），只有字和柱脚的小景不同。
function TrailSign({ section, spot, model, texture, active, hovered, onSelect, onHover, rockUrl, shrubUrl }) {
  // 每根柱子各晒各的太阳：材质单独 clone 一份，做一点点色差，四块牌才不是同一块木板复制四遍
  const object = useMemo(() => {
    const clone = model.clone(true)
    clone.traverse((obj) => {
      if (!obj.isMesh) return
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
      const next = mats.map((mat) => {
        const copy = mat.clone()
        copy.color.multiplyScalar(spot.tone ?? 1)
        return copy
      })
      obj.material = Array.isArray(obj.material) ? next : next[0]
    })
    return clone
  }, [model, spot.tone])
  // 朝着来客，但按比例收一点角度：完全正对太像展板，全侧面又读不出字
  const yaw = Math.atan2(CAMERA_POS[0] - spot.x, CAMERA_POS[2] - spot.z) * spot.face

  return (
    <group
      position={[spot.x, 0, spot.z]}
      rotation={[0, yaw, spot.lean || 0]}
      onClick={(event) => {
        event.stopPropagation()
        onSelect(active ? null : section.id)
      }}
      onPointerOver={(event) => {
        event.stopPropagation()
        onHover(section.id)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        onHover(null)
        document.body.style.cursor = 'auto'
      }}
    >
      <GroundShadow at={[0, 0, 0]} width={1.6 * spot.h} depth={1.1 * spot.h} opacity={0.4} />

      <group scale={spot.h * (active ? 1.012 : hovered ? 1.006 : 1)}>
        <primitive object={object} />
        {/* 牌面墨字 */}
        <mesh position={[0, BOARD_CY, BOARD_FACE_Z + 0.0035]} renderOrder={5}>
          <planeGeometry args={[LABEL_W, LABEL_H]} />
          <meshBasicMaterial
            map={texture}
            transparent
            depthWrite={false}
            toneMapped={false}
            opacity={active ? 1 : hovered ? 0.98 : 0.9}
          />
        </mesh>
        {/* 命中体：整根柱子连同牌子都能点，不必对准字 */}
        <mesh position={[0, 0.5, 0.04]}>
          <boxGeometry args={[0.9, 1.0, 0.34]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>

      {/* 柱脚：每根柱子脚下摆的东西不一样，柱子才像各长各的 */}
      {(SIGN_BASES[spot.base] || SIGN_BASES[0]).map((item, i) => {
        const url = item.type === 'rock' ? rockUrl : shrubUrl
        if (!url) return null
        return (
          <Suspense key={i} fallback={null}>
            <Hi3DModel
              url={url}
              targetHeight={item.h}
              tint={item.type === 'rock' ? 1.16 : 1.14}
              position={item.at}
              rotation={[0, item.rot, 0]}
            />
          </Suspense>
        )
      })}
    </group>
  )
}

function TrailSigns({ items, selected, onSelect, signUrl, rockUrl, shrubUrl }) {
  const { scene } = useGLTF(signUrl)
  // 竖屏时四块牌往中间收，否则两边两块会被视口切掉
  const aspect = useThree((state) => state.size.width / Math.max(state.size.height, 1))
  const spots = aspect < 0.95 ? SIGN_SPOTS_PORTRAIT : SIGN_SPOTS
  const squeeze = aspect >= 0.95 && aspect < 1.3 ? 0.92 : 1
  const model = useMemo(() => makeGroundedClone(scene, 1, 0.66), [scene])
  const [hovered, setHovered] = useState(null)
  const [fontTick, setFontTick] = useState(0)
  useEffect(() => {
    const refresh = () => setFontTick((v) => v + 1)
    markerFontListeners.add(refresh)
    ensureMarkerFont()
    return () => markerFontListeners.delete(refresh)
  }, [])

  const textures = useMemo(
    () => items.map((section, i) => makeLabelTexture(section.label, i)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, fontTick],
  )
  useEffect(() => () => textures.forEach((tex) => tex.dispose()), [textures])

  return items.map((section, i) => (
    <TrailSign
      key={section.id}
      section={section}
      spot={narrowSpot(spots[i % spots.length], squeeze)}
      model={model}
      texture={textures[i]}
      active={selected === section.id}
      hovered={hovered === section.id}
      onSelect={onSelect}
      onHover={setHovered}
      rockUrl={rockUrl}
      shrubUrl={shrubUrl}
    />
  ))
}

// ── 唯一的伙伴 ───────────────────────────────────────────────────────
// Hi3D 图生 3D 输出的是单 mesh 静态 GLB（0 骨骼 / 0 动画），姿态是奔跑定格。
// 模型默认朝 +z，也就是正对相机；略偏一点角度让四肢的奔跑姿态还能读出来。
function RunningDog({ url }) {
  const { scene } = useGLTF(url)
  const model = useMemo(() => makeGroundedClone(scene, 1.42, 1.34), [scene])
  return (
    <group position={DOG_SPOT} rotation={[0, 0.14, 0]}>
      <primitive object={model} />
      {/* 从相机侧补一点暖光，正面不至于黑成一团 */}
      <pointLight position={[0.6, 1.6, 2.2]} intensity={1.0} distance={3.8} color="#fff3da" />
    </group>
  )
}

// 静态模型没有真正的落地阴影时容易显得飘，补一片很淡的软影
function makeShadowTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(18,28,12,0.66)')
  g.addColorStop(0.42, 'rgba(18,28,12,0.34)')
  g.addColorStop(1, 'rgba(18,28,12,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(canvas)
}

function GroundShadow({ at, width, depth, opacity }) {
  const texture = useMemo(makeShadowTexture, [])
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[at[0], 0.028, at[2] + 0.12]} renderOrder={3}>
      <planeGeometry args={[width, depth]} />
      <meshBasicMaterial map={texture} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

function TrailCompanion() {
  const runUrl = modelUrl('runner')
  if (!runUrl) return null
  return (
    <group>
      <GroundShadow at={DOG_SPOT} width={2.2} depth={1.3} opacity={0.5} />
      <Suspense fallback={null}>
        <RunningDog url={runUrl} />
      </Suspense>
    </group>
  )
}

// ── 场景 ─────────────────────────────────────────────────────────────
function Scene({ selected, onSelect }) {
  const assets = {
    fir: modelUrl('fir'),
    spruce: modelUrl('spruce'),
    oak: modelUrl('oak'),
    rock: modelUrl('rock'),
    shrub: modelUrl('shrub'),
    sign: modelUrl('sign'),
    deadwood: modelUrl('deadwood'),
  }
  const groundTex = useMemo(makeGroundTexture, [])
  useEffect(() => () => groundTex.dispose(), [groundTex])

  return (
    <>
      <color attach="background" args={['#f0f6da']} />
      <fog attach="fog" args={['#f8f6de', 23, 76]} />
      <CameraRig />
      <SkyDome />
      <SunGlow />

      <hemisphereLight args={['#fffdf0', '#65854f', 1.75]} />
      <ambientLight intensity={0.42} />
      <directionalLight
        position={[11, 17, -8]}
        intensity={2.35}
        color="#fff4cf"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-camera-near={0.5}
        shadow-camera-far={45}
      />
      <directionalLight position={[-6, 5, 9]} intensity={0.62} color="#e2f7cc" />
      <directionalLight position={[1, 5, 12]} intensity={1.05} color="#fff7de" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[90, 64]} />
        <meshStandardMaterial map={groundTex} color="#ffffff" roughness={1} />
      </mesh>
      <PathRibbon />
      <DappleLight />
      <GroundDetails />

      <Sunbeams />
      <Motes />
      <pointLight position={[0.5, 2.4, 5.2]} intensity={0.85} distance={9} color="#fff0cf" />
      <TrailCompanion />

      {/* 半包围：侧树压边、中景树沿前方半圆成弧，正前方留出望进林中的走廊 */}
      {(assets.oak || assets.fir) && <SideTrees oak={assets.oak} fir={assets.fir} />}
      {assets.fir && (
        <Suspense fallback={null}>
          <TreeLayer url={assets.fir} count={16} minR={6.8} maxR={13.0} minH={5.6} maxH={9.2} seed={11} tint={1.34} gap={0.34} />
        </Suspense>
      )}
      {assets.spruce && (
        <Suspense fallback={null}>
          <TreeLayer url={assets.spruce} count={11} minR={8.0} maxR={14.0} minH={5.0} maxH={8.2} seed={23} tint={1.32} gap={0.3} />
        </Suspense>
      )}
      {assets.oak && (
        <Suspense fallback={null}>
          <TreeLayer url={assets.oak} count={6} minR={6.8} maxR={10.2} minH={4.6} maxH={6.4} seed={37} tint={1.3} gap={0.3} />
        </Suspense>
      )}
      {/* 远景：雾里渐隐的一层，让「林子深处」有纵深 */}
      {assets.fir && (
        <Suspense fallback={null}>
          <TreeLayer url={assets.fir} count={11} minR={16} maxR={25} minH={6.5} maxH={10.5} seed={91} tint={1.16} gap={0.15} />
        </Suspense>
      )}

      {assets.deadwood && (
        <Suspense fallback={null}>
          <FallenLogs url={assets.deadwood} />
        </Suspense>
      )}
      {assets.rock && (
        <Suspense fallback={null}>
          <GroundScatter url={assets.rock} count={6} minR={5.6} maxR={11} minSize={0.42} maxSize={0.92} sink={0.12} seed={51} avoid={SCATTER_AVOID} />
        </Suspense>
      )}
      {assets.shrub && (
        <Suspense fallback={null}>
          <GroundScatter url={assets.shrub} count={11} minR={4.8} maxR={11.5} minSize={0.5} maxSize={1.08} seed={63} avoid={SCATTER_AVOID} />
        </Suspense>
      )}

      {assets.sign && (
        <Suspense fallback={null}>
          <TrailSigns
            items={sections}
            selected={selected}
            onSelect={onSelect}
            signUrl={assets.sign}
            shrubUrl={assets.shrub}
            rockUrl={assets.rock}
          />
        </Suspense>
      )}

      <OrbitControls
        makeDefault
        enabled
        target={CAMERA_TARGET}
        enablePan={false}
        enableDamping
        dampingFactor={0.075}
        minDistance={6}
        maxDistance={16}
        minPolarAngle={1.0}
        maxPolarAngle={1.58}
        minAzimuthAngle={-0.85}
        maxAzimuthAngle={0.85}
      />
    </>
  )
}

export default function Forest({ selected, onSelect }) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{ position: CAMERA_POS, fov: 50, near: 0.1, far: 160 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.27
      }}
    >
      <Scene selected={selected} onSelect={onSelect} />
    </Canvas>
  )
}
