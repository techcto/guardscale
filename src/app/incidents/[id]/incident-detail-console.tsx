'use client';
import {useCallback,useEffect,useState} from 'react';
import Link from 'next/link';
import type {IncidentRecord,Node} from '@/lib/model';
import {incidentSummary} from '@/lib/incident-summary';

type Readiness={canApprove:boolean;blockedReason:string|null;ttlSeconds:number};
type Evidence={kind?:string;monitorId?:string;monitorName?:string;url?:string;recoveredAt?:string;source_ip?:string;country?:string;analysis?:{status:string;summary?:string;recommendation?:string;trace?:{tool:string;status:string;result?:unknown}[]}};
const commandLabels:Record<string,string>={queued:'Waiting for the agent to apply the block',applied:'Temporary block applied by the agent',expired:'Temporary block ended',failed:'The agent could not apply the block',rejected:'The agent rejected the block for safety',cancel_requested:'Waiting for the agent to remove protection',cancelled:'Protection removed by the agent'};

export default function IncidentDetailConsole({incidentId}:{incidentId:string}){
 const[incident,setIncident]=useState<IncidentRecord|null>(null),[node,setNode]=useState<Node|null>(null);
 const[commands,setCommands]=useState<{id:string;kind?:string;status:string;expiresAt:string}[]>([]);
 const[activity,setActivity]=useState<{type:string;at:string;option?:string;channel?:string}[]>([]);
 const[protection,setProtection]=useState<Readiness|null>(null),[canManage,setCanManage]=useState(false);
 const[approval,setApproval]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const load=useCallback(async()=>{try{
  const response=await fetch(`/api/v1/incidents/${encodeURIComponent(incidentId)}`);
  if(!response.ok)throw Error(response.status===404?'This incident was not found.':'Unable to load this incident.');
  const data=await response.json();setIncident(data.incident);setNode(data.node);setCommands(data.commands??[]);setActivity(data.activity??[]);setProtection(data.protection??null);setCanManage(data.canManage===true);
 }catch(e){setError(e instanceof Error?e.message:'Unable to load incident.');}},[incidentId]);
 useEffect(()=>{const first=setTimeout(()=>void load(),0);const timer=setInterval(()=>void load(),2000);return()=>{clearTimeout(first);clearInterval(timer);};},[load]);
 async function transition(state:string){setBusy(true);setError('');try{
  const response=await fetch(`/api/v1/incidents/${encodeURIComponent(incidentId)}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({state})});
  if(!response.ok)throw Error((await response.json()).error??'Unable to update incident');await load();
 }catch(e){setError(e instanceof Error?e.message:'Unable to update incident');}finally{setBusy(false);}}
 async function protect(){
  if(!protection?.canApprove)return;
  const source=(incident?.payload as Evidence)?.source_ip??'the agent-observed address';
  if(!window.confirm(`Block HTTP(S) traffic from ${source} to ${node?.displayName??incident?.serverId} for up to ${protection.ttlSeconds} seconds? Other traffic is not blocked. The agent independently checks the target before applying it.`))return;
  setBusy(true);setError('');try{
   const response=await fetch(`/api/v1/incidents/${encodeURIComponent(incidentId)}/protect`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({confirmation:'Protect'})});
   const value=await response.json();if(!response.ok)throw Error(value.error??'Approval rejected');
   setApproval('Approval recorded. Waiting for the agent’s execution result—approval alone does not mean traffic is blocked.');await load();
  }catch(e){setError(e instanceof Error?e.message:'Approval failed');}finally{setBusy(false);}
 }
 if(!incident)return <main><section className="hero"><div className="eyebrow">Incident review</div><h1>{error?'Unable to open incident':'Loading incident…'}</h1></section>{error&&<p role="alert">{error}</p>}<Link href="/incidents">← Back to incidents</Link></main>;
 const evidence=incident.payload as Evidence;
 const summary=incidentSummary(incident.payload);
 if(evidence.kind==='uptime')return <main><section className="hero compact-hero"><div><Link href="/uptime">← Back to Uptime</Link><div className="eyebrow">Availability incident</div><h1>{evidence.monitorName??'Website availability'}</h1><p>{evidence.url&&<a href={evidence.url} target="_blank" rel="noopener noreferrer">{evidence.url} ↗</a>}</p></div><span className="status">{evidence.recoveredAt?'Recovered':incident.state==='resolved'?'Closed':'Needs review'}</span></section><section className="g-card"><h2>What happened?</h2>{summary.findings.map((f,i)=><div key={i}><p>{f.explanation}</p><ul>{f.evidence.map((item,j)=><li key={j}>{item}</li>)}</ul></div>)}<p>Detected: {new Date(incident.startedAt).toLocaleString()}</p>{evidence.recoveredAt&&<p>Recovery confirmed: {new Date(evidence.recoveredAt).toLocaleString()}</p>}<p>Review the website, origin health and deployment changes. No attacker was identified and no protection rule was requested. Uptime checks continue independently of this incident’s review status.</p>{error&&<p role="alert">{error}</p>}{canManage&&incident.state!=='resolved'&&<button className="button" disabled={busy} onClick={()=>void transition('resolved')}>Close incident</button>} <Link className="button" href="/uptime">View check history</Link></section></main>;
 const ai=evidence.analysis;
 const aiExplanation=!ai?'AI review is pending. Review the measured findings below.':ai.status==='not_configured'?'AI review is not enabled for this installation. This alert comes from agent detection rules, not an AI assessment.':ai.status==='allowance_reached'?'AI review was skipped: this organization reached its Guardian AI allowance for the billing period. Review the measured findings before deciding.':ai.status==='unavailable'?'AI review could not finish. No AI recommendation is available; review the measured findings before deciding.':ai.status==='complete'?'AI review completed. Its recommendation is advisory; you remain in control.':'AI review is still in progress.';
 return <main>
  <section className="hero compact-hero"><div><Link href="/incidents">← Back to incidents</Link><div className="eyebrow">Incident review</div><h1>{summary.title}</h1><p className="muted page-intro">Server: {node?<Link href={`/servers/${node.serverId}`}>{node.displayName}</Link>:incident.serverId}</p><p className="muted small" style={{overflowWrap:'anywhere'}}>Incident ID: {incident.incidentId}</p></div><span className="status">{incident.state==='review'?'Needs review':incident.state}</span></section>
  <section className="g-card" style={{marginBottom:16}} aria-label="What happened"><h2>What happened?</h2>
   {summary.findings.length?summary.findings.map((finding,index)=><div key={index} style={{marginBottom:16}}><h3 style={{fontSize:18}}>{finding.title} <span className="status neutral">{finding.severity}</span></h3><p>{finding.explanation}</p>{finding.evidence.length>0&&<ul>{finding.evidence.map((item,i)=><li key={i}>{item}</li>)}</ul>}</div>):<p>The agent opened this incident without a detailed finding summary. Inspect the technical evidence before taking action.</p>}
   {summary.counts.length>0&&<div className="grid">{summary.counts.map(count=><div key={count.label}><span className="muted small">{count.label}</span><div style={{fontSize:24,fontWeight:700}}>{Number.isInteger(count.value)?count.value:count.value.toFixed(1)}</div></div>)}</div>}
   <p className="muted small">Counts describe the detector’s observation window across this server, not necessarily one source. A detection is not a confirmed attack.</p>
   <p>Candidate source: <strong>{evidence.source_ip??'No individual blocking candidate supplied'}</strong>{evidence.country?` · Country: ${evidence.country}`:' · Country unavailable'}</p>
   <p className="muted small">Detected {new Date(incident.startedAt).toLocaleString()} · Updated {new Date(incident.updatedAt).toLocaleString()}</p>
  </section>
  <section className="g-card" style={{marginBottom:16}}><h2>Guardian review</h2><p>{aiExplanation}</p>{ai?.status==='complete'&&<><p><strong>{ai.recommendation==='protect'?'Suggested next step: consider a temporary block.':ai.recommendation==='watch'?'Suggested next step: continue monitoring.':ai.recommendation==='dismiss'?'Suggested next step: consider closing after review.':'Your review is required.'}</strong></p>{ai.summary&&<p>{ai.summary}</p>}</>}
   {!!ai?.trace?.length&&<details><summary>Inspection tools and results</summary><ol>{ai.trace.map((step,i)=><li key={i}><strong>{step.tool==='inspect_server'?'Inspect server health':step.tool==='request_human_approval'?'Request operator review':step.tool}</strong> — {step.status}{step.result!==undefined&&<pre>{JSON.stringify(step.result,null,2)}</pre>}</li>)}</ol></details>}
  </section>
  <section className="g-card" style={{marginBottom:16}} aria-label="Incident actions"><h2>What would you like to do?</h2>
   <p>{evidence.source_ip?<>If this source looks unwanted, you can request a temporary block of HTTP(S) traffic from <strong>{evidence.source_ip}</strong> to this server for up to <strong>{protection?.ttlSeconds??'the configured number of'} seconds</strong>. The agent checks its allowed targets before applying it.</>:'No individual source was identified for blocking. Investigate the measured pattern before choosing a response.'}</p>
   {protection?.blockedReason&&<p role="status" className="notice"><strong>Blocking is not available</strong><span>{protection.blockedReason}</span>{protection.blockedReason.includes('Settings')&&<Link href="/settings?tab=Response">Open response settings →</Link>}</p>}
   {error&&<p role="alert" className="form-error">{error}</p>}{approval&&<p role="status">{approval}</p>}
   {commands.filter(command=>command.kind!=='inspect_server').map(command=><p key={command.id} role="status"><strong>{commandLabels[command.status]??command.status}</strong>{['queued','applied'].includes(command.status)&&` · Expires ${new Date(command.expiresAt).toLocaleString()}`}</p>)}
   <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
    <button className="button primary" disabled={busy||!protection?.canApprove} onClick={protect}>Block source temporarily…</button>
    <button className="button" disabled={busy||!canManage||incident.state==='watch'||incident.state==='resolved'} onClick={()=>transition('watch')}>Watch</button>
    <button className="button" disabled={busy||!canManage||incident.state==='acknowledged'||incident.state==='resolved'} onClick={()=>transition('acknowledged')}>I’m investigating</button>
    <button className="button" disabled={busy||!canManage||incident.state==='resolved'} onClick={()=>transition('resolved')}>Dismiss and remove protection</button>
   </div>
   <p className="muted small" style={{marginTop:12}}>“I’m investigating” acknowledges the alert. “Dismiss and remove protection” stops extensions and requests removal of this incident’s active block. Removal is confirmed by the agent.</p>
  </section>
  <section className="g-card" style={{marginBottom:16}} aria-label="Response history"><h2>Response history</h2><p className="muted small">WhatsApp replies, console responses and agent execution results appear here.</p>{activity.length?<ol>{activity.map((event,index)=><li key={index}><strong>{event.type==='response.received'?`${event.option??'Response'} via ${event.channel??'console'}`:event.type.replaceAll('.',' ')}</strong> · {new Date(event.at).toLocaleString()}</li>)}</ol>:<p>No response has been recorded yet.</p>}</section>
  <details className="g-card"><summary>Technical evidence</summary><p className="muted small">Structured data reported by the agent; useful for deeper investigation.</p><pre><code>{JSON.stringify(incident.payload,null,2)}</code></pre></details>
 </main>;
}
