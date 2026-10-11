'use client';
import{useEffect,useState}from'react';import Link from'next/link';import {useRouter} from'next/navigation';import type{GuardScaleEvent,IncidentRecord,Node}from'@/lib/model';

type Detail={node:Node;events:GuardScaleEvent[];incidents:IncidentRecord[]};

export default function NodeDetailConsole({serverId}:{serverId:string}){
  const router=useRouter();
  const[detail,setDetail]=useState<Detail|null>(null),[error,setError]=useState('');
  const[confirmDelete,setConfirmDelete]=useState(false),[confirmation,setConfirmation]=useState(''),[deleting,setDeleting]=useState(false),[deleteError,setDeleteError]=useState('');
  async function remove(){setDeleting(true);setDeleteError('');try{const r=await fetch(`/api/v1/nodes/${encodeURIComponent(serverId)}`,{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({confirmation})});if(!r.ok)throw new Error((await r.json()).error??'Unable to delete server');router.push('/servers');router.refresh()}catch(e){setDeleteError(e instanceof Error?e.message:'Unable to delete server');setDeleting(false)}}
  useEffect(()=>{
    let active=true;
    function tick(){fetch(`/api/v1/nodes/${serverId}`).then(r=>r.ok?r.json().then(data=>{if(active)setDetail(data)}):Promise.resolve(active&&setError(r.status===404?'This server has not been found — it may not have completed its first heartbeat yet.':'Unable to load this server.')))}
    tick();
    const t=setInterval(tick,2000);
    return()=>{active=false;clearInterval(t)};
  },[serverId]);
  if(error)return <main><section className="hero"><div className="eyebrow">Server</div><h1>{serverId}</h1></section><div className="g-card"><p className="muted">{error}</p><Link href="/servers">Back to servers</Link></div></main>;
  if(!detail)return <main><section className="hero"><div className="eyebrow">Server</div><h1>{serverId}</h1></section></main>;
  const {node,events,incidents}=detail;
  return <main>
    <section className="hero compact-hero">
      <div><div className="eyebrow">Server</div><h1>{node.displayName}</h1><p className="muted page-intro">{node.platform??'unknown platform'} · agent {node.agentId}</p>{(node.tags??[]).map(t=><span className="tag-pill" key={t}>{t}</span>)}</div>
      <span className={`status${node.status==='healthy'?'':' neutral'}`}>{node.status} · last heartbeat {new Date(node.lastHeartbeat).toLocaleString()}</span>
    </section>
    <section className="g-card" style={{marginBottom:16}}>
      <div className="section-heading"><div><h2>Incidents</h2><p className="muted">Correlated detections reported by this server.</p></div></div>
      <div className="table-wrap"><table><thead><tr><th>Incident</th><th>State</th><th>Started</th><th>Updated</th></tr></thead><tbody>
        {incidents.length?incidents.map(i=><tr key={i.incidentId} className="row-link" onClick={()=>router.push(`/incidents/${i.incidentId}`)}><td><Link href={`/incidents/${i.incidentId}`}>{i.incidentId}</Link></td><td><span className="status">{i.state}</span></td><td>{new Date(i.startedAt).toLocaleString()}</td><td>{new Date(i.updatedAt).toLocaleString()}</td></tr>)
        :<tr><td colSpan={4} className="empty-state"><strong>No incidents.</strong><span>This server has not reported a correlated incident.</span></td></tr>}
      </tbody></table></div>
    </section>
    <section className="g-card">
      <div className="section-heading"><div><h2>Live sanitized activity</h2><p className="muted">Refreshing every two seconds. GuardScale sends bounded request signals only; raw logs, query values, IP addresses, referers, and user agents stay on the node.</p></div><span className="status">Live</span></div>
      <div className="table-wrap"><table><thead><tr><th>Type</th><th>At</th><th>Metadata</th></tr></thead><tbody>
        {events.length?events.map((e,i)=><tr key={i}><td>{e.type}</td><td>{new Date(e.at).toLocaleString()}</td><td className="muted small">{e.metadata?Object.entries(e.metadata).map(([k,v])=>`${k}=${v}`).join(', '):'—'}</td></tr>)
        :<tr><td colSpan={3} className="empty-state"><strong>No activity yet.</strong><span>Events will appear here as the agent reports request and application signals.</span></td></tr>}
      </tbody></table></div>
    </section>
    <section className="g-card" style={{marginTop:24}}><h2>Server management</h2><p className="muted">Deleting removes this server from active views and prevents its existing server ID from rejoining. Past incidents and activity are retained until you purge collected data in Settings → Data. This does not terminate the machine or uninstall its agent.</p>
    {!confirmDelete?<button className="button" onClick={()=>setConfirmDelete(true)}>Delete server…</button>:<div role="group" aria-label="Confirm server deletion"><p>Stop the agent on the host with <code>sudo systemctl disable --now guardscale</code>. Organization enrollment credentials are shared: deletion does not revoke that credential or prevent enrollment under a different ID.</p><label className="field">Type {serverId} to confirm<input value={confirmation} onChange={e=>setConfirmation(e.target.value)} autoComplete="off"/></label>{deleteError&&<p role="alert" className="form-error">{deleteError}</p>}<button className="button" disabled={deleting} onClick={()=>{setConfirmDelete(false);setConfirmation('')}}>Cancel</button> <button className="button" disabled={deleting||confirmation!==serverId} onClick={remove}>{deleting?'Deleting…':'Permanently remove server'}</button></div>}
    </section>
  </main>;
}
