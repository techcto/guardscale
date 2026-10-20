'use client';
import {useEffect,useRef,useState} from 'react';
import {logStreamSnapshot,pruneLogStream} from '../lib/log-stream-window';

// Entries are ordered by timestamp when they have one; privacy-safe feeds without timestamps keep arrival order.
type StreamEntry={id:string;at?:string};
const byNewest=(seq:Map<string,number>)=>(a:StreamEntry,b:StreamEntry)=>(a.at&&b.at?b.at.localeCompare(a.at):0)||(seq.get(b.id)??0)-(seq.get(a.id)??0)||b.id.localeCompare(a.id);

// Streams newly arrived entries one at a time instead of swapping the whole snapshot.
// The first snapshot is shown immediately; later arrivals are queued oldest-first and released
// evenly across the poll window, so the feed keeps moving. Pausing freezes the queue too.
export function useLogStream<T extends StreamEntry>(snapshot:T[],{paused,limit,pollMs}:{paused:boolean;limit:number;pollMs:number}){
 const [shown,setShown]=useState<T[]>([]),[fresh,setFresh]=useState<Set<string>>(new Set()),[queued,setQueued]=useState(0);
 const known=useRef(new Set<string>()),queue=useRef<T[]>([]),started=useRef(false),seq=useRef(new Map<string,number>()),counter=useRef(0);
 useEffect(()=>{
  if(paused)return;
  const bounded=logStreamSnapshot(snapshot,limit);
  if(!bounded.length&&!started.current)return;
  if(!started.current){started.current=true;for(const e of [...bounded].reverse())seq.current.set(e.id,++counter.current);const first=[...bounded].sort(byNewest(seq.current));for(const e of first)known.current.add(e.id);setShown(first);return}
  // Snapshots are newest-first, so reversing gives arrival order; timestamped entries are then sorted by time.
  const arrivals=bounded.filter(e=>!known.current.has(e.id)).reverse().sort((a,b)=>a.at&&b.at?a.at.localeCompare(b.at):0);for(const e of arrivals)seq.current.set(e.id,++counter.current);// numbered oldest first
  for(const e of arrivals)known.current.add(e.id);
  queue.current.push(...arrivals);
  // A large backlog (e.g. after a long pause) is shown at once except for the newest rows, so the stream never lags behind.
  if(queue.current.length>limit/3){const flush=queue.current.splice(0,Math.max(0,queue.current.length-Math.min(12,limit)));setShown(rows=>[...flush,...rows].sort(byNewest(seq.current)).slice(0,limit))}
  setQueued(queue.current.length);
 },[snapshot,limit,paused]);
 useEffect(()=>{
  // At most three bounded windows survive, regardless of how long the page is open.
  pruneLogStream(known.current,seq.current,new Set(),logStreamSnapshot(snapshot,limit),queue.current,shown);
  const retained=new Set(seq.current.keys());
  setFresh(s=>{const next=new Set([...s].filter(id=>retained.has(id)));return next.size===s.size?s:next});
 },[snapshot,shown,queued,limit]);
 useEffect(()=>{
  if(paused)return;
  const reduced=typeof window!=='undefined'&&window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let timer:ReturnType<typeof setTimeout>;
  const release=()=>{
   const next=queue.current.shift();
   if(next){setShown(rows=>[next,...rows.filter(r=>r.id!==next.id)].sort(byNewest(seq.current)).slice(0,limit));if(!reduced)setFresh(s=>new Set(s).add(next.id));setQueued(queue.current.length)}
   // Spread the queue evenly across the next poll window so the feed flows continuously instead of in bursts.
   timer=setTimeout(release,reduced&&queue.current.length?0:Math.min(1200,Math.max(80,pollMs/Math.max(1,queue.current.length))));
  };
  timer=setTimeout(release,0);return()=>clearTimeout(timer);
 },[paused,limit,pollMs]);
 const settled=(id:string)=>setFresh(s=>{if(!s.has(id))return s;const n=new Set(s);n.delete(id);return n});
 return {shown,fresh,queued,settled};
}
