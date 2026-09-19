'use client';
import{useEffect,useState}from'react';import Link from'next/link';import type{Node}from'@/lib/model';import AddNode from'./add-node';

function statusLabel(n:Node){
  if(n.status!=='healthy')return n.status;
  const staleMs=Date.now()-new Date(n.lastHeartbeat).getTime();
  return staleMs>180000?'stale':'healthy';
}

export default function NodesConsole(){
  const[nodes,setNodes]=useState<Node[]>([]),[loaded,setLoaded]=useState(false);
  function fetchNodes(){return fetch('/api/v1/nodes').then(r=>r.ok?r.json():[])}
  function load(){return fetchNodes().then(data=>{setNodes(data);setLoaded(true)})}
  useEffect(()=>{let active=true;function tick(){fetchNodes().then(data=>{if(active){setNodes(data);setLoaded(true)}})}tick();const t=setInterval(tick,15000);return()=>{active=false;clearInterval(t)}},[]);
  const clustered=new Map<string,Node[]>();
  const standalone:Node[]=[];
  for(const n of nodes){if(n.clusterId){const list=clustered.get(n.clusterId)??[];list.push(n);clustered.set(n.clusterId,list)}else standalone.push(n)}
  return <main>
    <section className="hero compact-hero">
      <div><div className="eyebrow">Fleet</div><h1>Nodes</h1><p className="muted page-intro">Install a lightweight Guardian agent on each node. Agents connect outbound to Guardian.US; no inbound port is required.</p></div>
      <AddNode onAdded={load}/>
    </section>
    {[...clustered.entries()].map(([cluster,items])=><section className="card" key={cluster} style={{marginBottom:16}}>
      <div className="section-heading"><div><h2>{cluster}</h2><p className="muted">{items.length} node{items.length===1?'':'s'} in this cluster</p></div></div>
      <NodeTable nodes={items}/>
    </section>)}
    <section className="card">
      <div className="section-heading"><div><h2>{clustered.size?'Standalone nodes':'Connected nodes'}</h2><p className="muted">A node appears after its first authenticated heartbeat.</p></div><span className="status neutral">{nodes.length} enrolled</span></div>
      <NodeTable nodes={standalone} empty={loaded}/>
    </section>
  </main>;
}

function NodeTable({nodes,empty}:{nodes:Node[];empty?:boolean}){
  return <div className="table-wrap"><table><thead><tr><th>Node</th><th>Health</th><th>Last heartbeat</th></tr></thead><tbody>
    {nodes.length?nodes.map(n=><tr key={n.serverId}><td><Link href={`/nodes/${n.serverId}`}><strong>{n.displayName}</strong></Link><br/><span className="muted">{n.platform??'unknown platform'}</span></td><td><span className={`status${statusLabel(n)==='healthy'?'':' neutral'}`}>{statusLabel(n)}</span></td><td>{new Date(n.lastHeartbeat).toLocaleString()}</td></tr>)
    :empty&&<tr><td colSpan={3} className="empty-state"><strong>No agents connected yet.</strong><span>Choose Add node to generate an installation guide.</span></td></tr>}
  </tbody></table></div>;
}
