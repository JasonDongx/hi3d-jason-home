import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowUpRight, ArrowLeft, X, Leaf, RotateCcw, Pause, Play, ExternalLink, RefreshCw, MousePointer2, AlertCircle } from 'lucide-react';
import { loadContent, parseRoute, entryHash, dateText, safeUrl } from './hi3d-content';
import { LeafMark, sections, sectionOrder } from './hi3d-ui';
import type { ContentSection, Entry, SiteContent } from './hi3d-types';
import './hi3d-scene-data';
import {useGlassHighlights} from './hi3d-glass';
const sceneModule=import('./hi3d-scene');
const IslandScene=lazy(()=>sceneModule);
const subscribe=(cb:()=>void)=>{window.addEventListener('hashchange',cb);return()=>window.removeEventListener('hashchange',cb);};
const getHash=()=>window.location.hash;

function About({content}:{content:SiteContent}){
  const {profile}=content;
  return <div className="about-content">
    <div className="profile-heading"><div className="profile-picture"><img src="./assets/hi3d-boy-reference.png" alt="代表站主的男孩"/></div><div><h2>{profile.name}</h2><p>{profile.tagline}</p></div></div>
    <div className="profile-bio">{profile.bio.map((text,i)=><p key={i}>{text}</p>)}</div>
    {profile.interests.length>0&&<div className="interest-tags">{profile.interests.map(t=><span key={t}>{t}</span>)}</div>}
    {profile.links.length>0&&<div className="profile-links">{profile.links.map(link=><a key={link.url} href={safeUrl(link.url)} target="_blank" rel="noopener noreferrer">{link.label}<ArrowUpRight size={14}/></a>)}</div>}
  </div>;
}

function EntryList({section,entries}:{section:ContentSection;entries:Entry[]}){
  const items=entries.filter(e=>e.section===section);
  const Icon=sections[section].icon;
  return <div className={`entry-list list-${section}`} aria-label="内容列表与摘要预览">
    {items.length===0?<div className="empty-state"><Leaf size={28}/><p>这里还没有内容。</p></div>:items.map(item=><a className={`entry-card entry-${section}`} href={entryHash(item)} key={item.id} data-entry-id={item.id}>
      {section!=='writing'&&<span className="entry-icon"><Icon size={22} strokeWidth={1.4}/></span>}
      <div className="entry-copy"><div className="entry-meta">{item.tag&&<span>{item.tag}</span>}{item.date&&<time dateTime={item.date}>{dateText(item.date)}</time>}</div><h3>{item.title}</h3><p>{item.summary}</p></div><ArrowUpRight className="entry-arrow" size={16}/>
    </a>)}
  </div>;
}

function EntryDetail({entry}:{entry:Entry}){
  return <article className="entry-detail"><div className="entry-meta">{entry.tag&&<span>{entry.tag}</span>}{entry.date&&<time dateTime={entry.date}>{dateText(entry.date)}</time>}</div><h1>{entry.title}</h1><p className="detail-summary">{entry.summary}</p><div className="prose">{entry.body.map((p,i)=><p key={i}>{p}</p>)}</div>{entry.url&&<a className="external-link" href={safeUrl(entry.url)} target="_blank" rel="noopener noreferrer">打开链接<ExternalLink size={14}/></a>}<div className="detail-end"><Leaf size={14}/><span>谢谢你来这里看看。</span></div></article>;
}

