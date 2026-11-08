// 内容入口：只做转发，模板本身不含任何具体站点内容。
//
// 数据来源（由 vite.config.js 的 virtual:site-content 决定）：
//   templates/forest/content/demo.json  中性示例，仓库默认；本地 dev 固定使用
//   templates/forest/content/site.json  个人内容包，被 .gitignore 排除；线上成品模式使用
//
// 成品模式下，全量文章正文放在 public/forest/content/library.json，浏览器按需 fetch，
// 不进 JS bundle，首屏只加载几 KB 的元数据。
import content, { source } from 'virtual:site-content'

export { source }
export const profile = content.profile || {}
export const sections = content.sections || []
export const about = content.about || { paragraphs: [], links: [] }
export const demoPosts = content.contentBySection || {}
export const stats = content.stats || null

let pending = null

export function loadLibrary() {
  if (!content.library) return Promise.resolve(null)
  if (!pending) {
    pending = fetch(`${import.meta.env.BASE_URL || '/'}forest/content/library.json`)
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null)
  }
  return pending
}
