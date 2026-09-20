'use client';
import{useEffect,useState}from'react';import Link from'next/link';import {useRouter} from'next/navigation';import type{GuardianEvent,IncidentRecord,Node}from'@/lib/model';

type Detail={node:Node;events:GuardianEvent[];incidents:IncidentRecord[]};

export default function NodeDetailConsole({serverId}:{serverId:string}){
  const router=useRouter();
  const[detail,setDetail]=useState<Detail|null>(null),[error,setError]=useState('');
  useEffect(()=>{
    let active=true;
    function tick(){fetch(`/api/v1/nodes/${serverId}`).then(r=>r.ok?r.json().then(data=>{if(active)setDetail(data)}):Promise.resolve(active&&setError(r.status===404?'This node has not been found — it may not have completed its first heartbeat yet.':'Unable to load this node.')))}
    tick();
    const t=setInterval(tick,10000);
    return()=>{active=false;clearInterval(t)};
  },[serverId]);
  if(error)return <main><section className="hero"><div className="eyebrow">Node</div><h1>{serverId}</h1></section><div className="g-card"><p className="muted">{error}</p><Link href="/nodes">Back to nodes</Link></div></main>;
  if(!detail)return <main><section className="hero"><div className="eyebrow">Node</div><h1>{serverId}</h1></section></main>;
  const {node,events,incidents}=detail;
  return <main>
    <section className="hero compact-hero">
      <div><div className="eyebrow">Node</div><h1>{node.displayName}</h1><p className="muted page-intro">{node.platform??'unknown platform'} · agent {node.agentId}</p>{(node.tags??[]).map(t=><span className="tag-pill" key={t}>{t}</span>)}</div>
      <span className={`status${node.status==='healthy'?'':' neutral'}`}>{node.status} · last heartbeat {new Date(node.lastHeartbeat).toLocaleString()}</span>
    </section>
    <section className="g-card" style={{marginBottom:16}}>
      <div className="section-heading"><div><h2>Incidents</h2><p className="muted">Correlated detections reported by this node.</p></div></div>
      <div className="table-wrap"><table><thead><tr><th>Incident</th><th>State</th><th>Started</th><th>Updated</th></tr></thead><tbody>
        {incidents.length?incidents.map(i=><tr key={i.incidentId} className="row-link" onClick={()=>router.push(`/incidents/${i.incidentId}`)}><td><Link href={`/incidents/${i.incidentId}`}>{i.incidentId}</Link></td><td><span className="status">{i.state}</span></td><td>{new Date(i.startedAt).toLocaleString()}</td><td>{new Date(i.updatedAt).toLocaleString()}</td></tr>)
        :<tr><td colSpan={4} className="empty-state"><strong>No incidents.</strong><span>This node has not reported a correlated incident.</span></td></tr>}
      </tbody></table></div>
    </section>
    <section className="g-card">
      <div className="section-heading"><div><h2>Request &amp; event activity</h2><p className="muted">Most recent {events.length} events reported by this node&apos;s agent.</p></div></div>
      <div className="table-wrap"><table><thead><tr><th>Type</th><th>At</th><th>Metadata</th></tr></thead><tbody>
        {events.length?events.map((e,i)=><tr key={i}><td>{e.type}</td><td>{new Date(e.at).toLocaleString()}</td><td className="muted small">{e.metadata?Object.entries(e.metadata).map(([k,v])=>`${k}=${v}`).join(', '):'—'}</td></tr>)
        :<tr><td colSpan={3} className="empty-state"><strong>No activity yet.</strong><span>Events will appear here as the agent reports request and application signals.</span></td></tr>}
      </tbody></table></div>
    </section>
  </main>;
}
