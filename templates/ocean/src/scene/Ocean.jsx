import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Billboard, OrbitControls, useGLTF, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { sections } from '../data/content.js'
import { MODELS, IMAGES } from '../assets.js'

const MOBILE = typeof window !== 'undefined' && window.innerWidth < 760

// 四个栏目入口围着中央空地；按 sections 顺序取位，改栏目 id 不受影响
const SIGN_SLOTS = MOBILE
  ? [
      [-1.25, 0, 1.9],
      [1.25, 0, 1.9],
      [-1.25, 0, -1.9],
      [1.25, 0, -1.9],
    ]
  : [
      [-3.4, 0, 2.9],
      [3.4, 0, 2.9],
      [-3.4, 0, -2.9],
      [3.4, 0, -2.9],
    ]

const DEFAULT_CAM = MOBILE ? [0, 4.0, 11.6] : [0, 3.4, 9.8]

function mulberry32(seed) {
  return function random() {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Hi3D 贴图自带烘焙光照，这里统一提亮并降低反射，让材质融进明亮的浅海
function tuneMaterials(root, tint = 1.02) {
  root.traverse((obj) => {
    if (!obj.isMesh) return
    obj.castShadow = false
    obj.receiveShadow = false
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
    mats.forEach((mat) => {
      if (!mat || mat.userData.tuned) return
      mat.userData.tuned = true
      if (mat.color) mat.color.multiplyScalar(tint)
      if ('roughness' in mat) mat.roughness = Math.max(mat.roughness ?? 1, 0.8)
      if ('metalness' in mat) mat.metalness = Math.min(mat.metalness ?? 0, 0.12)
      if ('envMapIntensity' in mat) mat.envMapIntensity = 0.55
    })
  })
  return root
}

// 按高度缩放、底部贴地。用于礁石、珊瑚、木牌、潜水员
function fitGrounded(scene, targetHeight, tint) {
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

// 摆尾动画共用的时间源
const swimClock = { value: 0 }

function tuneMaterial(mat, tint) {
  if (mat.color) mat.color.multiplyScalar(tint)
  if ('roughness' in mat) mat.roughness = Math.max(mat.roughness ?? 1, 0.8)
  if ('metalness' in mat) mat.metalness = Math.min(mat.metalness ?? 0, 0.12)
  if ('envMapIntensity' in mat) mat.envMapIntensity = 0.55
  return mat
}

// 顶点着色器里让后半身左右摆动：模型头朝 +Z、尾鳍在 -Z，越靠尾幅度越大
function injectSwim(mat, phase, amp = 0.05) {
  mat.userData.swim = true
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSwimTime = swimClock
    shader.uniforms.uSwimPhase = { value: phase }
    shader.uniforms.uSwimAmp = { value: amp }
    shader.vertexShader = `uniform float uSwimTime;\nuniform float uSwimPhase;\nuniform float uSwimAmp;\n${shader.vertexShader}`
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float swimW = smoothstep(0.02, 0.5, -position.z);
      transformed.x += sin(position.z * 3.2 + uSwimTime * 2.4 + uSwimPhase) * uSwimAmp * swimW;`,
    )
  }
  mat.needsUpdate = true
  return mat
}

// 按最长边缩放、几何中心归零，并给每条鲸鱼独立的摆尾相位。用于虎鲸、白鲸
function fitSwimmer(scene, targetLength, tint, phase = 0) {
  const clone = scene.clone(true)
  clone.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(clone)
  const size = new THREE.Vector3()
  const center = new THREE.Vector3()
  box.getSize(size)
  box.getCenter(center)
  const longest = Math.max(size.x, size.y, size.z, 0.001)
  const s = targetLength / longest
  clone.scale.multiplyScalar(s)
  clone.position.set(-center.x * s, -center.y * s, -center.z * s)

  // 克隆材质，避免几条鲸鱼共享同一份着色器与摆动相位
  clone.traverse((obj) => {
    if (!obj.isMesh) return
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
    const next = mats.map((m) => injectSwim(tuneMaterial(m.clone(), tint), phase))
    obj.material = Array.isArray(obj.material) ? next : next[0]
  })

  return clone
}

function SwimClock() {
  useFrame(({ clock }) => {
    swimClock.value = clock.elapsedTime
  })
  return null
}

function makeSandTexture() {
  const size = 1024
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const rnd = mulberry32(2026)

  ctx.fillStyle = '#f0d9a4'
  ctx.fillRect(0, 0, size, size)

  // 用柔和的色块做沙地斑驳，避开高频噪点导致的远处“碎面”感
  for (let i = 0; i < 240; i++) {
    const x = rnd() * size
    const y = rnd() * size
    const r = 22 + rnd() * 120
    const light = rnd() > 0.42
    const rgb = light ? '255, 246, 214' : '196, 164, 118'
    const alpha = light ? 0.06 + rnd() * 0.1 : 0.05 + rnd() * 0.08
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const cx = x + ox * size
        const cy = y + oy * size
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
        g.addColorStop(0, `rgba(${rgb}, ${alpha})`)
        g.addColorStop(1, `rgba(${rgb}, 0)`)
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  // 缓沙纹，周期取整数保证平铺无缝
  ctx.strokeStyle = 'rgba(252, 238, 208, 0.32)'
  for (let k = 0; k < 7; k++) {
    ctx.lineWidth = 4 + rnd() * 5
    ctx.beginPath()
    for (let x = 0; x <= size; x += 10) {
      const y = (k / 7) * size + Math.sin((x / size) * Math.PI * 6) * 22
      if (x === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(3, 3)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

function makeShaftTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  const vertical = ctx.createLinearGradient(0, 0, 0, 512)
  vertical.addColorStop(0, 'rgba(255,252,236,0)')
  vertical.addColorStop(0.16, 'rgba(255,250,226,0.92)')
  vertical.addColorStop(0.55, 'rgba(255,238,198,0.42)')
  vertical.addColorStop(1, 'rgba(255,226,180,0)')
  ctx.fillStyle = vertical
  ctx.fillRect(0, 0, 256, 512)

  ctx.globalCompositeOperation = 'destination-in'
  const horizontal = ctx.createLinearGradient(0, 0, 256, 0)
  horizontal.addColorStop(0, 'rgba(0,0,0,0)')
  horizontal.addColorStop(0.28, 'rgba(0,0,0,0.95)')
  horizontal.addColorStop(0.72, 'rgba(0,0,0,0.95)')
  horizontal.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = horizontal
  ctx.fillRect(0, 0, 256, 512)
  ctx.globalCompositeOperation = 'source-over'

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

let BLOB_TEXTURE = null

function makeBlobTexture() {
  if (BLOB_TEXTURE) return BLOB_TEXTURE
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 126)
  g.addColorStop(0, 'rgba(28, 78, 84, 0.38)')
  g.addColorStop(0.5, 'rgba(28, 78, 84, 0.18)')
  g.addColorStop(1, 'rgba(28, 78, 84, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 256)
  BLOB_TEXTURE = new THREE.CanvasTexture(canvas)
  return BLOB_TEXTURE
}

function makeLabelTexture(text) {
  const canvas = document.createElement('canvas')
  canvas.width = 1536
  canvas.height = 420
  const ctx = canvas.getContext('2d')
  const cx = canvas.width / 2
  const cy = canvas.height / 2
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '600 220px "YouYuan", "Yuanti SC", "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.letterSpacing = '18px'

  const textWidth = ctx.measureText(text).width

  // 两侧小气泡，替代原来偏正式的金色饰线
  const bubbleRnd = mulberry32(77)
  ;[-1, 1].forEach((dir) => {
    const edge = cx - dir * (textWidth / 2 + 48)
    for (let i = 0; i < 3; i++) {
      const r = 9 + bubbleRnd() * 13
      const x = edge + dir * (i * 36 + 10)
      const y = cy + (bubbleRnd() - 0.5) * 88
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
      ctx.fill()
      ctx.lineWidth = 5
      ctx.strokeStyle = 'rgba(20, 124, 140, 0.9)'
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(x - r * 0.3, y - r * 0.32, r * 0.3, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
      ctx.fill()
    }
  })

  // 贴纸风描边：深青投影 + 白边 + 明亮黄橙渐变字面
  ctx.lineJoin = 'round'
  ctx.save()
  ctx.shadowColor = 'rgba(7, 46, 58, 0.45)'
  ctx.shadowOffsetY = 14
  ctx.shadowBlur = 16
  ctx.strokeStyle = '#0a5566'
  ctx.lineWidth = 22
  ctx.strokeText(text, cx, cy + 4)
  ctx.restore()

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.96)'
  ctx.lineWidth = 6
  ctx.strokeText(text, cx, cy + 4)

  const sunny = ctx.createLinearGradient(0, cy - 128, 0, cy + 128)
  sunny.addColorStop(0, '#fff8c6')
  sunny.addColorStop(0.34, '#ffe95f')
  sunny.addColorStop(0.72, '#ffd23f')
  sunny.addColorStop(1, '#ffb64a')
  ctx.fillStyle = sunny
  ctx.fillText(text, cx, cy)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

// 入口文字背后的柔光晕，让字在珊瑚、沙地上都能读清，同时提亮画面
function makeHaloTexture() {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255, 255, 238, 0.5)')
  g.addColorStop(0.5, 'rgba(216, 250, 244, 0.3)')
  g.addColorStop(0.78, 'rgba(198, 242, 238, 0.1)')
  g.addColorStop(1, 'rgba(198, 242, 238, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function Blob({ position, size = 1.2 }) {
  const map = useMemo(() => makeBlobTexture(), [])
  return (
    <mesh position={[position[0], 0.014, position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial map={map} transparent depthWrite={false} />
    </mesh>
  )
}

function SandGround() {
  const map = useMemo(() => makeSandTexture(), [])
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <circleGeometry args={[32, 72]} />
      <meshStandardMaterial map={map} color="#ffe9bf" roughness={1} metalness={0} />
    </mesh>
  )
}

// 柔和的水下光斑：一堆模糊的光池，比硬边焦散更像阳光洒在沙上
function makeCausticTexture() {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const rnd = mulberry32(59)
  for (let i = 0; i < 56; i++) {
    const x = rnd() * size
    const y = rnd() * size
    const r = 26 + rnd() * 76
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, `rgba(255,255,255,${0.22 + rnd() * 0.32})`)
    g.addColorStop(0.55, 'rgba(240,255,252,0.12)')
    g.addColorStop(1, 'rgba(240,255,252,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(x, y, r * (0.7 + rnd() * 0.6), r * (0.5 + rnd() * 0.5), rnd() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function Caustics() {
  const map = useMemo(() => makeCausticTexture(), [])
  const ref = useRef()
  map.repeat.set(8, 8)
  map.center.set(0.5, 0.5)
  map.rotation = 0.6

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    map.offset.set(t * 0.012, t * 0.008)
  })

  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
      <circleGeometry args={[26, 72]} />
      <meshBasicMaterial
        map={map}
        color="#d7f5ee"
        transparent
        opacity={0.11}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  )
}

function GodRays() {
  const map = useMemo(() => makeShaftTexture(), [])
  const shafts = useMemo(() => {
    const rnd = mulberry32(31)
    return new Array(7).fill(0).map((_, i) => {
      const angle = (i / 7) * Math.PI * 2 + rnd() * 0.4
      const radius = 2.6 + rnd() * 6.8
      return {
        pos: [Math.cos(angle) * radius, 2.0, Math.sin(angle) * radius],
        rot: (rnd() - 0.5) * 0.8,
        width: 3.2 + rnd() * 2.6,
        height: 4.6 + rnd() * 1.6,
        opacity: 0.08 + rnd() * 0.07,
      }
    })
  }, [])

  return shafts.map((s, i) => (
    <mesh key={i} position={s.pos} rotation={[0, s.rot, 0]}>
      <planeGeometry args={[s.width, s.height]} />
      <meshBasicMaterial
        map={map}
        transparent
        opacity={s.opacity}
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  ))
}

function Bubbles() {
  const ref = useRef()
  const seeds = useMemo(() => {
    const rnd = mulberry32(91)
    const count = MOBILE ? 70 : 130
    return new Array(count).fill(0).map(() => ({
      x: (rnd() - 0.5) * 24,
      z: (rnd() - 0.5) * 24,
      y: rnd() * 12,
      speed: 0.35 + rnd() * 0.8,
      sway: 0.05 + rnd() * 0.18,
      phase: rnd() * Math.PI * 2,
      size: 0.03 + rnd() * 0.05,
    }))
  }, [])

  const positions = useMemo(() => {
    const arr = new Float32Array(seeds.length * 3)
    seeds.forEach((s, i) => {
      arr[i * 3] = s.x
      arr[i * 3 + 1] = s.y
      arr[i * 3 + 2] = s.z
    })
    return arr
  }, [seeds])

  useFrame(({ clock }) => {
    const attr = ref.current?.geometry?.attributes?.position
    if (!attr) return
    const t = clock.elapsedTime
    seeds.forEach((s, i) => {
      const y = (s.y + t * s.speed) % 12
      attr.array[i * 3] = s.x + Math.sin(t * 0.6 + s.phase) * s.sway
      attr.array[i * 3 + 1] = y
      attr.array[i * 3 + 2] = s.z + Math.cos(t * 0.5 + s.phase) * s.sway
    })
    attr.needsUpdate = true
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#eafff9"
        size={0.06}
        sizeAttenuation
        transparent
        opacity={0.7}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

// 半透明水母：伞盖 + 触手，缓慢漂在相机附近
function Jellyfish({ position, size = 0.85, color = '#ffc9da', phase = 0, drift = 0.5 }) {
  const group = useRef()

  const tentacles = useMemo(() => {
    const list = []
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI * 2
      const points = []
      for (let j = 0; j <= 8; j++) {
        const taper = 1 - j / 10
        points.push(
          new THREE.Vector3(
            Math.cos(angle + j * 0.24) * 0.16 * taper,
            -j * 0.22,
            Math.sin(angle + j * 0.24) * 0.16 * taper,
          ),
        )
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points)
      const material = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      })
      list.push(new THREE.Line(geometry, material))
    }
    return list
  }, [color])

  useFrame(({ clock }) => {
    if (!group.current) return
    const t = clock.elapsedTime
    group.current.position.set(
      position[0] + Math.sin(t * 0.28 + phase) * drift,
      position[1] + Math.sin(t * 0.5 + phase) * 0.26,
      position[2] + Math.cos(t * 0.22 + phase) * drift,
    )
    group.current.rotation.y = t * 0.1 + phase
    group.current.rotation.z = Math.sin(t * 0.42 + phase) * 0.14
  })

  return (
    <group ref={group} position={position} scale={[size, size * 0.82, size]}>
      <mesh>
        <sphereGeometry args={[1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={0.5}
          roughness={0.24}
          metalness={0}
          emissive={color}
          emissiveIntensity={0.18}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh scale={0.5}>
        <sphereGeometry args={[1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshBasicMaterial color="#fff4f8" transparent opacity={0.26} depthWrite={false} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <torusGeometry args={[1, 0.06, 8, 28]} />
        <meshBasicMaterial color={color} transparent opacity={0.45} depthWrite={false} />
      </mesh>
      {tentacles.map((line, i) => (
        <primitive key={i} object={line} />
      ))}
    </group>
  )
}

// 低多边形海星，趴在沙地上做前景点缀
function Starfish({ position, size = 0.42, rotation = 0, color = '#f2865f' }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape()
    const arms = 5
    for (let i = 0; i < arms * 2; i++) {
      const radius = i % 2 === 0 ? 1 : 0.42
      const angle = (i / (arms * 2)) * Math.PI * 2 + Math.PI / 2
      const x = Math.cos(angle) * radius
      const y = Math.sin(angle) * radius
      if (i === 0) shape.moveTo(x, y)
      else shape.lineTo(x, y)
    }
    shape.closePath()
    return new THREE.ExtrudeGeometry(shape, {
      depth: 0.1,
      bevelEnabled: true,
      bevelSize: 0.07,
      bevelThickness: 0.07,
      bevelSegments: 2,
    })
  }, [])

  return (
    <mesh geometry={geometry} position={position} rotation={[-Math.PI / 2, 0, rotation]} scale={[size, size, size]}>
      <meshStandardMaterial color={color} roughness={0.72} metalness={0} />
    </mesh>
  )
}

// 珊瑚、礁石、船锚、宝箱：同一个 GLB 克隆多份
function Scatter({ url, items, tint = 0.8 }) {
  const { scene } = useGLTF(url)
  const models = useMemo(
    () => items.map((item) => fitGrounded(scene, item.height, tint)),
    [scene, items, tint],
  )

  return models.map((model, i) => (
    <group key={i} position={items[i].pos} rotation={[0, items[i].rot, 0]}>
      <primitive object={model} />
      <Blob position={[0, 0, 0]} size={Math.max(0.8, items[i].height * 1.1)} />
    </group>
  ))
}

// 从沙地升起的一串小气泡，给入口一点呼吸感
function SignBubbles({ phase = 0 }) {
  const refs = useRef([])
  const seeds = useMemo(
    () =>
      new Array(5).fill(0).map((_, i) => ({
        delay: i / 5,
        x: Math.sin(i * 2.3) * 0.22,
        z: Math.cos(i * 1.7) * 0.16,
        size: 0.022 + (i % 3) * 0.012,
        speed: 0.28 + (i % 4) * 0.06,
      })),
    [],
  )

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    seeds.forEach((s, i) => {
      const bubble = refs.current[i]
      if (!bubble) return
      const p = (t * s.speed + s.delay + phase * 0.12) % 1
      bubble.position.set(s.x + Math.sin(t * 1.1 + i) * 0.05, 0.12 + p * 1.12, s.z)
      bubble.scale.setScalar(s.size * (0.6 + p * 0.7))
      bubble.material.opacity = (1 - p) * 0.5
    })
  })

  return seeds.map((s, i) => (
    <mesh key={i} ref={(el) => (refs.current[i] = el)}>
      <sphereGeometry args={[1, 8, 6]} />
      <meshBasicMaterial color="#eafffb" transparent opacity={0.4} depthWrite={false} />
    </mesh>
  ))
}

// 模块入口：沙地光环 + 悬浮柔光 + 金色艺术字，代替原来写实的木桩牌
function SignItem({ section, slot, active, onSelect }) {
  const texture = useMemo(() => makeLabelTexture(section.label), [section.label])
  const halo = useMemo(() => makeHaloTexture(), [])
  const [hover, setHover] = useState(false)
  const pos = SIGN_SLOTS[slot % SIGN_SLOTS.length]
  const group = useRef()
  const seed = pos[0] * 0.6 + pos[2] * 0.4
  const lit = active || hover
  const labelW = MOBILE ? 1.22 : 1.85
  const labelH = labelW / 3.663

  useEffect(() => {
    document.body.style.cursor = hover ? 'pointer' : 'auto'
    return () => {
      document.body.style.cursor = 'auto'
    }
  }, [hover])

  useFrame(({ clock }) => {
    if (!group.current) return
    const t = clock.elapsedTime
    group.current.position.y = 1.3 + Math.sin(t * 0.55 + seed) * 0.06
    group.current.rotation.z = Math.sin(t * 0.45 + seed) * 0.016
    group.current.scale.setScalar(lit ? 1.05 : 1)
  })

  return (
    <group position={pos}>
      {/* 沙地光圈的落点，标明这里可以点 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.62, 0.86, 48]} />
        <meshBasicMaterial
          color={section.accent}
          transparent
          opacity={lit ? 0.6 : 0.28}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <SignBubbles phase={pos[0]} />

      <group ref={group} position={[0, 1.3, 0]}>
        <Billboard>
          <group
            onClick={(e) => {
              e.stopPropagation()
              onSelect(section.id)
            }}
            onPointerOver={(e) => {
              e.stopPropagation()
              setHover(true)
            }}
            onPointerOut={() => setHover(false)}
          >
            <mesh position={[0, 0, -0.04]} scale={MOBILE ? [1.9, 1.1, 1] : [2.45, 1.38, 1]} renderOrder={3}>
              <planeGeometry args={[1, 1]} />
              <meshBasicMaterial
                map={halo}
                transparent
                opacity={lit ? 0.52 : 0.4}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
            <mesh renderOrder={4}>
              <planeGeometry args={[labelW, labelH]} />
              <meshBasicMaterial
                map={texture}
                transparent
                depthWrite={false}
                side={THREE.DoubleSide}
                toneMapped={false}
                opacity={lit ? 1 : 0.95}
              />
            </mesh>
          </group>
        </Billboard>
      </group>
    </group>
  )
}

function SectionMarkers({ selected, onSelect }) {
  return (
    <>
      {sections.map((section, index) => (
        <SignItem
          key={section.id}
          section={section}
          slot={index}
          active={selected === section.id}
          onSelect={onSelect}
        />
      ))}
    </>
  )
}

function Diver() {
  const { scene } = useGLTF(MODELS.diver)
  const model = useMemo(() => fitGrounded(scene, 1.95, 1.02), [scene])
  return (
    <group position={[0.2, 0.02, 0.3]} rotation={[0, Math.PI * 0.06, 0]}>
      <primitive object={model} />
      <Blob position={[0, 0, 0]} size={1.5} />
    </group>
  )
}

// 大生物横穿场景：在远侧沿宽幅 S 形路径游过，不围着中央空地打转
function Drifter({
  url,
  length,
  spanX,
  spanZ,
  zBase,
  height,
  speed = 0.09,
  phase = 0,
  tint = 1,
}) {
  const { scene } = useGLTF(url)
  const model = useMemo(() => fitSwimmer(scene, length, tint, phase), [scene, length, tint, phase])
  const ref = useRef()

  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.elapsedTime
    const a = t * speed + phase

    // 一条左右横掠、深度上做二次摆动的路径：像穿过画面，而不是绕圈
    const px = Math.sin(a) * spanX
    const pz = zBase + Math.sin(a * 2) * spanZ
    const vx = Math.cos(a) * spanX
    const vz = Math.cos(a * 2) * spanZ * 2
    const ax = -Math.sin(a) * spanX
    const az = -Math.sin(a * 2) * spanZ * 4

    // 模型头朝 +Z：把 +Z 对齐到速度方向
    const yaw = Math.atan2(vx, vz)
    const turn = (vx * az - vz * ax) / (vx * vx + vz * vz + 0.001)
    const roll = Math.max(-0.18, Math.min(0.18, turn * 0.3))
    const y = height + Math.sin(a * 0.8 + phase) * 0.38

    ref.current.position.set(px, y, pz)
    ref.current.rotation.set(
      Math.sin(a * 0.9 + 1.4) * 0.05,
      yaw + Math.sin(a * 0.6) * 0.04,
      roll,
    )
  })

  return (
    <group ref={ref}>
      <primitive object={model} />
    </group>
  )
}

// 2D 鲨鱼 / 海豚：始终面向镜头的单面片，沿同样的横向路径穿游，翻转贴图表示前进方向
function SpriteSwimmer({
  url,
  length,
  spanX,
  spanZ,
  zBase,
  height,
  speed = 0.09,
  phase = 0,
  tint = '#ffffff',
}) {
  const map = useTexture(url)
  const { camera } = useThree()
  const group = useRef()

  useFrame(({ clock }) => {
    if (!group.current) return
    const t = clock.elapsedTime
    const a = t * speed + phase
    const px = Math.sin(a) * spanX
    const pz = zBase + Math.sin(a * 2) * spanZ
    const vx = Math.cos(a) * spanX
    const vz = Math.cos(a * 2) * spanZ * 2
    const y = height + Math.sin(a * 0.8 + phase) * 0.3

    // 只绕 Y 轴朝向相机，避免交叉面片带来的重影
    const yaw = Math.atan2(camera.position.x - px, camera.position.z - pz)
    const facing = vx * Math.cos(yaw) + vz * -Math.sin(yaw) > 0 ? -1 : 1

    group.current.position.set(px, y, pz)
    group.current.rotation.set(0, yaw, Math.sin(a * 0.9 + phase) * 0.05)
    group.current.scale.set(length * facing, length, 1)
  })

  return (
    <group ref={group}>
      <mesh>
        <planeGeometry args={[1, 0.75]} />
        <meshBasicMaterial
          map={map}
          color={tint}
          transparent
          alphaTest={0.5}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

// 2D 鱼群：等角分布 + 同速巡航，避免互相追尾叠在一起；单面片朝向相机消除交叉重影
function FishSchool({ url, count, sizeScale, radiusMin, radiusMax, yMin, yMax, speed = 0.12, seed, tint = '#dff5ef' }) {
  const map = useTexture(url)
  const meshRef = useRef()
  const { camera } = useThree()
  const fish = useMemo(() => {
    const rnd = mulberry32(seed)
    return new Array(count).fill(0).map((_, i) => ({
      // 每条鱼占一个独立角度槽位，整群同步前进，间距保持不变
      phase: (i / count) * Math.PI * 2 + (rnd() - 0.5) * 0.1,
      radius: radiusMin + rnd() * (radiusMax - radiusMin),
      y: yMin + rnd() * (yMax - yMin),
      size: sizeScale * (0.84 + rnd() * 0.32),
      bob: 0.1 + rnd() * 0.22,
      bobPhase: rnd() * Math.PI * 2,
    }))
  }, [count, sizeScale, radiusMin, radiusMax, yMin, yMax, seed])

  const dummy = useMemo(() => new THREE.Object3D(), [])

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const t = clock.elapsedTime
    const cam = camera.position
    fish.forEach((f, i) => {
      const a = f.phase + t * speed
      const px = Math.cos(a) * f.radius
      const pz = Math.sin(a) * f.radius
      const py = f.y + Math.sin(t * 0.7 + f.bobPhase) * f.bob
      // 只绕 Y 轴面向镜头；尾巴跟着相位轻轻摆
      const yaw = Math.atan2(cam.x - px, cam.z - pz)
      const tangentX = -Math.sin(a)
      const tangentZ = Math.cos(a)
      const facing = tangentX * Math.cos(yaw) + tangentZ * -Math.sin(yaw) > 0 ? -1 : 1
      dummy.position.set(px, py, pz)
      dummy.rotation.set(0, yaw, Math.sin(t * 0.9 + f.bobPhase) * 0.05)
      dummy.scale.set(f.size * facing, f.size * 0.62, 1)
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, dummy.matrix)
    })
    meshRef.current.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[null, null, count]} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        map={map}
        color={tint}
        transparent
        alphaTest={0.5}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </instancedMesh>
  )
}

function PlantField({ url, count, minR, maxR, minH, maxH, widthRatio = 0.4, seed, sway = 0.04, color = '#ffffff' }) {
  const map = useTexture(url)
  const meshRef = useRef()
  const plants = useMemo(() => {
    const rnd = mulberry32(seed)
    return new Array(count).fill(0).map(() => ({
      angle: rnd() * Math.PI * 2,
      radius: minR + rnd() * (maxR - minR),
      height: minH + rnd() * (maxH - minH),
      rot: rnd() * Math.PI * 2,
      phase: rnd() * Math.PI * 2,
    }))
  }, [count, minR, maxR, minH, maxH, seed])

  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1)
    g.translate(0, 0.5, 0)
    return g
  }, [])

  const dummy = useMemo(() => new THREE.Object3D(), [])

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const t = clock.elapsedTime
    plants.forEach((p, i) => {
      const x = Math.cos(p.angle) * p.radius
      const z = Math.sin(p.angle) * p.radius
      const tilt = Math.sin(t * 0.45 + p.phase) * sway
      dummy.position.set(x, 0, z)
      dummy.rotation.set(0, p.rot, tilt)
      dummy.scale.set(p.height * widthRatio, p.height, 1)
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i * 2, dummy.matrix)
      dummy.rotation.y = p.rot + Math.PI / 2
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i * 2 + 1, dummy.matrix)
    })
    meshRef.current.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[geometry, undefined, count * 2]} frustumCulled={false}>
      <meshBasicMaterial
        map={map}
        color={color}
        transparent
        alphaTest={0.3}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </instancedMesh>
  )
}

function CameraRig({ selected }) {
  const { controls } = useThree()
  const center = useMemo(() => new THREE.Vector3(0, 1.05, 0), [])

  useFrame((state, dt) => {
    if (!controls) return
    const index = selected ? sections.findIndex((s) => s.id === selected) : -1
    const sign = index >= 0 ? SIGN_SLOTS[index % SIGN_SLOTS.length] : null
    const desired = sign
      ? new THREE.Vector3(sign[0] * 0.86, 1.2, sign[2] * 0.86)
      : center
    const k = 1 - Math.pow(0.0016, Math.min(dt, 0.1))
    controls.target.lerp(desired, k)
    controls.update()
  })

  return null
}

function Scenery() {
  const coralItems = useMemo(() => {
    const rnd = mulberry32(113)
    const count = MOBILE ? 6 : 11
    return new Array(count).fill(0).map(() => {
      const angle = rnd() * Math.PI * 2
      const radius = 7.0 + rnd() * 3.2
      return {
        pos: [Math.cos(angle) * radius, 0, Math.sin(angle) * radius],
        rot: rnd() * Math.PI * 2,
        height: 1.0 + rnd() * 1.2,
      }
    })
  }, [])

  const tubeItems = useMemo(() => {
    const rnd = mulberry32(127)
    const count = MOBILE ? 4 : 7
    return new Array(count).fill(0).map(() => {
      const angle = rnd() * Math.PI * 2
      const radius = 7.3 + rnd() * 2.9
      return {
        pos: [Math.cos(angle) * radius, 0, Math.sin(angle) * radius],
        rot: rnd() * Math.PI * 2,
        height: 1.5 + rnd() * 1.0,
      }
    })
  }, [])

  const rockItems = useMemo(() => {
    const rnd = mulberry32(139)
    const count = MOBILE ? 3 : 5
    return new Array(count).fill(0).map(() => {
      const angle = rnd() * Math.PI * 2
      const radius = 6.6 + rnd() * 3.2
      return {
        pos: [Math.cos(angle) * radius, 0, Math.sin(angle) * radius],
        rot: rnd() * Math.PI * 2,
        height: 0.65 + rnd() * 0.7,
      }
    })
  }, [])

  return (
    <Suspense fallback={null}>
      <Scatter url={MODELS.coral} items={coralItems} tint={1.12} />
      <Scatter url={MODELS.tube} items={tubeItems} tint={1.14} />
      <Scatter url={MODELS.rock} items={rockItems} tint={1.04} />
      <group position={[-5.4, 0, 1.6]} rotation={[0, 0.9, 0.1]}>
        <Scatter url={MODELS.anchor} items={[{ pos: [0, 0, 0], rot: 0.4, height: 1.55 }]} tint={1.06} />
      </group>
      <group position={[5.2, 0, -1.2]}>
        <Scatter url={MODELS.chest} items={[{ pos: [0, 0, 0], rot: 0.7, height: 0.72 }]} tint={1.1} />
      </group>
      <group position={[-4.8, 0, -4.2]}>
        <Scatter url={MODELS.chest} items={[{ pos: [0, 0, 0], rot: 2.1, height: 0.62 }]} tint={1.04} />
      </group>
      <Diver />
      {/* 大生物在远侧横穿画面：宽幅 S 形路径，彼此错开高度与起点 */}
      <Drifter url={MODELS.orca} length={5.2} spanX={11.5} spanZ={2.4} zBase={-3.6} height={3.5} speed={0.085} phase={0.4} tint={1.02} />
      <Drifter url={MODELS.orca} length={4.3} spanX={9.6} spanZ={2.0} zBase={-4.4} height={4.2} speed={0.072} phase={2.1} tint={0.96} />
      <Drifter url={MODELS.beluga} length={3.4} spanX={6.4} spanZ={1.5} zBase={-1.4} height={2.6} speed={0.11} phase={3.7} tint={1.06} />

      <SpriteSwimmer url={IMAGES.shark} length={3.5} spanX={12.5} spanZ={2.6} zBase={-5.6} height={4.6} speed={0.068} phase={0.2} />
      <SpriteSwimmer url={IMAGES.dolphin} length={2.6} spanX={10.0} spanZ={2.2} zBase={-4.9} height={2.4} speed={0.088} phase={3.1} tint="#f2fbfc" />
      <SpriteSwimmer url={IMAGES.dolphin} length={2.2} spanX={8.0} spanZ={1.8} zBase={-3.3} height={1.6} speed={0.1} phase={5.4} tint="#f6fcfd" />

      <Jellyfish position={[-5.4, 3.5, 2.2]} size={0.52} color="#ffa8c6" phase={0.4} drift={0.45} />
      <Jellyfish position={[5.2, 3.2, 1.8]} size={0.46} color="#ffb3ce" phase={2.1} drift={0.4} />
      <Jellyfish position={[-4.4, 2.9, -4.4]} size={0.58} color="#ffb478" phase={3.6} drift={0.45} />

      <Starfish position={[-2.4, 0.02, 4.6]} size={0.44} rotation={0.4} color="#f2865f" />
      <Starfish position={[2.3, 0.02, 5.2]} size={0.38} rotation={1.1} color="#ffb066" />
      <Starfish position={[-4.6, 0.02, 2.4]} size={0.34} rotation={2.4} color="#f9c46b" />
      <Starfish position={[4.2, 0.02, 3.2]} size={0.3} rotation={0.8} color="#f07a86" />

      <PlantField url={IMAGES.kelp} count={MOBILE ? 14 : 26} minR={MOBILE ? 17 : 10.5} maxR={MOBILE ? 23 : 16.5} minH={3.4} maxH={6.6} widthRatio={0.42} seed={151} sway={0.06} color="#84a76c" />
      <PlantField url={IMAGES.seagrass} count={MOBILE ? 10 : 18} minR={4.2} maxR={7.4} minH={0.5} maxH={1.15} widthRatio={0.55} seed={163} sway={0.05} color="#8db066" />

      <FishSchool url={IMAGES.fishSilver} count={MOBILE ? 28 : 46} sizeScale={0.4} radiusMin={5.6} radiusMax={8.4} yMin={1.6} yMax={3.0} seed={187} />
      <FishSchool url={IMAGES.fishYellow} count={MOBILE ? 9 : 14} sizeScale={0.38} radiusMin={4.4} radiusMax={5.8} yMin={1.1} yMax={2.0} speed={0.1} seed={199} tint="#eafff5" />
      <FishSchool url={IMAGES.fishOrange} count={MOBILE ? 5 : 8} sizeScale={0.44} radiusMin={3.6} radiusMax={4.8} yMin={0.9} yMax={1.7} speed={0.08} seed={211} tint="#fff2e6" />
      <FishSchool url={IMAGES.fishSilver} count={MOBILE ? 10 : 20} sizeScale={0.26} radiusMin={2.6} radiusMax={3.8} yMin={0.7} yMax={1.3} speed={0.16} seed={223} tint="#f2fffa" />
    </Suspense>
  )
}

// 明亮浅海背景：一块全屏渐变色，顶部接近水面所以更亮更暖
function WaterBackdrop() {
  const scene = useThree((state) => state.scene)
  useEffect(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 4
    canvas.height = 512
    const ctx = canvas.getContext('2d')
    const g = ctx.createLinearGradient(0, 0, 0, 512)
    g.addColorStop(0, '#3d87b8')
    g.addColorStop(0.14, '#55a4cd')
    g.addColorStop(0.34, '#74c0dd')
    g.addColorStop(0.64, '#63b3d0')
    g.addColorStop(1, '#4d9fbb')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 4, 512)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    const prev = scene.background
    scene.background = texture
    return () => {
      scene.background = prev
      texture.dispose()
    }
  }, [scene])
  return null
}

function SceneContent({ selected, onSelect }) {
  return (
    <>
      <WaterBackdrop />
      <SwimClock />
      <fogExp2 attach="fog" args={['#79c8e2', 0.022]} />

      <ambientLight intensity={0.62} color="#e6fbff" />
      <hemisphereLight args={['#c9f2fb', '#ffdda6', 0.66]} />
      <directionalLight position={[6, 16, 7]} intensity={1.15} color="#fff5e2" />
      <directionalLight position={[-5, 8, -5]} intensity={0.4} color="#cff6f8" />
      <pointLight position={[0, 5.6, 2]} intensity={1.5} distance={28} decay={2} color="#ffe7c2" />

      <SandGround />
      <Caustics />
      <GodRays />
      <Bubbles />

      <Scenery />
      <SectionMarkers selected={selected} onSelect={onSelect} />

      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.55}
        zoomSpeed={0.7}
        minDistance={4.2}
        maxDistance={18}
        minPolarAngle={0.5}
        maxPolarAngle={1.45}
        target={[0, 1.05, 0]}
      />
      <CameraRig selected={selected} />
    </>
  )
}

export default function Ocean({ selected, onSelect }) {
  return (
    <Canvas
      dpr={[1, 1.65]}
      camera={{ position: DEFAULT_CAM, fov: MOBILE ? 56 : 46, near: 0.1, far: 90 }}
      gl={{ antialias: true, powerPreference: 'high-performance', toneMappingExposure: 0.95 }}
      onPointerMissed={() => onSelect(null)}
    >
      <Suspense fallback={null}>
        <SceneContent selected={selected} onSelect={onSelect} />
      </Suspense>
    </Canvas>
  )
}

Object.entries(MODELS)
  .filter(([key]) => key !== 'sign')
  .forEach(([, url]) => useGLTF.preload(url))
