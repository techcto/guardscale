'use client';
import {useState} from 'react';
import ServerSites from './server-sites';
import styles from './server-websites.module.css';

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
 return <section className="g-card"><h2>Websites</h2><div className={styles.links}><ServerSites urls={websites} hosts={hosts}/></div>{!websites.length&&!hosts.length&&<p className="muted">No site hostnames reported. Update the agent and check that it can read the Apache or Nginx site configuration, or add website URLs below.</p>}<p className="muted small">Discovered links use HTTPS; availability is not verified. Add the exact URL for HTTP or custom ports. Saved public URLs on standard web ports are automatically added to Uptime.</p>{editing?<form className={styles.form} onSubmit={e=>{e.preventDefault();void save();}}><label className={styles.field}>Website URLs, one per line<textarea value={value} onChange={e=>setValue(e.target.value)} rows={4} placeholder={'https://example.com/\nhttps://www.example.com/'} disabled={busy}/></label>{error&&<p className="form-error" role="alert">{error}</p>}<div className={styles.actions}><button className="button primary" disabled={busy}>{busy?'Saving…':'Save websites'}</button><button className="button" type="button" disabled={busy} onClick={()=>setEditing(false)}>Cancel</button></div></form>:<button className="button" onClick={()=>{setValue(websites.join('\n'));setError('');setEditing(true);}}>Edit website links</button>}</section>;
}
