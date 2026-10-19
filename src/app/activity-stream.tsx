'use client';
import Link from 'next/link';
import {useRef,useState} from 'react';
import {useLogStream} from './use-log-stream';
import {useFlipRows} from './use-flip-rows';
import StreamedText from './streamed-text';
import {useLiveFeed} from './use-live-feed';
type Entry={id:string;serverId:string;serverName:string;at:string;type:string;message:string};
const LIMIT=150,VISIBLE=14,PACE_MS=1000;
// A terminal-style tail: newest entry at the bottom, older entries glide up and fade out. No scrolling.
export default function ActivityStream(){
 const [paused,setPaused]=useState(false),{entries,error}=useLiveFeed<Entry>('/api/v1/activity',{paused,limit:LIMIT});
 const {shown,fresh,queued,settled}=useLogStream(entries,{paused,limit:LIMIT,pollMs:PACE_MS});
 const visible=shown.slice(0,VISIBLE).reverse(),viewport=useRef<HTMLDivElement>(null);useFlipRows(viewport,visible.map(e=>e.id).join());
 const state=paused?'Paused':error?'Reconnecting':queued?`Streaming · ${queued} arriving`:'Streaming live';
 return <section className="g-card mt-4"><div className="section-heading"><div><h2>Live organization activity</h2><p className="muted"><span className={`gs-stream-status${paused||error?' is-idle':''}`} role="status">{state}</span> · all servers in your active organization · newest at the bottom</p></div><button className="button" onClick={()=>setPaused(v=>!v)}>{paused?'Resume':'Pause'}</button></div>{error&&<p role="alert">Activity connection interrupted. Retrying automatically.</p>}<div className="gs-log-lines gs-log-tail" ref={viewport} data-testid="organization-log-stream" aria-live="off">{visible.length>0&&<div className="gs-log-track">{visible.map(e=>{const isNew=fresh.has(e.id);return <div className={`gs-log-line${isNew?' is-streaming':''}`} key={e.id} data-log-id={e.id}><time>{new Date(e.at).toLocaleTimeString()}</time><Link href={'/servers/'+encodeURIComponent(e.serverId)}>{e.serverName} · {e.type}</Link><code><StreamedText text={e.message} animate={isNew} onDone={()=>settled(e.id)}/></code></div>})}</div>}</div>{!shown.length&&<p className="muted">No activity received yet. <Link href="/servers">Connect a server →</Link></p>}<p className="small muted">Newest {VISIBLE} of the latest {LIMIT} retained entries across your servers. Pause to read; each server’s page keeps its full log. Agent redaction applies; no other organization’s logs are included.</p></section>
}
