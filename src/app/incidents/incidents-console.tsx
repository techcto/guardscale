'use client';
import{useEffect,useState}from'react';import type{IncidentRecord}from'@/lib/model';
export default function IncidentsConsole(){
  const[incidents,setIncidents]=useState<IncidentRecord[]|null>(null);
  useEffect(()=>{let active=true;fetch('/api/v1/incidents').then(r=>r.ok?r.json():[]).then(data=>{if(active)setIncidents(data)});return()=>{active=false}},[]);
  const active=incidents?.filter(i=>i.state!=='resolved')??[];
  return <main><section className="hero"><div className="eyebrow">Timeline</div><h1>Active incidents</h1></section>
    {incidents===null?<div className="card"><p className="muted">Loading…</p></div>:active.length===0?<div className="card"><span className="status">All clear</span><p className="muted">No active correlated incidents.</p></div>:
    <div className="card"><div className="table-wrap"><table><thead><tr><th>Incident</th><th>Node</th><th>State</th><th>Started</th></tr></thead><tbody>
      {active.map(i=><tr key={i.incidentId}><td>{i.incidentId}</td><td>{i.serverId}</td><td><span className="status">{i.state}</span></td><td>{new Date(i.startedAt).toLocaleString()}</td></tr>)}
    </tbody></table></div></div>}
  </main>;
}
