'use client';
import {useEffect, useState} from 'react';
import {useSearchParams} from 'next/navigation';
import type {Settings} from '@/lib/model';
import BillingConsole from '@/app/billing/billing-console';
import OrganizationsConsole from '@/app/organizations/organizations-console';

const UNSAVED=new Date(0).toISOString();

export default function SettingsConsole({saas,isRoot}:{saas:boolean;isRoot:boolean}){
 const initialTab=useSearchParams().get('tab');
 const [settings,setSettings]=useState<Settings|null>(null),[saved,setSaved]=useState(false),[error,setError]=useState(''),[tab,setTab]=useState(initialTab??'Detection');
 const [testWhatsapp,setTestWhatsapp]=useState(''),[testEmail,setTestEmail]=useState(''),[testStatus,setTestStatus]=useState<Record<string,string>>({});
 const tabs=['Detection','Notifications','Response','Data',...(saas?['Billing']:[]),...(saas&&isRoot?['Organizations']:[])];
 useEffect(()=>{let active=true;fetch('/api/v1/settings').then(r=>r.ok?r.json():null).then(data=>{if(active&&data)setSettings(data)});return()=>{active=false}},[]);
 async function save(){if(!settings)return;setError('');const r=await fetch('/api/v1/settings',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(settings)});if(!r.ok){setError((await r.json()).error??'Unable to save settings');return}setSettings(await r.json());setSaved(true);setTimeout(()=>setSaved(false),1800)}
 async function sendTest(channel:'whatsapp'|'email',destination:string,originationId?:string){
  if(!destination){setTestStatus(s=>({...s,[channel]:'Enter a destination first.'}));return}
  setTestStatus(s=>({...s,[channel]:'Sending…'}));
  const r=await fetch('/api/v1/settings/test-notification',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({channel,destination,originationId})});
  const body=await r.json().catch(()=>({}));
  setTestStatus(s=>({...s,[channel]:r.ok?'Test sent.':(body.error??'Unable to send test notification.')}));
 }
 if(!settings)return <div className="settings-layout"><aside className="settings-tabs">{tabs.map(x=><button key={x} disabled>{x}</button>)}</aside><div className="g-card settings-panel"><p className="muted">Loading settings…</p></div></div>;
 const set=<K extends keyof Settings>(group:K,patch:Partial<Settings[K]>)=>setSettings(s=>s&&({...s,[group]:{...(s[group] as object),...patch}}));
 return <section className="settings-layout"><aside className="settings-tabs">{tabs.map(x=><button className={tab===x?'active':''} onClick={()=>setTab(x)} key={x}>{x}</button>)}</aside><div className="g-card settings-panel">
  {tab==='Detection'&&<><Heading title="Detection thresholds" text="Tune when coordinated traffic and application failures become an incident."/><div className="form-grid">
    <NumberField label="Warning HTTP 504 rate (%)" value={settings.detection.warningPercent} onChange={v=>set('detection',{warningPercent:v})}/>
    <NumberField label="Critical HTTP 504 rate (%)" value={settings.detection.criticalPercent} onChange={v=>set('detection',{criticalPercent:v})}/>
    <NumberField label="Emergency HTTP 504 rate (%)" value={settings.detection.emergencyPercent} onChange={v=>set('detection',{emergencyPercent:v})}/>
    <NumberField label="Traffic baseline multiplier" value={settings.detection.trafficMultiplier} onChange={v=>set('detection',{trafficMultiplier:v})}/>
    <NumberField label="Heartbeat stale after (seconds)" value={settings.detection.heartbeatStaleSeconds} onChange={v=>set('detection',{heartbeatStaleSeconds:v})}/>
  </div>
  <Toggle title="Distributed crawler correlation" text="Correlate identity spread, unique paths, and traversal patterns." checked={settings.detection.distributedCrawlerCorrelation} onChange={v=>set('detection',{distributedCrawlerCorrelation:v})}/>
  <Toggle title="Application failure detection" text="Watch PHP saturation, slow stacks, and availability degradation." checked={settings.detection.applicationFailureDetection} onChange={v=>set('detection',{applicationFailureDetection:v})}/></>}
  {tab==='Notifications'&&<><Heading title="Notification channels" text="Choose where Guardian.US sends incident alerts and recovery updates."/>
  {settings.updatedAt===UNSAVED&&<div className="notice"><strong>Showing deployment defaults</strong><span>These values come from environment configuration (e.g. Docker/CloudFormation) and haven&apos;t been saved to this organization yet. Save once to make them explicit and editable independently of the deployment.</span></div>}
  <Toggle title="WhatsApp alerts" text="Two-way response through AWS End User Messaging Social." checked={settings.notifications.whatsappEnabled} onChange={v=>set('notifications',{whatsappEnabled:v})}/>
  <TextField label="WhatsApp sender ID" value={settings.notifications.whatsappSenderId} placeholder="+15550100000 — test number, replace with your production sender ID" onChange={v=>set('notifications',{whatsappSenderId:v})}/>
  <div className="test-row">
   <input placeholder="Test phone number, e.g. +15551234567" value={testWhatsapp} onChange={e=>setTestWhatsapp(e.target.value)}/>
   <button type="button" className="button" onClick={()=>sendTest('whatsapp',testWhatsapp,settings.notifications.whatsappSenderId)}>Send test</button>
   {testStatus.whatsapp&&<span className="muted small">{testStatus.whatsapp}</span>}
  </div>
  <Toggle title="Email reports" text="Deliver bounded forensic summaries through Amazon SES." checked={settings.notifications.emailEnabled} onChange={v=>set('notifications',{emailEnabled:v})}/>
  <TextField label="Notification recipients" value={settings.notifications.recipients} placeholder="ops@example.com, oncall@example.com" onChange={v=>set('notifications',{recipients:v})}/>
  <span className="muted small">Comma-separated — add as many recipients as you need.</span>
  <div className="test-row">
   <input placeholder="Test email address" value={testEmail} onChange={e=>setTestEmail(e.target.value)}/>
   <button type="button" className="button" onClick={()=>sendTest('email',testEmail)}>Send test</button>
   {testStatus.email&&<span className="muted small">{testStatus.email}</span>}
  </div></>}
  {tab==='Response'&&<><Heading title="Safe response policy" text="All actions are allowlisted, time-bounded, audited, and revalidated by the local agent."/>
  <Toggle title="Allow remote response requests" text="Operators may request predefined actions; arbitrary commands remain prohibited." checked={settings.response.allowRemoteRequests} onChange={v=>set('response',{allowRemoteRequests:v})}/>
  <Toggle title="Dry-run protection" text="Evaluate actions without changing firewall or web-server state." checked={settings.response.dryRun} onChange={v=>set('response',{dryRun:v})}/>
  <div className="form-grid"><NumberField label="Default action TTL (seconds)" value={settings.response.defaultTtlSeconds} onChange={v=>set('response',{defaultTtlSeconds:v})}/><NumberField label="Maximum action TTL (seconds)" value={settings.response.maxTtlSeconds} onChange={v=>set('response',{maxTtlSeconds:v})}/></div></>}
  {tab==='Data'&&<><Heading title="Evidence and privacy" text="Keep incident evidence bounded and free of unnecessary personal data."/>
  <div className="form-grid"><NumberField label="Evidence retention (days)" value={settings.privacy.evidenceRetentionDays} onChange={v=>set('privacy',{evidenceRetentionDays:v})}/><NumberField label="Maximum evidence lines" value={settings.privacy.maxEvidenceLines} onChange={v=>set('privacy',{maxEvidenceLines:v})}/></div>
  <Toggle title="Remove query values" text="Retain parameter names while discarding values." checked={settings.privacy.removeQueryValues} onChange={v=>set('privacy',{removeQueryValues:v})}/>
  <Toggle title="Fingerprint user agents" text="Store a stable fingerprint instead of raw user-agent strings." checked={settings.privacy.fingerprintUserAgents} onChange={v=>set('privacy',{fingerprintUserAgents:v})}/></>}
  {tab==='Billing'&&<BillingConsole/>}
  {tab==='Organizations'&&<OrganizationsConsole/>}
  {tab!=='Billing'&&tab!=='Organizations'&&<div className="settings-footer">{error?<span className="form-error">{error}</span>:<span className="muted small">Settings are saved to your organization and take effect immediately.</span>}<button className="button primary" onClick={save}>{saved?'Saved':'Save settings'}</button></div>}
 </div></section>;
}
function Heading({title,text}:{title:string;text:string}){return <div className="setting-heading"><h2>{title}</h2><p className="muted">{text}</p></div>}
function NumberField({label,value,onChange}:{label:string;value:number;onChange:(v:number)=>void}){return <label className="field">{label}<input type="number" value={value} onChange={e=>onChange(Number(e.target.value))}/></label>}
function TextField({label,value,placeholder,onChange}:{label:string;value:string;placeholder:string;onChange:(v:string)=>void}){return <label className="field">{label}<input value={value} placeholder={placeholder} onChange={e=>onChange(e.target.value)}/></label>}
function Toggle({title,text,checked,onChange}:{title:string;text:string;checked:boolean;onChange:(v:boolean)=>void}){return <label className="toggle-row"><span><strong>{title}</strong><small>{text}</small></span><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/></label>}
