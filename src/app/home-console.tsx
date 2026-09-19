'use client';
import{useEffect,useState}from'react';import type{IncidentRecord,Node}from'@/lib/model';
export default function HomeConsole(){
  const[nodes,setNodes]=useState<Node[]|null>(null),[incidents,setIncidents]=useState<IncidentRecord[]|null>(null);
  useEffect(()=>{let active=true;Promise.all([fetch('/api/v1/nodes').then(r=>r.ok?r.json():[]),fetch('/api/v1/incidents').then(r=>r.ok?r.json():[])]).then(([n,i])=>{if(active){setNodes(n);setIncidents(i)}});return()=>{active=false}},[]);
  const healthy=nodes?.filter(n=>n.status==='healthy').length??0;
  const active=incidents?.filter(i=>i.state!=='resolved').length??0;
  const cards=[['Nodes enrolled',nodes===null?'…':String(nodes.length)],['Healthy nodes',nodes===null?'…':String(healthy)],['Active incidents',incidents===null?'…':String(active)],['Total incidents',incidents===null?'…':String(incidents.length)]];
  return <main><section className="hero"><div className="eyebrow">Detect · Alert · Respond · Recover</div><h1>Your AI-powered infrastructure guardian.</h1><p className="muted">Guardian.US detects attacks and application failures, alerts teams via WhatsApp and email, and lets operators safely respond in real time. It correlates aggregate behavior and infrastructure pressure without blaming a browser, country, or single IP.</p></section><section className="grid">{cards.map(([a,b])=><article className="card" key={a}><div className="muted">{a}</div><div className="metric">{b}</div></article>)}</section></main>;
}
