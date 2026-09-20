'use client';
import{useEffect,useState}from'react';import Link from'next/link';import {useSearchParams} from'next/navigation';import type{Node,Settings}from'@/lib/model';import AddNode from'./add-node';

function statusLabel(n:Node,staleAfterMs:number){
  if(n.status!=='healthy')return n.status;
  const staleMs=Date.now()-new Date(n.lastHeartbeat).getTime();
  return staleMs>staleAfterMs?'stale':'healthy';
}

export default function NodesConsole(){
  const[nodes,setNodes]=useState<Node[]>([]),[loaded,setLoaded]=useState(false);
  const[settings,setSettings]=useState<Settings|null>(null);
  const statusFilter=useSearchParams().get('status');
  function fetchNodes(){return fetch('/api/v1/nodes').then(r=>r.ok?r.json():[])}
  function load(){return fetchNodes().then(data=>{setNodes(data);setLoaded(true)})}
  useEffect(()=>{let active=true;fetch('/api/v1/settings').then(r=>r.ok?r.json():null).then(data=>{if(active&&data)setSettings(data)});return()=>{active=false}},[]);
  useEffect(()=>{let active=true;function tick(){fetchNodes().then(data=>{if(active){setNodes(data);setLoaded(true)}})}tick();const t=setInterval(tick,15000);return()=>{active=false;clearInterval(t)}},[]);
  const staleAfterMs=(settings?.detection.heartbeatStaleSeconds??180)*1000;
  const visible=statusFilter?nodes.filter(n=>statusLabel(n,staleAfterMs)===statusFilter):nodes;
  const byTag=new Map<string,Node[]>();
  const standalone:Node[]=[];
  for(const n of visible){const tags=n.tags??[];if(tags.length)for(const tag of tags){const list=byTag.get(tag)??[];list.push(n);byTag.set(tag,list)}else standalone.push(n)}
  return <main>
    <section className="hero compact-hero">
      <div><div className="eyebrow">Fleet</div><h1>Nodes</h1><p className="muted page-intro">Install a lightweight Guardian agent on each node. Agents connect outbound to Guardian.US; no inbound port is required.</p></div>
      <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:12}}>
        <span className="status neutral">{visible.length} of {nodes.length} node{nodes.length===1?'':'s'}{statusFilter?` (${statusFilter})`:''}</span>
        <AddNode onAdded={load}/>
        {statusFilter&&<Link href="/nodes" className="muted small">Clear filter</Link>}
      </div>
    </section>
    {[...byTag.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([tag,items])=><section className="g-card" key={tag} style={{marginBottom:16}}>
      <div className="section-heading"><div><h2>{tag}</h2><p className="muted">{items.length} node{items.length===1?'':'s'} tagged &quot;{tag}&quot;</p></div></div>
      <NodeTable nodes={items} staleAfterMs={staleAfterMs}/>
    </section>)}
    <section className="g-card">
      <div className="section-heading"><div><h2>{byTag.size?'Untagged nodes':'Connected nodes'}</h2><p className="muted">A node appears after its first authenticated heartbeat.</p></div><span className="status neutral">{standalone.length} enrolled</span></div>
      <NodeTable nodes={standalone} staleAfterMs={staleAfterMs} empty={loaded}/>
    </section>
  </main>;
}

function NodeTable({nodes,staleAfterMs,empty}:{nodes:Node[];staleAfterMs:number;empty?:boolean}){
  return <div className="table-wrap"><table><thead><tr><th>Node</th><th>Tags</th><th>Health</th><th>Last heartbeat</th></tr></thead><tbody>
    {nodes.length?nodes.map(n=><tr key={n.serverId}><td><Link href={`/nodes/${n.serverId}`}><strong>{n.displayName}</strong></Link><br/><span className="muted">{n.platform??'unknown platform'}</span></td><td>{(n.tags??[]).map(t=><span className="tag-pill" key={t}>{t}</span>)}</td><td><span className={`status${statusLabel(n,staleAfterMs)==='healthy'?'':' neutral'}`}>{statusLabel(n,staleAfterMs)}</span></td><td>{new Date(n.lastHeartbeat).toLocaleString()}</td></tr>)
    :empty&&<tr><td colSpan={4} className="empty-state"><strong>No agents connected yet.</strong><span>Choose Add node to generate an installation guide.</span></td></tr>}
  </tbody></table></div>;
}
