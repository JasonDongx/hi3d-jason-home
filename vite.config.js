import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const root = path.dirname(fileURLToPath(import.meta.url))
// 模板都放在 templates/ 下，Vite 以它为站点根，访问路径即 /forest、/ocean、/mountain
const templatesDir = path.join(root, 'templates')
const contentDir = path.join(templatesDir, 'forest', 'content')
const port = Number(process.env.PORT) || 5173
// 线上沙箱会注入 PORT；本地 dev 一律只绑回环，预览面板才扫得到
const isPublished = Boolean(process.env.PORT)
const host = isPublished ? '0.0.0.0' : '127.0.0.1'
// 本地想预览成品：SITE_CONTENT=site pnpm dev
const forceSite = process.env.SITE_CONTENT === 'site'

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

// 深层合并对象；数组与标量直接覆盖；下划线开头的键视为注释，忽略
function merge(base, extra) {
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return base
  const out = { ...(base || {}) }
  for (const [key, value] of Object.entries(extra)) {
    if (key.startsWith('_')) continue
    const prev = out[key]
    if (value && typeof value === 'object' && !Array.isArray(value) && prev && typeof prev === 'object' && !Array.isArray(prev)) {
      out[key] = merge(prev, value)
    } else {
      out[key] = value
    }
  }
  return out
}

// 内置栏目按 id 对齐文案；内容包也可以追加自己的栏目，场景按数量动态排布路标
function fixSections(demo, site) {
  const base = demo.sections || []
  const custom = Array.isArray(site.sections) ? site.sections : []
  const out = base.map((item) => {
    const override = custom.find((s) => s && s.id === item.id)
    return override ? { ...item, ...override, id: item.id } : item
  })
  for (const section of custom) {
    if (section && section.id && !out.some((item) => item.id === section.id)) out.push(section)
  }
  return out
}

function resolveContent() {
  const demo = readJson(path.join(contentDir, 'demo.json')) || {}
  const site = readJson(path.join(contentDir, 'site.json'))
  // 本地永远是中性模板；只有线上成品快照（或被显式强制时）才加载个人内容包
  if (!site || (!isPublished && !forceSite)) return { data: demo, source: 'demo' }
  const data = merge(demo, site)
  data.sections = fixSections(demo, site)
  return { data, source: 'site' }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// 内容隔离层：模板只认 virtual:site-content，不认任何具体站点数据
function siteContent() {
  const virtualId = 'virtual:site-content'
  const resolved = '\0' + virtualId
  return {
    name: 'site-content',
    configureServer(server) {
      server.watcher.add(contentDir)
      server.watcher.on('all', (_event, file) => {
        if (!path.resolve(file).startsWith(contentDir)) return
        const mod = server.moduleGraph.getModuleById(resolved)
        if (mod) server.moduleGraph.invalidateModule(mod)
        server.ws.send({ type: 'full-reload' })
      })
    },
    resolveId(id) {
      if (id === virtualId) return resolved
    },
    load(id) {
      if (id !== resolved) return
      const { data, source } = resolveContent()
      return `export const source = ${JSON.stringify(source)}\nexport default ${JSON.stringify(data)}`
    },
    transformIndexHtml(html) {
      const { data } = resolveContent()
      return html
        .replace('__SITE_TITLE__', escapeHtml(data.meta?.title || '3D 个人主页'))
        .replace('__SITE_DESCRIPTION__', escapeHtml(data.meta?.description || ''))
    },
  }
}

export default defineConfig({
  root: templatesDir,
  publicDir: path.join(root, 'public'),
  plugins: [react(), siteContent()],
  // GitHub Pages 项目站点部署在 /<repo>/ 下，用 VITE_BASE 注入；本地默认根目录
  base: process.env.VITE_BASE || '/',
  server: {
    host,
    port,
    allowedHosts: true,
  },
  preview: {
    host,
    port,
    allowedHosts: true,
  },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    outDir: path.join(root, 'dist'),
    emptyOutDir: true,
    // 三个模板各自独立入口：森林版 / 海洋版 / 小岛版；index 是选模板的首页
    rollupOptions: {
      input: {
        index: path.join(templatesDir, 'index.html'),
        forest: path.join(templatesDir, 'forest', 'index.html'),
        ocean: path.join(templatesDir, 'ocean', 'index.html'),
        island: path.join(templatesDir, 'island', 'index.html'),
      },
    },
  },
})
