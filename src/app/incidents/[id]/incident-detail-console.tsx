'use client';
import{useEffect,useState}from'react';import Link from'next/link';import type{IncidentRecord,Node}from'@/lib/model';

export default function IncidentDetailConsole({incidentId}:{incidentId:string}){
  const[incident,setIncident]=useState<IncidentRecord|null>(null),[node,setNode]=useState<Node|null>(null);
  const[error,setError]=useState(''),[busy,setBusy]=useState(false);
  function load(){return fetch(`/api/v1/incidents/${incidentId}`).then(r=>r.ok?r.json().then(d=>{setIncident(d.incident);setNode(d.node)}):Promise.resolve(setError('This incident was not found.')))}
  useEffect(()=>{void load()},[incidentId]);
  async function transition(state:string){setBusy(true);setError('');const r=await fetch(`/api/v1/incidents/${incidentId}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({state})});setBusy(false);if(!r.ok){setError((await r.json()).error??'Unable to update incident');return}void load()}
  if(error)return <main><section className="hero"><div className="eyebrow">Incident</div><h1>{incidentId}</h1></section><div className="g-card"><p className="muted">{error}</p><Link href="/incidents">Back to incidents</Link></div></main>;
  if(!incident)return <main><section className="hero"><div className="eyebrow">Incident</div><h1>{incidentId}</h1></section></main>;
  return <main>
    <section className="hero compact-hero">
      <div><div className="eyebrow">Incident</div><h1>{incident.incidentId}</h1><p className="muted page-intro">Node {node?<Link href={`/nodes/${node.serverId}`}>{node.displayName}</Link>:incident.serverId}{(node?.tags??[]).map(t=><span className="tag-pill" key={t}>{t}</span>)}</p></div>
      <span className="status">{incident.state}</span>
    </section>
    <section className="g-card" style={{marginBottom:16}}>
      <div className="section-heading"><div><h2>Timeline</h2></div></div>
      <div className="form-grid"><div><span className="muted small">Started</span><div>{new Date(incident.startedAt).toLocaleString()}</div></div><div><span className="muted small">Last updated</span><div>{new Date(incident.updatedAt).toLocaleString()}</div></div></div>
    </section>
    <section className="g-card" style={{marginBottom:16}}>
      <div className="section-heading"><div><h2>Actions</h2><p className="muted">Operator actions are audited and don&apos;t change agent-side protection state by themselves.</p></div></div>
      {error&&<p className="form-error">{error}</p>}
      <div style={{display:'flex',gap:10}}>
        <button className="button" disabled={busy} onClick={()=>transition('acknowledged')}>Acknowledge</button>
        <button className="button primary" disabled={busy} onClick={()=>transition('resolved')}>Mark resolved</button>
      </div>
    </section>
    <section className="g-card">
      <div className="section-heading"><div><h2>Raw evidence</h2><p className="muted">Structured payload reported by the agent.</p></div></div>
      <pre><code>{JSON.stringify(incident.payload,null,2)}</code></pre>
    </section>
  </main>;
}
