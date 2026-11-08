#!/usr/bin/env node
// 把 guodong-home 的整站内容搬成本地内容包（不进 git）。
//
//   pnpm content:sync                                   # 全量：所有文章 + 全文 + 图片
//   pnpm content:sync --source D:/Code/guodong-home     # 指定内容源
//   pnpm content:sync --limit 5                        # 只取每栏最近 5 篇（调试用）
//   pnpm content:reset                                 # 清掉成品内容，回到中性模板
//
// 产物：
//   templates/forest/content/site.json         身份 / 栏目 / 文案 / 资产（轻量，vite 虚拟模块读取）
//   public/forest/content/library.json         全量文章正文（大，浏览器按需 fetch）
//   public/forest/content/images/**            正文中引用到的博客图片
//
// 模板仓库只提交 templates/forest/content/demo.json；以上三个产物都被 .gitignore 排除。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const contentDir = path.join(root, 'templates', 'forest', 'content')
const siteFile = path.join(contentDir, 'site.json')
const outDir = path.join(root, 'public', 'forest', 'content')
const imageOutDir = path.join(outDir, 'images')

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const source = path.resolve(arg('--source', path.join(root, '..', 'guodong-home')))
const ownerFile = path.resolve(arg('--owner', path.join(contentDir, 'owner.json')))
// 0 = 不限制，全量搬运
const limit = Math.max(0, Number(arg('--limit', '0')) || 0)

if (process.argv.includes('--reset')) {
  if (fs.existsSync(siteFile)) fs.unlinkSync(siteFile)
  fs.rmSync(outDir, { recursive: true, force: true })
  console.log('已移除 templates/forest/content/site.json 与 public/forest/content/，回到中性示例模式。')
  process.exit(0)
}

