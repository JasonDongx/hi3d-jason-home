import type { SceneConfig } from './hi3d-types';

let pending:Promise<SceneConfig>|undefined;
export function loadSceneConfig(retry=false):Promise<SceneConfig>{
  if(retry)pending=undefined;
  if(!pending)pending=fetch('./hi3d-scene.json').then(async response=>{
    if(!response.ok)throw new Error('Scene config missing');
    const value:SceneConfig=await response.json();
    if(!value.islandUrl||!value.boyUrl||!value.anchors||!value.ocean?.coastMap)throw new Error('Invalid scene config');
    return value;
  }).catch(error=>{pending=undefined;throw error;});
  return pending;
}
// Small configuration and the scene module start alongside the content request.
void loadSceneConfig().catch(()=>{});
