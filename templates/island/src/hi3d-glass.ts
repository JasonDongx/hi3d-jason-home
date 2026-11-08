import {useEffect} from 'react';

/** One delegated listener, active only while the pointer moves; no idle render loop. */
export function useGlassHighlights(){
  useEffect(()=>{
    const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
    let current:HTMLElement|null=null,frame=0,x=0,y=0;
    function clear(){
      cancelAnimationFrame(frame);frame=0;
      current?.style.removeProperty('--glass-x');current?.style.removeProperty('--glass-y');
      current=null;
    }
    function move(event:PointerEvent){
      if(preference.matches||document.hidden||event.pointerType==='touch')return;
      const target=event.target instanceof Element?event.target.closest<HTMLElement>('.liquid-glass'):null;
      if(target!==current){clear();current=target;}
      if(!current)return;
      x=event.clientX;y=event.clientY;
      if(!frame)frame=requestAnimationFrame(()=>{
        frame=0;if(!current)return;
        const bounds=current.getBoundingClientRect();
        current.style.setProperty('--glass-x',`${((x-bounds.left)/bounds.width*100).toFixed(1)}%`);
        current.style.setProperty('--glass-y',`${((y-bounds.top)/bounds.height*100).toFixed(1)}%`);
      });
    }
    function leave(event:PointerEvent){if(!event.relatedTarget)clear();}
    function visible(){if(document.hidden)clear();}
    window.addEventListener('pointermove',move,{passive:true});
    window.addEventListener('pointerout',leave,{passive:true});
    window.addEventListener('blur',clear);
    document.addEventListener('visibilitychange',visible);
    preference.addEventListener('change',clear);
    return()=>{clear();window.removeEventListener('pointermove',move);window.removeEventListener('pointerout',leave);window.removeEventListener('blur',clear);document.removeEventListener('visibilitychange',visible);preference.removeEventListener('change',clear);};
  },[]);
}
