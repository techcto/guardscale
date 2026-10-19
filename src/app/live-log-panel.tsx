'use client';
import {useRef,useState} from 'react';
import {useLogStream} from './use-log-stream';
import {useFlipRows} from './use-flip-rows';
import StreamedText from './streamed-text';
import {useLiveFeed} from './use-live-feed';
type Entry={id:string;method:string;status:number;durationMs:number};
const LIMIT=80,VISIBLE=30,PACE_MS=1000;
// Terminal-style tail behind the hero: newest request rises in at the bottom, older ones glide up and fade.
export default function LiveLogPanel(){
 const [paused,setPaused]=useState(false),{entries,error}=useLiveFeed<Entry>('/api/live-logs',{paused,limit:LIMIT});
 const {shown,fresh,queued,settled}=useLogStream(entries,{paused,limit:LIMIT,pollMs:PACE_MS});
 const visible=shown.slice(0,VISIBLE).reverse(),viewport=useRef<HTMLDivElement>(null);useFlipRows(viewport,visible.map(e=>e.id).join());
 return <div className="gs-hero-log-background">
  <div className="gs-hero-log-stream gs-hero-log-tail" ref={viewport} data-testid="public-log-stream" aria-label="Redacted access logs">{visible.map(e=>{const isNew=fresh.has(e.id);return <div className={`gs-hero-log-line${isNew?' is-streaming':''}`} key={e.id} data-log-id={e.id}><span>ACCESS</span><strong>{e.method}</strong><span><StreamedText text="[request redacted]" animate={isNew} onDone={()=>settled(e.id)}/></span><span className={e.status>=400?'gs-access-error':''}>{e.status}</span><span>{e.durationMs} ms</span></div>})}</div>
  <div className="gs-hero-log-controls" aria-label="Global access log stream"><div><strong>Live access logs</strong><span role="status" className={`gs-stream-status${paused||error||!entries.length?' is-idle':''}`}>{paused?'Paused':error?'Connection interrupted':queued?`Streaming · ${queued} arriving`:entries.length?'Streaming live · across organizations · real requests':'Waiting for real requests'}</span></div><button type="button" className="button gs-outline" aria-pressed={paused} onClick={()=>setPaused(p=>!p)}>{paused?'Resume logs':'Pause logs'}</button><p>Privacy-safe projection · newest request at the bottom, up to {LIMIT} recent requests. No addresses, paths, account names, server identifiers, or original timestamps. No simulated traffic.</p></div>
 </div>
}