export default function App(){
  useGlassHighlights();
  const [content,setContent]=useState<SiteContent|null>(null);
  const [error,setError]=useState('');
  const [attempt,setAttempt]=useState(0);
  const [motion,setMotion]=useState(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [viewCommand,setViewCommand]=useState({action:'reset',serial:0});
  const [sceneStatus,setSceneStatus]=useState<'loading'|'ready'|'error'>('loading');
  const headingRef=useRef<HTMLHeadingElement>(null);
  const bodyRef=useRef<HTMLDivElement>(null);
  const hash=useSyncExternalStore(subscribe,getHash,()=> '');
  const {section,entryId}=parseRoute(hash);
  const entry=content?.entries.find(e=>e.section===section&&e.id===entryId);
  useEffect(()=>{const controller=new AbortController();setError('');loadContent(controller.signal).then(setContent).catch(e=>{if(e.name!=='AbortError')setError(e.message||'内容加载失败。');});return()=>controller.abort();},[attempt]);
  useEffect(()=>{if(!content)return;document.title=`${entry?.title||(section?content.navigation[section]:'个人主页')} · ${content.site.title}`;if(section)headingRef.current?.focus({preventScroll:true});bodyRef.current?.scrollTo({top:0});},[hash,content]);
  useEffect(()=>{function escape(e:KeyboardEvent){if(e.key==='Escape'&&section)window.location.hash=entryId?`#${section}`:'';}document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape);},[section,entryId]);
  if(error)return <main className="app-error"><LeafMark/><h1>暂时无法读取内容</h1><p>{error}</p><button onClick={()=>setAttempt(x=>x+1)}><RefreshCw size={15}/>重新加载</button></main>;
  if(!content)return <div className="app-loading"><LeafMark/><span>正在打开小岛…</span></div>;
  const labels=content.navigation;
  return <div className={`site-shell ${section?'panel-open':''}`}>
    <a className="skip-link" href="#writing">跳至写作列表</a>
    <header className="site-header"><a className="brand liquid-glass" href="#" aria-label="返回小岛首页"><LeafMark/><strong>{content.site.title}</strong></a><nav className="liquid-glass" aria-label="主导航">{sectionOrder.map(key=><a key={key} href={`#${key}`} aria-current={section===key?'page':undefined}>{labels[key]}</a>)}</nav></header>
    <main className="site-main">
      <div className="home-intro liquid-glass" aria-hidden={!!section}><span className="intro-eyebrow"><i aria-hidden="true"/>欢迎来到我的小岛</span><h1>你好，我是{content.profile.name}。</h1><p>{content.site.description}</p></div>
      <div className="scene-stage"><Suspense fallback={<div className="scene-loading"><span className="loader-ring"/>正在打开小岛…</div>}><IslandScene activeSection={section} labels={labels} motion={motion} viewCommand={viewCommand} onStatus={setSceneStatus}/></Suspense></div>
      <div className="scene-toolbar liquid-glass" aria-label="小岛视角控制"><span><MousePointer2 size={13}/>拖动环顾 · 滚轮缩放</span><i/><button aria-label="复位视角" title="复位视角" disabled={sceneStatus!=='ready'} onClick={()=>setViewCommand(v=>({action:'reset',serial:v.serial+1}))}><RotateCcw size={15}/></button><button className="ocean-toggle" aria-label={motion?'暂停海面动效':'继续海面动效'} aria-pressed={!motion} title={motion?'暂停海面动效':'继续海面动效'} disabled={sceneStatus!=='ready'} onClick={()=>setMotion(v=>!v)}>{motion?<Pause size={13}/>:<Play size={13}/>}<span>{motion?'海面动效':'海面已暂停'}</span></button></div>
      {section&&<aside className={`content-panel liquid-glass section-${section}`} aria-label={labels[section]}><header className="panel-header"><div>{entryId?<a className="back-link" href={`#${section}`}><ArrowLeft size={14}/>返回列表</a>:<span className="panel-eyebrow">{sections[section].en}</span>}<h2 ref={headingRef} tabIndex={-1}>{labels[section]}</h2></div><button className="close-panel" aria-label="关闭内容，返回小岛" title="返回小岛（Esc）" onClick={()=>{window.location.hash='';}}><X size={18}/></button></header><div ref={bodyRef} className="panel-body" key={`${section}/${entryId||''}`}>
        {section==='about'?<About content={content}/>:entryId?(entry?<EntryDetail entry={entry}/>:<div className="empty-state"><AlertCircle size={26}/><h3>这条内容暂时不在这里</h3><a href={`#${section}`}>返回列表<ArrowLeft size={14}/></a></div>):<EntryList section={section} entries={content.entries}/>}
      </div></aside>}
    </main>
  </div>;
}
