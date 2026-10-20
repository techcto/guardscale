'use client';
import {useEffect, useState} from 'react';
import {useRouter,useSearchParams} from 'next/navigation';
import type {Settings} from '@/lib/model';
import BillingConsole from '@/app/billing/billing-console';
import OrganizationsConsole from '@/app/organizations/organizations-console';

const UNSAVED=new Date(0).toISOString();

export default function SettingsConsole({saas,isRoot,initialTab}:{saas:boolean;isRoot:boolean;initialTab?:string}){
 const router=useRouter(),queryTab=useSearchParams().get('tab');
 const [settings,setSettings]=useState<Settings|null>(null),[saved,setSaved]=useState(false),[error,setError]=useState(''),[tab,setTab]=useState(initialTab??queryTab??'Detection');
 const [testWhatsapp,setTestWhatsapp]=useState(''),[testEmail,setTestEmail]=useState(''),[testStatus,setTestStatus]=useState<Record<string,string>>({});
 const [purgeOpen,setPurgeOpen]=useState(false),[purgeConfirmation,setPurgeConfirmation]=useState(''),[purging,setPurging]=useState(false),[purgeStatus,setPurgeStatus]=useState('');
 async function purge(){setPurging(true);setPurgeStatus('');try{const r=await fetch('/api/v1/settings/purge',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({confirmation:purgeConfirmation})});const data=await r.json();if(!r.ok)throw new Error(data.error??'Unable to purge data');setPurgeStatus(`Removed ${data.events} activity records and ${data.incidents} incidents. New logs can continue arriving.`);setPurgeOpen(false);setPurgeConfirmation('')}catch(e){setPurgeStatus(e instanceof Error?e.message:'Unable to purge data')}finally{setPurging(false)}}
 const tabs=['Detection','Notifications','Response','Data',...(saas?['Billing']:[]),...(saas&&isRoot?['Organizations']:[])];
 useEffect(()=>{let active=true;fetch('/api/v1/settings').then(r=>r.ok?r.json():null).then(data=>{if(active&&data)setSettings(data)});return()=>{active=false}},[]);
 async function save(){if(!settings)return;setError('');const r=await fetch('/api/v1/settings',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(settings)});if(!r.ok){setError((await r.json()).error??'Unable to save settings');return}setSettings(await r.json());setSaved(true);setTimeout(()=>setSaved(false),1800)}
 async function sendTest(channel:'whatsapp'|'email',destination:string,originationId?:string){
  if(!destination){setTestStatus(s=>({...s,[channel]:'Enter a destination first.'}));return}
  setTestStatus(s=>({...s,[channel]:'Sending…'}));
  const r=await fetch('/api/v1/settings/test-notification',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({channel,destination,originationId})});
  const body=await r.json().catch(()=>({}));
  setTestStatus(s=>({...s,[channel]:r.ok?(body.message??'Provider accepted; delivery not yet confirmed.'):(body.error??'Unable to send test notification.')}));
 }
 if(!settings)return <div className="settings-layout"><aside className="settings-tabs">{tabs.map(x=><button key={x} disabled>{x}</button>)}</aside><div className="g-card settings-panel"><p className="muted">Loading settings…</p></div></div>;
 const policy=settings.response.autoGuardian??{enabled:false,waitSeconds:120,maxTtlSeconds:60,maxActionsPerHour:3};
 const set=<K extends keyof Settings>(group:K,patch:Partial<Settings[K]>)=>setSettings(s=>s&&({...s,[group]:{...(s[group] as object),...patch}}));
 function selectTab(next:string){setTab(next);router.replace(next==='Billing'?'/settings/billing':`/settings?tab=${encodeURIComponent(next)}`)}
 return <section className="settings-layout"><aside className="settings-tabs">{tabs.map(x=><button className={tab===x?'active':''} onClick={()=>selectTab(x)} key={x}>{x}</button>)}</aside><div className="g-card settings-panel">
  {tab==='Detection'&&<><Heading title="Detection thresholds" text="Tune when coordinated traffic and application failures become an incident."/><div className="form-grid">
    <NumberField label="Warning HTTP 504 rate (%)" value={settings.detection.warningPercent} onChange={v=>set('detection',{warningPercent:v})}/>
    <NumberField label="Critical HTTP 504 rate (%)" value={settings.detection.criticalPercent} onChange={v=>set('detection',{criticalPercent:v})}/>
    <NumberField label="Emergency HTTP 504 rate (%)" value={settings.detection.emergencyPercent} onChange={v=>set('detection',{emergencyPercent:v})}/>
    <NumberField label="Traffic baseline multiplier" value={settings.detection.trafficMultiplier} onChange={v=>set('detection',{trafficMultiplier:v})}/>
    <NumberField label="Heartbeat stale after (seconds)" value={settings.detection.heartbeatStaleSeconds} onChange={v=>set('detection',{heartbeatStaleSeconds:v})}/>
  </div>
  <Toggle title="Distributed crawler correlation" text="Correlate identity spread, unique paths, and traversal patterns." checked={settings.detection.distributedCrawlerCorrelation} onChange={v=>set('detection',{distributedCrawlerCorrelation:v})}/>
  <Toggle title="Application failure detection" text="Watch PHP saturation, slow stacks, and availability degradation." checked={settings.detection.applicationFailureDetection} onChange={v=>set('detection',{applicationFailureDetection:v})}/></>}
  {tab==='Notifications'&&<><Heading title="Notification channels" text="Choose where GuardScale sends incident alerts and recovery updates."/>
  {settings.updatedAt===UNSAVED&&<div className="notice"><strong>Showing deployment defaults</strong><span>These values come from environment configuration (e.g. Docker/CloudFormation) and haven&apos;t been saved to this organization yet. Save once to make them explicit and editable independently of the deployment.</span></div>}
  <Toggle title="WhatsApp alerts" text="Two-way response through AWS End User Messaging Social." checked={settings.notifications.whatsappEnabled} onChange={v=>set('notifications',{whatsappEnabled:v})}/>
  <p className="muted small">WhatsApp sender and email From address are configured at launch through CloudFormation. Manage recipients here.</p>
  <div className="test-row">
   <input placeholder="Test phone number, e.g. +15551234567" value={testWhatsapp} onChange={e=>setTestWhatsapp(e.target.value)}/>
   <button type="button" className="button" onClick={()=>sendTest('whatsapp',testWhatsapp,settings.notifications.whatsappSenderId)}>Send test</button>
   {testStatus.whatsapp&&<span className="muted small">{testStatus.whatsapp}</span>}
  </div>
  <Toggle title="Email reports" text="Deliver bounded forensic summaries through Amazon SES." checked={settings.notifications.emailEnabled} onChange={v=>set('notifications',{emailEnabled:v})}/>
  <TextField label="Notification recipients" value={settings.notifications.recipients} placeholder="ops@example.com, +15551234567" onChange={v=>set('notifications',{recipients:v})}/>
  <span className="muted small">Comma-separated email addresses and WhatsApp numbers in international format. Only configured recipients may reply to incidents.</span>
  <div className="test-row">
   <input placeholder="Test email address" value={testEmail} onChange={e=>setTestEmail(e.target.value)}/>
   <button type="button" className="button" onClick={()=>sendTest('email',testEmail)}>Send test</button>
   {testStatus.email&&<span className="muted small">{testStatus.email}</span>}
  </div></>}
  {tab==='Response'&&<><Heading title="Safe response policy" text="All actions are allowlisted, time-bounded, audited, and revalidated by the local agent."/>
  <Toggle title="Allow remote response requests" text="Operators may request predefined actions; arbitrary commands remain prohibited." checked={settings.response.allowRemoteRequests} onChange={v=>set('response',{allowRemoteRequests:v})}/>
  <Toggle title="Dry-run protection" text="Evaluate actions without changing firewall or web-server state." checked={settings.response.dryRun} onChange={v=>set('response',{dryRun:v})}/>
  <div className="form-grid"><NumberField label="Default action TTL (seconds)" value={settings.response.defaultTtlSeconds} onChange={v=>set('response',{defaultTtlSeconds:v})}/><NumberField label="Maximum action TTL (seconds)" value={settings.response.maxTtlSeconds} onChange={v=>set('response',{maxTtlSeconds:v})}/></div></>}
  {tab==='Response'&&<><hr/><h3>Auto Guardian (standing approval)</h3><p className="muted">Disabled by default. After an alert and a 60–600 second response window, permit a short HTTP(S) block only when Guardian completed real agent inspection, recommends Protect, and measured findings include a critical condition. Agent target restrictions still apply. No shell commands or service restarts. Requires the queue worker and verified notification delivery.</p><Toggle title="Allow unattended temporary protection" text="Explicitly pre-authorize this bounded policy when no operator responds." checked={policy.enabled} onChange={enabled=>set('response',{autoGuardian:{...policy,enabled}})}/><div className="form-grid"><NumberField label="Wait for human reply (60–600 seconds)" value={policy.waitSeconds} onChange={waitSeconds=>set('response',{autoGuardian:{...policy,waitSeconds}})}/><NumberField label="Automatic block TTL (10–120 seconds)" value={policy.maxTtlSeconds} onChange={maxTtlSeconds=>set('response',{autoGuardian:{...policy,maxTtlSeconds}})}/><NumberField label="Maximum automatic actions per hour (1–3)" value={policy.maxActionsPerHour} onChange={maxActionsPerHour=>set('response',{autoGuardian:{...policy,maxActionsPerHour}})}/></div></>}
  {tab==='Data'&&<><Heading title="Evidence and privacy" text="Keep incident evidence bounded and free of unnecessary personal data."/>
  <div className="form-grid"><NumberField label="Evidence retention (days)" value={settings.privacy.evidenceRetentionDays} onChange={v=>set('privacy',{evidenceRetentionDays:v})}/><NumberField label="Maximum evidence lines" value={settings.privacy.maxEvidenceLines} onChange={v=>set('privacy',{maxEvidenceLines:v})}/></div>
  <Toggle title="Remove query values" text="Retain parameter names while discarding values." checked={settings.privacy.removeQueryValues} onChange={v=>set('privacy',{removeQueryValues:v})}/>
  <Toggle title="Fingerprint user agents" text="Store a stable fingerprint instead of raw user-agent strings." checked={settings.privacy.fingerprintUserAgents} onChange={v=>set('privacy',{fingerprintUserAgents:v})}/>
  <hr/><h3>Purge collected data</h3><p className="muted">Permanently clear stored activity and incident records for the active organization, including removed servers. Organizations, servers, users, billing, and settings remain. Collection continues, so new records may appear immediately. This does not erase logs or queued uploads on your servers, delivered notifications, infrastructure logs, or backups.</p>
  {!purgeOpen?<button className="button" onClick={()=>setPurgeOpen(true)}>Purge collected data…</button>:<div role="group" aria-label="Confirm data purge"><label className="field">This cannot be undone. Type PURGE to confirm<input autoComplete="off" value={purgeConfirmation} onChange={e=>setPurgeConfirmation(e.target.value)}/></label><button className="button" disabled={purging} onClick={()=>{setPurgeOpen(false);setPurgeConfirmation('')}}>Cancel</button> <button className="button" disabled={purging||purgeConfirmation!=='PURGE'} onClick={purge}>{purging?'Purging…':'Permanently purge collected data'}</button></div>}{purgeStatus&&<p role="status">{purgeStatus}</p>}</>}
  {tab==='Billing'&&<BillingConsole/>}
  {tab==='Organizations'&&<OrganizationsConsole/>}
  {tab!=='Billing'&&tab!=='Organizations'&&<div className="settings-footer">{error?<span className="form-error">{error}</span>:<span className="muted small">Settings are saved to your organization and take effect immediately.</span>}<button className="button primary" onClick={save}>{saved?'Saved':'Save settings'}</button></div>}
 </div></section>;
}
function Heading({title,text}:{title:string;text:string}){return <div className="setting-heading"><h2>{title}</h2><p className="muted">{text}</p></div>}
function NumberField({label,value,onChange}:{label:string;value:number;onChange:(v:number)=>void}){return <label className="field">{label}<input type="number" value={value} onChange={e=>onChange(Number(e.target.value))}/></label>}
function TextField({label,value,placeholder,onChange}:{label:string;value:string;placeholder:string;onChange:(v:string)=>void}){return <label className="field">{label}<input value={value} placeholder={placeholder} onChange={e=>onChange(e.target.value)}/></label>}
function Toggle({title,text,checked,onChange}:{title:string;text:string;checked:boolean;onChange:(v:boolean)=>void}){return <label className="toggle-row"><span><strong>{title}</strong><small>{text}</small></span><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/></label>}
