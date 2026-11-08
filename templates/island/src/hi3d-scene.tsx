import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls, useGLTF, useTexture } from '@react-three/drei';
import { Box3, Group, Mesh, OrthographicCamera, Vector3, ACESFilmicToneMapping, SRGBColorSpace } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { sectionOrder, sections } from './hi3d-ui';
import type { SceneConfig, Section } from './hi3d-types';
import Ocean from './hi3d-ocean';
import { loadSceneConfig } from './hi3d-scene-data';

// Start both GLBs together. Meshopt's decoder (including WASM) is bundled by Vite.
void loadSceneConfig().then(config=>{
  useGLTF.preload([config.islandUrl,config.boyUrl],false,true);
  useTexture.preload(config.ocean.coastMap);
}).catch(()=>{});

type Status = 'loading'|'ready'|'error';
type Props = { activeSection: Section|null; labels:Record<Section,string>; motion: boolean; viewCommand: {action:string;serial:number}; onStatus: (s:Status)=>void };
type BoundaryProps = { children:ReactNode; onError:()=>void; onRetry:()=>void };
class SceneBoundary extends Component<BoundaryProps,{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(){this.props.onError();}
  render(){return this.state.failed?<SceneFallback onRetry={this.props.onRetry}/>:this.props.children;}
}
function SceneFallback({onRetry}:{onRetry:()=>void}) {
  return <div className="scene-fallback"><img src="./assets/hi3d-island-reference.png" alt="森林小岛预览图"/><div className="scene-error-notice liquid-glass" role="status"><AlertCircle size={18}/><span><b>3D 场景暂时未能载入</b><small>仍可通过导航浏览全部文字。</small></span><button onClick={onRetry}><RefreshCw size={14}/>重试</button></div></div>;
}
function normalizeModel(source:Group, dimension:number, axis:'x'|'y', rotation:[number,number,number]) {
  const scene=source.clone(true);
  scene.rotation.set(...rotation);
  scene.updateMatrixWorld(true);
  const bounds=new Box3().setFromObject(scene);
  const center=bounds.getCenter(new Vector3());
  const size=bounds.getSize(new Vector3());
  const factor=dimension/size[axis];
  const root=new Group();root.add(scene);root.scale.setScalar(factor);
  root.position.set(-center.x*factor,-bounds.min.y*factor,-center.z*factor);
  root.traverse(obj=>{if(obj instanceof Mesh){obj.castShadow=false;obj.receiveShadow=false;}});
  root.updateMatrixWorld(true);
  return root;
}
function CameraControls({command,panelOpen}:{command:Props['viewCommand'];panelOpen:boolean}) {
  const { camera,size,invalidate }=useThree();
  const controls=useRef<OrbitControlsImpl>(null);
  const zoomMultiplier=useRef(1);
  const baseZoom=Math.min(size.width*.92/14.4,(size.height-104)/9.8);
  const offset=useRef(-size.width*.04);
  const desiredOffset=panelOpen?(size.width>=1700?240:215):-size.width*.04;
  useEffect(()=>{invalidate();},[desiredOffset,invalidate]);
  useFrame((_,delta)=>{
    if(!(camera instanceof OrthographicCamera))return;
    const difference=desiredOffset-offset.current;
    if(Math.abs(difference)<.15&&camera.view?.fullWidth===size.width&&camera.view?.fullHeight===size.height&&camera.view?.offsetX===desiredOffset)return;
    offset.current=Math.abs(difference)<.15?desiredOffset:offset.current+difference*(1-Math.exp(-8*Math.min(delta,.06)));
    camera.setViewOffset(size.width,size.height,offset.current,-16,size.width,size.height);
    if(Math.abs(difference)>=.15)invalidate();
  });
  function updateZoom(){camera.zoom=baseZoom*zoomMultiplier.current;camera.updateProjectionMatrix();invalidate();}
  useEffect(()=>{updateZoom();},[baseZoom]);
  useEffect(()=>{
    if(command.action==='in')zoomMultiplier.current=Math.min(1.6,zoomMultiplier.current*1.15);
    if(command.action==='out')zoomMultiplier.current=Math.max(.7,zoomMultiplier.current/1.15);
    if(command.action==='reset'){zoomMultiplier.current=1;camera.position.set(9,10,15);controls.current?.target.set(0,2,0);}
    updateZoom();controls.current?.update();
  },[command.serial]);
  return <OrbitControls ref={controls} makeDefault target={[0,2,0]} enablePan={false} enableZoom minZoom={baseZoom*.75} maxZoom={baseZoom*1.4} zoomSpeed={.55} enableDamping dampingFactor={.08} minPolarAngle={.55} maxPolarAngle={1.22} minAzimuthAngle={-.5} maxAzimuthAngle={1.3} rotateSpeed={.45}/>;
}
function Visibility({motion}:{motion:boolean}) {
  const {setFrameloop,invalidate}=useThree();
  useEffect(()=>{
    let frame=0,last=0;
    setFrameloop('demand');
    function tick(now:number){
      if(now-last>=1000/30-1){last=now;invalidate();}
      frame=requestAnimationFrame(tick);
    }
    function update(){cancelAnimationFrame(frame);last=0;if(motion&&!document.hidden)frame=requestAnimationFrame(tick);invalidate();}
    update();document.addEventListener('visibilitychange',update);
    return()=>{cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',update);};
  },[motion,setFrameloop,invalidate]);
  return null;
}
function World({ config,activeSection,labels,motion,onReady }: {config:SceneConfig;activeSection:Section|null;labels:Record<Section,string>;motion:boolean;onReady:()=>void}) {
  const [islandGltf,boyGltf]=useGLTF([config.islandUrl,config.boyUrl],false,true);
  const island=useMemo(()=>normalizeModel(islandGltf.scene,config.islandWidth,'x',config.islandRotation),[islandGltf.scene,config]);
  const boy=useMemo(()=>normalizeModel(boyGltf.scene,config.boyHeight,'y',config.boyRotation),[boyGltf.scene,config]);
  const position=useMemo(()=>[config.boyPosition[0],config.boyGroundY??config.boyPosition[1],config.boyPosition[2]] as [number,number,number],[config]);
  const ready=useRef(false);
  useFrame(()=>{if(!ready.current){ready.current=true;onReady();}});
  return <>
    <primitive object={island} dispose={null}/>
    <group position={position}><primitive object={boy} dispose={null}/><Html center position={[0,config.boyHeight*.6,0]} zIndexRange={[19,18]}><button className="avatar-hit-target" aria-label="认识小岛主人" onClick={()=>{window.location.hash='#about';}}><span className="avatar-greeting liquid-glass">嗨，欢迎！</span></button></Html></group>
    <Ocean config={config.ocean} motion={motion}/>
    {sectionOrder.map(key=>{const Icon=sections[key].icon;return <Html key={key} position={config.anchors[key]} center zIndexRange={[25,20]}><button className={`map-marker liquid-glass marker-${key} ${activeSection===key?'active':''}`} onClick={()=>{window.location.hash=`#${key}`;}} aria-label={`进入${labels[key]}`}><span className="marker-icon"><Icon size={15} strokeWidth={1.7}/></span><span>{labels[key]}</span><span className="marker-plus">↗</span><i/></button></Html>;})}
  </>;
}
export default function IslandScene(props:Props) {
  const [config,setConfig]=useState<SceneConfig|null>(null);
  const [attempt,setAttempt]=useState(0);
  const [failed,setFailed]=useState(false);
  const [ready,setReady]=useState(false);
  useEffect(()=>{
    let current=true;setConfig(null);setFailed(false);setReady(false);props.onStatus('loading');
    loadSceneConfig(attempt>0).then(value=>{if(current)setConfig(value);}).catch(()=>{if(current){setFailed(true);props.onStatus('error');}});
    return()=>{current=false;};
  },[attempt]);
  function retry(){if(config){useGLTF.clear([config.islandUrl,config.boyUrl]);useTexture.clear(config.ocean.coastMap);}setAttempt(a=>a+1);}
  if(failed)return <SceneFallback onRetry={retry}/>;
  return <div className="island-canvas" data-scene-state={ready?'ready':'loading'}>
    {!ready&&<div className="scene-loading"><span className="loader-ring"/>正在载入森林与男孩…<small>可以先从顶部导航阅读内容</small></div>}
    {config&&<SceneBoundary key={attempt} onError={()=>{setFailed(true);setReady(false);props.onStatus('error');}} onRetry={retry}><Canvas frameloop="demand" orthographic camera={{position:[9,10,15],zoom:55,near:.1,far:140}} dpr={[1,1.5]} gl={{antialias:true,alpha:false,powerPreference:'high-performance',toneMapping:ACESFilmicToneMapping,outputColorSpace:SRGBColorSpace}} onCreated={({gl})=>{gl.setClearColor('#5baeb6',1);gl.toneMappingExposure=1.12;}}>
      <ambientLight intensity={1.2}/><hemisphereLight color="#fff6df" groundColor="#879273" intensity={1.6}/><directionalLight position={[-5,10,8]} intensity={2.1} color="#fff0d5"/><directionalLight position={[5,3,-5]} intensity={.5} color="#e2ecd8"/>
      <Suspense fallback={null}><World config={config} activeSection={props.activeSection} labels={props.labels} motion={props.motion} onReady={()=>{setReady(true);props.onStatus('ready');}}/></Suspense>
      <CameraControls command={props.viewCommand} panelOpen={!!props.activeSection}/><Visibility motion={props.motion}/>
    </Canvas></SceneBoundary>}
  </div>;
}
