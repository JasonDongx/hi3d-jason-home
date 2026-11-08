// 海洋版资产表：全部放在 public/ocean 下，与森林版（public/forest）完全隔离。
// 站点根为 templates/，BASE_URL 为 '/'，拼出来是 /ocean/...
const BASE = `${import.meta.env.BASE_URL || '/'}ocean/`

export const MODELS = {
  sign: `${BASE}models/sign.glb`,
  diver: `${BASE}models/diver.glb`,
  coral: `${BASE}models/coral.glb`,
  tube: `${BASE}models/tube.glb`,
  rock: `${BASE}models/rock.glb`,
  anchor: `${BASE}models/anchor.glb`,
  chest: `${BASE}models/chest.glb`,
  orca: `${BASE}models/orca.glb`,
  beluga: `${BASE}models/beluga.glb`,
}

export const IMAGES = {
  fishSilver: `${BASE}assets/fish-silver.png`,
  fishYellow: `${BASE}assets/fish-yellow.png`,
  fishOrange: `${BASE}assets/fish-orange.png`,
  kelp: `${BASE}assets/kelp.png`,
  seagrass: `${BASE}assets/seagrass.png`,
  fan: `${BASE}assets/fan.png`,
  shark: `${BASE}assets/shark.png`,
  dolphin: `${BASE}assets/dolphin.png`,
}

export const TEX = {
  caustics: `${BASE}tex/caustics.png`,
}
