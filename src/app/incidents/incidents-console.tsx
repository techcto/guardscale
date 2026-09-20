'use client';
import{useEffect,useMemo,useState}from'react';import Link from'next/link';import {useSearchParams} from'next/navigation';import type{IncidentRecord,Node}from'@/lib/model';

export default function IncidentsConsole(){
  const[incidents,setIncidents]=useState<IncidentRecord[]|null>(null);
  const[nodes,setNodes]=useState<Node[]>([]);
  const[nodeFilter,setNodeFilter]=useState(''),[tagFilter,setTagFilter]=useState('');
  const showAll=useSearchParams().get('status')==='all';
  useEffect(()=>{let active=true;Promise.all([fetch('/api/v1/incidents').then(r=>r.ok?r.json():[]),fetch('/api/v1/nodes').then(r=>r.ok?r.json():[])]).then(([i,n])=>{if(active){setIncidents(i);setNodes(n)}});return()=>{active=false}},[]);
  const nodeByServerId=useMemo(()=>new Map(nodes.map(n=>[n.serverId,n])),[nodes]);
  const allTags=useMemo(()=>[...new Set(nodes.flatMap(n=>n.tags??[]))].sort(),[nodes]);
  const active=showAll?(incidents??[]):(incidents??[]).filter(i=>i.state!=='resolved');
  const filtered=active.filter(i=>{
    if(nodeFilter&&i.serverId!==nodeFilter)return false;
    if(tagFilter&&!(nodeByServerId.get(i.serverId)?.tags??[]).includes(tagFilter))return false;
    return true;
  });
  return <main><section className="hero"><div className="eyebrow">Timeline</div><h1>{showAll?'All incidents':'Active incidents'}</h1>{showAll&&<Link href="/incidents" className="muted small">Show active only</Link>}</section>
    {incidents===null?<div className="g-card"><p className="muted">Loading…</p></div>:<>
    <div className="filter-row">
      <select value={nodeFilter} onChange={e=>setNodeFilter(e.target.value)}>
        <option value="">All nodes</option>
        {nodes.map(n=><option value={n.serverId} key={n.serverId}>{n.displayName}</option>)}
      </select>
      <select value={tagFilter} onChange={e=>setTagFilter(e.target.value)}>
        <option value="">All tags</option>
        {allTags.map(t=><option value={t} key={t}>{t}</option>)}
      </select>
    </div>
    {filtered.length===0?<div className="g-card"><span className="status">All clear</span><p className="muted">No {showAll?'':'active '}correlated incidents{nodeFilter||tagFilter?' match this filter':''}.</p></div>:
    <div className="g-card"><div className="table-wrap"><table><thead><tr><th>Incident</th><th>Node</th><th>Tags</th><th>State</th><th>Started</th></tr></thead><tbody>
      {filtered.map(i=><tr key={i.incidentId}><td><Link href={`/incidents/${i.incidentId}`}>{i.incidentId}</Link></td><td>{nodeByServerId.get(i.serverId)?.displayName??i.serverId}</td><td>{(nodeByServerId.get(i.serverId)?.tags??[]).map(t=><span className="tag-pill" key={t}>{t}</span>)}</td><td><span className="status">{i.state}</span></td><td>{new Date(i.startedAt).toLocaleString()}</td></tr>)}
    </tbody></table></div></div>}
    </>}
  </main>;
}
