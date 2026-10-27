'use client';
import{useEffect,useMemo,useState}from'react';import Link from'next/link';import {useSearchParams} from'next/navigation';import type{IncidentRecord,Node}from'@/lib/model';

import IncidentGroups from './incident-groups';

export default function IncidentsConsole(){

  const[incidents,setIncidents]=useState<IncidentRecord[]|null>(null);
  const[nodes,setNodes]=useState<Node[]>([]);
  const[nodeFilter,setNodeFilter]=useState(''),[tagFilter,setTagFilter]=useState(''),[stateFilter,setStateFilter]=useState('');
  const showAll=useSearchParams().get('status')==='all';
  useEffect(()=>{let active=true,busy=false;async function refresh(){if(busy)return;busy=true;try{const [i,n]=await Promise.all([fetch('/api/v1/incidents').then(r=>{if(!r.ok)throw Error('Incidents unavailable');return r.json()}),fetch('/api/v1/nodes').then(r=>{if(!r.ok)throw Error('Servers unavailable');return r.json()})]);if(active){setIncidents(i);setNodes(n)}}catch{/* Preserve the previous history during a transient read failure. */}finally{busy=false}}void refresh();const timer=setInterval(()=>void refresh(),5000);return()=>{active=false;clearInterval(timer)}},[]);
  const nodeByServerId=useMemo(()=>new Map(nodes.map(n=>[n.serverId,n])),[nodes]);
  const allTags=useMemo(()=>[...new Set(nodes.flatMap(n=>n.tags??[]))].sort(),[nodes]);
  const allStates=useMemo(()=>[...new Set((incidents??[]).map(i=>i.state))].sort(),[incidents]);
  const active=showAll?(incidents??[]):(incidents??[]).filter(i=>i.state!=='resolved');
  const filtered=active.filter(i=>{
    if(nodeFilter&&i.serverId!==nodeFilter)return false;
    if(tagFilter&&!(nodeByServerId.get(i.serverId)?.tags??[]).includes(tagFilter))return false;
    if(stateFilter&&i.state!==stateFilter)return false;
    return true;
  });
  return <main><section className="hero"><div className="eyebrow">Timeline</div><h1>{showAll?'All incidents':'Active incidents'}</h1><Link href={showAll?'/incidents':'/incidents?status=all'} className="muted small">{showAll?'Show active only':'Show all incident history, including dismissed'}</Link></section>
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
      <select value={stateFilter} onChange={e=>setStateFilter(e.target.value)}>
        <option value="">All statuses</option>
        {allStates.map(s=><option value={s} key={s}>{s}</option>)}
      </select>
    </div>
    {filtered.length===0?<div className="g-card"><span className="status">All clear</span><p className="muted">No {showAll?'':'active '}correlated incidents{nodeFilter||tagFilter?' match this filter':''}.</p></div>:
    <div className="g-card"><IncidentGroups incidents={filtered} names={Object.fromEntries(nodes.map(n=>[n.serverId,n.displayName]))}/></div>}
    </>}
  </main>;
}
