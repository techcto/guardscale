'use client';
import {useLayoutEffect,useRef} from 'react';

// Keep a visible row anchored rather than jumping when new rows are prepended.
export function useLogViewport(version:unknown){
 const viewport=useRef<HTMLDivElement>(null);
 const anchor=useRef<{id:string;offset:number;top:number}|null>(null);
 const capture=()=>{
  const el=viewport.current;if(!el)return;
  const edge=el.getBoundingClientRect().top;
  const row=[...el.querySelectorAll<HTMLElement>('[data-log-id]')].find(r=>r.getBoundingClientRect().bottom>edge+1);
  anchor.current={id:row?.dataset.logId??'',offset:row?row.getBoundingClientRect().top-edge:0,top:el.scrollTop};
 };
 useLayoutEffect(()=>{
  const el=viewport.current;if(!el)return;
  const previous=anchor.current;
  if(!previous||previous.top<=4)el.scrollTop=0;
  else{
   const row=[...el.querySelectorAll<HTMLElement>('[data-log-id]')].find(r=>r.dataset.logId===previous.id);
   if(row)el.scrollTop+=row.getBoundingClientRect().top-el.getBoundingClientRect().top-previous.offset;
   else el.scrollTop=previous.top; // The inspected row aged out of the bounded buffer.
  }
  capture();
 },[version]);
 return {viewport,capture};
}
