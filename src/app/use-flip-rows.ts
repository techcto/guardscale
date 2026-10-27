'use client';
import {useLayoutEffect,useRef,type RefObject} from 'react';

// Continuous motion for a bottom-anchored log tail: when a row is appended at the bottom, every
// visible row glides from where it currently is (including any motion still in progress) to its new
// place, and the new row rises in from below (or drops in from above for a newest-first list).
// Positions are visual, so rapid arrivals never snap.
export function useFlipRows(viewport:RefObject<HTMLDivElement|null>,version:unknown,{duration=420,enterFrom='below'}:{duration?:number;enterFrom?:'below'|'above'}={}){
 const last=useRef(new Map<string,number>());
 useLayoutEffect(()=>{
  const el=viewport.current;if(!el)return;
  const rows=[...el.querySelectorAll<HTMLElement>('[data-log-id]')];
  const edge=el.getBoundingClientRect().top;
  // Where each row is drawn right now = its last resting place + whatever translate is still running.
  const drawn=new Map<string,number>();
  for(const row of rows){const id=row.dataset.logId??'',rest=last.current.get(id);if(rest===undefined)continue;const m=getComputedStyle(row).transform,ty=m&&m!=='none'?new DOMMatrixReadOnly(m).m42:0;drawn.set(id,rest+ty)}
  for(const row of rows)for(const a of row.getAnimations())a.cancel();
  const resting=new Map(rows.map(r=>[r.dataset.logId??'',r.getBoundingClientRect().top-edge]));
  const first=!last.current.size;last.current=resting;
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if(first||reduced||typeof rows[0]?.animate!=='function')return;
  const easing='cubic-bezier(.22,.8,.24,1)';
  for(const row of rows){
   const id=row.dataset.logId??'',now=resting.get(id)!,before=drawn.get(id);
   if(before===undefined)row.animate([{transform:`translateY(${enterFrom==='above'?-row.offsetHeight:row.offsetHeight}px)`,opacity:0},{transform:'none',opacity:1}],{duration,easing});
   else if(Math.abs(before-now)>.5)row.animate([{transform:`translateY(${before-now}px)`},{transform:'none'}],{duration,easing});
  }
 },[viewport,version,duration,enterFrom]);
}
