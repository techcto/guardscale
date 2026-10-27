'use client';
import AddNode from '../add-node';
import IncidentGroups from '../../incidents/incident-groups';
import ServerSites from './server-sites';
import ServerWebsites from './server-websites';
import {serverDisplayName} from '@/lib/server-sites';
import HostVitals from './host-vitals';
import ServerIdentityEditor from './server-identity-editor';
import{useEffect,useState}from'react';import {useLogViewport} from '../../use-log-viewport';import Link from'next/link';import {useRouter} from'next/navigation';import type{GuardScaleEvent,IncidentRecord,Node}from'@/lib/model';

type Detail={node:Node;events:GuardScaleEvent[];incidents:IncidentRecord[];canManage?:boolean};

export default function NodeDetailConsole({serverId,localFixture=false}:{serverId:string;localFixture?:boolean}){
  const router=useRouter();
  const[paused,setPaused]=useState(false);
  const[logEvents,setLogEvents]=useState<GuardScaleEvent[]>([]);
  const[logFilter,setLogFilter]=useState(''),[requestsOnly,setRequestsOnly]=useState(false);
  const[detail,setDetail]=useState<Detail|null>(null),[error,setError]=useState('');
  const[confirmDelete,setConfirmDelete]=useState(false),[confirmation,setConfirmation]=useState(''),[deleting,setDeleting]=useState(false),[deleteError,setDeleteError]=useState('');
  const {viewport,capture}=useLogViewport(logEvents);
  async function remove(){setDeleting(true);setDeleteError('');try{const r=await fetch(`/api/v1/nodes/${encodeURIComponent(serverId)}`,{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({confirmation})});if(!r.ok)throw new Error((await r.json()).error??'Unable to delete server');router.push('/servers');router.refresh()}catch(e){setDeleteError(e instanceof Error?e.message:'Unable to delete server');setDeleting(false)}}
  useEffect(()=>{
    let active=true;
    function tick(){fetch(`/api/v1/nodes/${serverId}`).then(r=>r.ok?r.json().then(data=>{if(active){setDetail(data);if(!paused)setLogEvents(data.events)}}):Promise.resolve(active&&setError(r.status===404?'This server has not been found — it may not have completed its first heartbeat yet.':'Unable to load this server.')))}
    tick();
    const t=setInterval(tick,2000);
    return()=>{active=false;clearInterval(t)};
  },[serverId,paused]);
  if(error)return <main><section className="hero"><div className="eyebrow">Server</div><h1>{serverId}</h1></section><div className="g-card"><p className="muted">{error}</p><Link href="/servers">Back to servers</Link></div></main>;
  if(!detail)return <main><section className="hero"><div className="eyebrow">Server</div><h1>{serverId}</h1></section></main>;
  const {node,events,incidents}=detail;
  return <main className="server-workspace">
    <section className="hero compact-hero server-heading">
      <div><div className="eyebrow">Server</div><h1>{serverDisplayName(node)}</h1><p className="muted page-intro">{node.platform??'unknown platform'} · {node.serverId} · agent {node.agentId}{node.agentVersion?' · version '+node.agentVersion:''}<ServerSites urls={node.websiteUrls??[]} hosts={localFixture?[]:node.discoveredHosts??[]}/></p>{(node.tags??[]).map(t=><span className="tag-pill" key={t}>{t}</span>)}</div>
      <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:12}}><HostVitals metrics={node.hostMetrics}/><span className={`status${node.status==='healthy'?'':' neutral'}`}>{node.status} · last heartbeat {new Date(node.lastHeartbeat).toLocaleString()}</span></div>
    </section>
    <div className="server-split">
    <section className="g-card server-log-panel" aria-label="Live server logs">
      <div className="section-heading"><div><div className="eyebrow">{paused?'Paused':'Live activity'}</div><h2>Server logs</h2></div><button className="button" onClick={()=>setPaused(v=>!v)}>{paused?'Resume':'Pause'}</button></div>
      <p className="muted small">Request paths, response codes and timings, plus detection and protection events. Refreshes every two seconds; latest 200 entries. Sensitive values are redacted. Blocked connections appear as firewall counters because they never reach Apache.</p>
      <div className="server-log-controls"><input aria-label="Filter server logs" placeholder="Filter paths, status codes or events…" value={logFilter} onChange={e=>setLogFilter(e.target.value)}/><label><input type="checkbox" checked={requestsOnly} onChange={e=>setRequestsOnly(e.target.checked)}/> Requests and blocked traffic</label></div>
      <div className="server-log-stream" ref={viewport} onScroll={capture} data-testid="server-log-stream" role="log" aria-label="Sanitized server activity">
        {[...logEvents].sort((a,b)=>b.at.localeCompare(a.at)).filter(e=>(!requestsOnly||e.type.startsWith('log.')||e.type==='protection.traffic')&&(!logFilter||JSON.stringify([e.type,e.metadata]).toLowerCase().includes(logFilter.toLowerCase()))).slice(0,200).map((e,i)=><div className={`server-log-entry ${e.type.startsWith('protection.')?'protection-entry':''}`} key={e.id??e.at+e.type+i} data-log-id={e.id??e.at+e.type+i}><div className="server-log-meta"><time dateTime={e.at}>{new Date(e.at).toLocaleTimeString()}</time><span>{e.type}</span></div><div>{e.metadata?.message??Object.entries(e.metadata??{}).map(([k,v])=>`${k}=${v}`).join(' · ')}</div></div>)}
        {!events.length&&<p>Waiting for the agent to report activity.</p>}
      </div>
    </section>
    <aside className="server-panels">
    {detail.canManage&&<ServerIdentityEditor node={node}/>}
    <ServerWebsites serverId={serverId} urls={node.websiteUrls??[]} hosts={localFixture?[]:node.discoveredHosts??[]}/>
    <section className="g-card" aria-label="Protection activity"><h2>Protection activity</h2><p className="muted small">Agent results and operator responses for this server.</p>{[...events].filter(e=>e.type.startsWith('protection.')||e.type==='response.received').sort((a,b)=>b.at.localeCompare(a.at)).slice(0,8).map((e,i)=><div className="server-response-entry" key={e.id??i}><strong>{e.type.replaceAll('.',' ')}</strong><div className="muted small">{new Date(e.at).toLocaleString()}{e.metadata?.option?` · ${e.metadata.option} via ${e.metadata.channel??'console'}`:''}</div>{e.metadata?.expires_at&&<div className="small">Expires {new Date(e.metadata.expires_at).toLocaleString()}</div>}{e.metadata?.incident_id&&<Link href={`/incidents/${e.metadata.incident_id}`}>Review incident →</Link>}</div>)}</section>
    <section className="g-card" style={{marginBottom:16}}>
      <div className="section-heading"><div><h2>Incidents</h2><p className="muted">Correlated detections reported by this server.</p></div></div>
      <IncidentGroups incidents={incidents} names={{[node.serverId]:node.displayName}}/>
    </section>
    <section className="g-card" style={{marginTop:24}}><h2>Server management</h2><AddNode nodeCount={0} existingServerId={serverId} existingAgentId={node.agentId} initialProvider={serverId.startsWith("i-")?"ec2":"linux"} onAdded={()=>{}}/><p className="muted">Deleting removes this server from active views and prevents its existing server ID from rejoining. Past incidents and activity are retained until you purge collected data in Settings → Data. This does not terminate the machine or uninstall its agent.</p>
    {!confirmDelete?<button className="button" onClick={()=>setConfirmDelete(true)}>Delete server…</button>:<div role="group" aria-label="Confirm server deletion"><p>Stop the agent on the host with <code>sudo systemctl disable --now guardscale</code>. Organization enrollment credentials are shared: deletion does not revoke that credential or prevent enrollment under a different ID.</p><label className="field">Type {serverId} to confirm<input value={confirmation} onChange={e=>setConfirmation(e.target.value)} autoComplete="off"/></label>{deleteError&&<p role="alert" className="form-error">{deleteError}</p>}<button className="button" disabled={deleting} onClick={()=>{setConfirmDelete(false);setConfirmation('')}}>Cancel</button> <button className="button" disabled={deleting||confirmation!==serverId} onClick={remove}>{deleting?'Deleting…':'Permanently remove server'}</button></div>}
    </section>
    </aside>
    </div>
  </main>;
}
