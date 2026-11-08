// 3D 资产接入点：文件名由内容包提供。
//
// 通用森林植被放在 public/forest/models/forest/，由 content/demo.json 声明，随模板仓库提交；
// 个人手办等资产放 public/forest/models/ 下，在 content/owner.json 的 assets 里追加，
// 与 content/site.json 一样被 .gitignore 排除。
// 任何 slot 为空时，场景自动回退到程序化几何。
import content from 'virtual:site-content'

const SLOTS = {
  companion: '',
  runner: '',
  sign: '',
  fir: '',
  spruce: '',
  oak: '',
  rock: '',
  shrub: '',
  deadwood: '',
  stump: '',
}

export const MODEL_MAP = { ...SLOTS, ...(content.assets || {}) }

const BASE = `${import.meta.env.BASE_URL || '/'}forest/models/`

export function modelUrl(key) {
  const file = MODEL_MAP[key]
  return file ? `${BASE}${file}` : ''
}