if (!fs.existsSync(source)) {
  console.error(`内容源不存在: ${source}`)
  console.error('用 --source <guodong-home 路径> 指定。')
  process.exit(1)
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

const demo = readJson(path.join(contentDir, 'demo.json')) || {}
let owner = readJson(ownerFile)
let ownerNote = `身份信息: ${path.relative(root, ownerFile)}`
if (!owner) {
  owner = readJson(path.join(contentDir, 'owner.example.json')) || {}
  ownerNote = '身份信息: owner.example.json（中性）— 复制为 content/owner.json 可换成你自己的'
}

// ── 解析工具 ──────────────────────────────────────────────────────────

// guodong-home 的 frontmatter 是简单 YAML 子集：标量 + ["a","b"] / [a, b] 数组
function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text)
  if (!match) return { data: {}, body: text }
  const data = {}
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line)
    if (!kv) continue
    const value = kv[2].trim()
    if (value.startsWith('[') && value.endsWith(']')) {
      try {
        data[kv[1]] = JSON.parse(value.replace(/'/g, '"'))
      } catch {
        data[kv[1]] = value
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean)
      }
    } else {
      data[kv[1]] = value.replace(/^["']|["']$/g, '')
    }
  }
  return { data, body: text.slice(match[0].length) }
}

function stripHtml(text) {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .trim()
}

function plainText(text, isHtml = false) {
  const raw = isHtml ? stripHtml(text) : text
  return raw
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/^\s{0,3}[>*+\-]\s+/gm, '')
    .replace(/\|/g, ' ')
    .replace(/\*\*|__|`|\*|_/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeDate(value, filename) {
  const raw = String(value || '').slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const fromName = /\d{4}-\d{2}-\d{2}/.exec(filename || '')
  return fromName ? fromName[0] : '1970-01-01'
}

function readingMinutes(text) {
  return Math.max(1, Math.round(plainText(text).length / 320))
}

const copiedImages = new Set()

// 把 /images/... 的引用改成 ./content/images/...，并只复制真正被引用的图片
function carryImages(text) {
  return text.replace(/(src=["']|!\[[^\]]*\]\(\s*)(\/images\/[^)"'\s]+)/g, (whole, prefix, url) => {
    const encoded = url.replace(/^\//, '')
    const rel = decodeURIComponent(encoded)
    const from = path.join(source, 'public', rel)
    if (!fs.existsSync(from)) return ''
    const to = path.join(imageOutDir, rel.replace(/^images\//, ''))
    if (!copiedImages.has(to)) {
      fs.mkdirSync(path.dirname(to), { recursive: true })
      fs.copyFileSync(from, to)
      copiedImages.add(to)
    }
    return `${prefix}./content/${encoded}`
  })
}

// Astro 页面 → markdown：只保留可见文本与链接，丢掉脚本、样式和模板表达式
const ASTRO_CONST = {
  SITE_TITLE: 'JASONDONGX',
  SITE_DESCRIPTION: '前端开发，现居上海。写读书笔记、投资观察与行走记录。',
  SITE_CITY: '上海',
  SITE_TAGLINE: '读书 · 投资 · 行走',
  SITE_AUTHOR: 'JASONDONGX',
}

function astroToMarkdown(file) {
  if (!fs.existsSync(file)) return ''
  let text = fs.readFileSync(file, 'utf8')
  text = text.replace(/^---[\s\S]*?---\s*/, '')
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '')
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '')
  const tidy = (s) => stripHtml(s).replace(/\s+/g, ' ').trim()
  // 先展开站点常量表达式，再丢掉其余 Astro 模板表达式
  text = text.replace(/\{\s*(SITE_TITLE|SITE_DESCRIPTION|SITE_CITY|SITE_TAGLINE|SITE_AUTHOR)\s*\}/g, (_m, key) => ASTRO_CONST[key] || '')
  text = text.replace(/\{[^{}]*\}/g, '')
  text = text.replace(/\b(SITE_TITLE|SITE_DESCRIPTION|SITE_CITY|SITE_TAGLINE|SITE_AUTHOR)\b/g, (m) => ASTRO_CONST[m] || m)
  text = text.replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) => `[${tidy(label)}](${href})`)
  text = text.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, level, inner) => `\n\n${'#'.repeat(Number(level))} ${tidy(inner)}\n\n`)
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, inner) => `\n- ${tidy(inner)}`)
  text = text.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_m, inner) => `\n\n${tidy(inner)}\n\n`)
  text = text.replace(/<br\s*\/?>/gi, '\n')
  text = text.replace(/<[^>]+>/g, ' ')
  text = text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  return text
    .split(/\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => line && !/^[|>#\s]*$/.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function makePost({ id, title, date, tags, body, format = 'markdown', sourceLabel, sourceUrl, variant, extra = {} }) {
  const carried = carryImages(body)
  const text = plainText(carried, format === 'html')
  const post = {
    id: id || title,
    title,
    date,
    tags: Array.isArray(tags) ? tags : [],
    excerpt: text.length > 110 ? `${text.slice(0, 110)}…` : text,
    format,
    body: carried,
    minutes: readingMinutes(carried),
    ...extra,
  }
  if (variant) post.variant = variant
  if (sourceLabel) post.source = sourceLabel
  if (sourceUrl) post.sourceUrl = sourceUrl
  return post
}

function readMarkdownCollection(dir) {
  if (!fs.existsSync(dir)) {
    console.warn(`跳过（目录不存在）: ${dir}`)
    return []
  }
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const { data, body } = parseFrontmatter(fs.readFileSync(path.join(dir, f), 'utf8'))
      const variantMatch = /-(deepseek|kimi|gpt|gemini)\.md$/i.exec(f)
      return makePost({
        id: data.slug || f.replace(/\.md$/, ''),
        title: data.title || f.replace(/\.md$/, ''),
        date: normalizeDate(data.pubDate || data.date, f),
        tags: data.tags,
        body,
        variant: variantMatch ? variantMatch[1].toLowerCase() : undefined,
      })
    })
    .sort((a, b) => b.date.localeCompare(a.date) || (a.variant ? 1 : 0) - (b.variant ? 1 : 0))
}

// ── 全量读取 guodong-home ─────────────────────────────────────────────

fs.rmSync(imageOutDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })

const writing = readMarkdownCollection(path.join(source, 'src/content/blog'))
const daily = readMarkdownCollection(path.join(source, 'src/content/daily'))

let reading = []
const readingIndex = path.join(source, 'src/content/reading/articles.json')
const articles = readJson(readingIndex)
if (Array.isArray(articles)) {
  reading = articles
    .map((item) => {
      let body = ''
      if (item.body) {
        const bodyFile = path.join(source, 'src/content/reading', item.body)
        if (fs.existsSync(bodyFile)) body = fs.readFileSync(bodyFile, 'utf8')
      }
      if (!body) body = `<p>${item.title || ''}</p>`
      const notes = [
        item.originalTitle ? `原文标题：${item.originalTitle}` : '',
        item.author ? `作者：${item.author}` : '',
        item.license ? `授权：${item.license}` : '',
      ]
        .filter(Boolean)
        .join(' · ')
      return makePost({
        id: item.id,
        title: item.title,
        date: normalizeDate(item.published || item.added, ''),
        tags: item.tags,
        body: notes ? `<p class="source-note">${notes}</p>\n${body}` : body,
        format: 'html',
        sourceLabel: item.source,
        sourceUrl: item.sourceUrl,
        extra: { originalTitle: item.originalTitle, author: item.author, kind: item.kind },
      })
    })
    .sort((a, b) => b.date.localeCompare(a.date))
} else {
  console.warn(`跳过 reading（未找到 ${readingIndex}）`)
}

// 关于页全文 + 首页一句话介绍，也算「网页内容」一起搬过来
const aboutMarkdown = astroToMarkdown(path.join(source, 'src/pages/about.astro'))
const aboutPost = aboutMarkdown
  ? makePost({
      id: 'about-page',
      title: '关于我 · 整页',
      date: '2026-11-08',
      tags: ['关于', '站点'],
      body: aboutMarkdown,
      format: 'markdown',
    })
  : null

const heroMatch = /hero-lede[^>]*>([\s\S]*?)<\/p>/.exec(
  fs.readFileSync(path.join(source, 'src/pages/index.astro'), 'utf8'),
)
const heroLede = heroMatch ? stripHtml(heroMatch[1]) : ''

// 站外页面（作品栏）：地址写在 content/owner.json 的 outsidePages 里，
// 该文件被 .gitignore 排除，模板仓库本身不含任何个人站内地址。
// 若站点有 noindex 的隐藏路由，务必只放在 owner.json，不要写进本文件。
const outsidePages = Array.isArray(owner.outsidePages) ? owner.outsidePages : []

// ── 内容源 → 通用栏目 ────────────────────────────────────────────────
// 模板的四个入口是通用主题（写作 / 作品 / 日志 / 关于），跟 Jason 自己的
// 内容分类解耦：blog + 带出处的译文都是「写下来的」，daily 归「日志」，
// 自己做的小站归「作品」，关于页整页归「关于」。换内容源时只改这里。
const writingAll = [...writing, ...reading.map((post) => ({ ...post, variant: post.variant || '译文' }))].sort(
  (a, b) => b.date.localeCompare(a.date),
)
const works = outsidePages.map((page, i) =>
  makePost({
    id: `work-${i}`,
    title: page.title,
    date: '2026-11-08',
    tags: ['作品', '外链'],
    body: `${page.desc}\n\n[打开 ${page.title} ↗](${page.url})`,
    format: 'markdown',
    sourceLabel: '原站页面',
    sourceUrl: page.url,
  }),
)

const cap = (list) => (limit > 0 ? list.slice(0, limit) : list)
const sections = {
  writing: cap(writingAll),
  works: cap(works),
  journal: cap(daily),
  about: aboutPost ? [aboutPost] : [],
}

const library = {
  generatedAt: new Date().toISOString(),
  sourceRepo: 'guodong-home',
  stats: {
    writing: sections.writing.length,
    works: sections.works.length,
    journal: sections.journal.length,
    about: sections.about.length,
    total: Object.values(sections).reduce((n, list) => n + list.length, 0),
    images: copiedImages.size,
  },
  sections,
  outsidePages,
}
fs.writeFileSync(path.join(outDir, 'library.json'), `${JSON.stringify(library, null, 2)}\n`, 'utf8')

// ── 轻量元数据 ────────────────────────────────────────────────────────

const merged = { ...demo, ...owner }
for (const key of ['meta', 'profile', 'about', 'assets']) {
  merged[key] = { ...(demo[key] || {}), ...(owner[key] || {}) }
}
merged.sections = Array.isArray(owner.sections) ? owner.sections : demo.sections
// demo 里是中性示例文案，成品模式无条件拿真实首页介绍覆盖
if (heroLede) merged.profile.lede = heroLede
merged.library = true
merged.stats = library.stats
delete merged.contentBySection

fs.mkdirSync(contentDir, { recursive: true })
fs.writeFileSync(siteFile, `${JSON.stringify(merged, null, 2)}\n`, 'utf8')

console.log('内容包已生成:', path.relative(root, siteFile))
console.log('内容源:', source)
console.log(ownerNote)
console.log(
  '全量文章:',
  `写作 ${library.stats.writing} / 作品 ${library.stats.works} / 日志 ${library.stats.journal} / 关于 ${library.stats.about}`,
  `= ${library.stats.total} 篇${limit ? `（每栏上限 ${limit}）` : '（不限）'}`,
)
console.log('随正文复制的图片:', library.stats.images, '张 → public/forest/content/images/')
console.log('首页介绍:', heroLede || '（未找到）')
for (const [key, value] of Object.entries(merged.assets || {})) {
  if (value && !fs.existsSync(path.join(root, 'public', 'forest', 'models', value))) {
    console.warn(`⚠ assets.${key} = ${value} 不存在于 public/forest/models/，该项会回退到程序化几何`)
  }
}
console.log('刷新页面即可生效；回到中性示例执行 pnpm content:reset')
