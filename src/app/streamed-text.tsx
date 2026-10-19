'use client';
import {useEffect,useRef,useState} from 'react';

// Types a message out like streamed tokens. The untyped remainder stays in the layout (invisible),
// so the row has its final height from the first frame and anchored scrolling never shifts.
export default function StreamedText({text,animate,onDone}:{text:string;animate:boolean;onDone?:()=>void}){
 const [n,setN]=useState(animate?0:text.length),done=useRef(onDone);
 useEffect(()=>{done.current=onDone},[onDone]);
 useEffect(()=>{
  if(!animate)return;
  let frame=0;const start=performance.now(),duration=Math.min(900,Math.max(240,text.length*14));
  const step=(now:number)=>{const next=Math.min(text.length,Math.ceil((now-start)/duration*text.length));setN(next);if(next<text.length)frame=requestAnimationFrame(step);else done.current?.()};
  frame=requestAnimationFrame(step);return()=>cancelAnimationFrame(frame);
 },[text,animate]);
 if(!animate||n>=text.length)return <>{text}</>;
 return <><span>{text.slice(0,n)}</span><span className="gs-stream-caret" aria-hidden="true"/><span className="gs-stream-pending" aria-hidden="true">{text.slice(n)}</span></>;
}
