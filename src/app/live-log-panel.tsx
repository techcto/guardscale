'use client';
import {useEffect,useState} from 'react';
import {useLogViewport} from './use-log-viewport';
type Entry={id:string;method:string;status:number;durationMs:number};
export default function LiveLogPanel(){
 const [entries,setEntries]=useState<Entry[]>([]),[error,setError]=useState(false),[paused,setPaused]=useState(false);
 const {viewport,capture}=useLogViewport(entries);
 useEffect(()=>{if(paused)return;const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;async function poll(){try{const r=await fetch('/api/live-logs',{cache:'no-store',signal:controller.signal});if(!r.ok)throw Error();const feed=await r.json();if(!controller.signal.aborted){setEntries(feed.entries);setError(false)}}catch{if(!controller.signal.aborted)setError(true)}finally{if(!controller.signal.aborted)timer=setTimeout(poll,2000)}}void poll();return()=>{controller.abort();clearTimeout(timer)}},[paused]);
 return <div className="gs-hero-log-background">
  <div className="gs-hero-log-stream" ref={viewport} onScroll={capture} data-testid="public-log-stream" aria-label="Redacted access logs" tabIndex={0} style={{overflowY:'auto',pointerEvents:'auto',overflowAnchor:'none'}}>{entries.slice(0,80).map(e=><div className="gs-hero-log-line" key={e.id} data-log-id={e.id}><span>ACCESS</span><strong>{e.method}</strong><span>[request redacted]</span><span className={e.status>=400?'gs-access-error':''}>{e.status}</span><span>{e.durationMs} ms</span></div>)}</div>
  <div className="gs-hero-log-controls" aria-label="Global access log stream"><div><strong>Live access logs</strong><span role="status">{paused?'Paused':error?'Connection interrupted':entries.length?'Across organizations · real requests':'Waiting for real requests'}</span></div><button type="button" className="button gs-outline" aria-pressed={paused} onClick={()=>setPaused(p=>!p)}>{paused?'Resume logs':'Pause logs'}</button><p>Privacy-safe projection · up to 80 recent requests. No addresses, paths, account names, server identifiers, or original timestamps. No simulated traffic.</p></div>
 </div>
}
