'use client';
import {useState} from 'react';
import ServerSites from './server-sites';

export default function ServerWebsites({serverId,urls,hosts}:{serverId:string;urls:string[];hosts:string[]}){
 const[editing,setEditing]=useState(false),[value,setValue]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState<string[]|null>(null);
 const websites=saved??urls;
 async function save(){
  setBusy(true);setError('');
  try{
   const r=await fetch(`/api/v1/nodes/${encodeURIComponent(serverId)}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({websiteUrls:value.split('\n').map(v=>v.trim()).filter(Boolean).map(v=>v.includes('://')?v:'https://'+v)})});
   const data=await r.json();if(!r.ok)throw Error(data.error??'Unable to save websites');
   setSaved(data.websiteUrls);setEditing(false);
  }catch(e){setError(e instanceof Error?e.message:'Unable to save websites');}finally{setBusy(false);}
 }
 return <section className="g-card"><h2>Websites</h2><p><ServerSites urls={websites} hosts={hosts}/></p>{!websites.length&&!hosts.length&&<p className="muted">No site hostnames reported. Update the agent and check that it can read the Apache or Nginx site configuration, or add website URLs below.</p>}<p className="muted small">Discovered links use HTTPS; availability is not verified. Add the exact URL for HTTP or custom ports.</p>{editing?<form onSubmit={e=>{e.preventDefault();void save();}}><label className="field">Website URLs, one per line<textarea value={value} onChange={e=>setValue(e.target.value)} rows={4} placeholder="https://example.com/"/></label>{error&&<p role="alert">{error}</p>}<button className="button primary" disabled={busy}>{busy?'Saving…':'Save websites'}</button> <button className="button" type="button" disabled={busy} onClick={()=>setEditing(false)}>Cancel</button></form>:<button className="button" onClick={()=>{setValue(websites.join('\n'));setError('');setEditing(true);}}>Edit website links</button>}</section>;
}
