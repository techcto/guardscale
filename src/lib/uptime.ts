import {randomUUID} from 'node:crypto';
import {store} from './store';
import {uptimeStore} from './uptime-store';
import {probeWebsite,monitorURL} from './uptime-probe';
import {uptimeLimits,type UptimeMonitor,type UptimeSample} from './uptime-model';
import {notifier,whatsappOrigination} from './notifications';
import {setupNode,setupFingerprint} from './whatsapp-setup';

export async function uptimeRecipients(orgId:string){
 const members=await store.membersOfOrg(orgId);
 return members.filter(({membership,user})=>membership.status==='active'&&user.status==='active'&&user.email&&(process.env.GUARDSCALE_DEPLOYMENT_MODE==='saas'?user.emailVerified===true:user.emailVerified!==false))
  .map(({user})=>({id:user.id,name:user.displayName,email:user.email!}));
}
export async function uptimeWhatsAppRecipients(orgId:string){
 const settings=await store.settings(orgId);if(!settings.notifications.whatsappEnabled)return [];
 let origin:string;try{origin=whatsappOrigination({})}catch{return []}
 const verified=await store.eventsForNode(orgId,setupNode);
 return settings.notifications.recipients.split(/[\s,;]+/).filter(p=>/^\+[1-9]\d{7,14}$/.test(p)&&verified.some(e=>e.type==='whatsapp.setup.verified'&&e.metadata?.fingerprint===setupFingerprint(p,origin))).slice(0,20);
}
export async function validateMonitor(orgId:string,input:unknown){
 if(!input||typeof input!=='object')throw Error('Invalid monitor');
 const v=input as Record<string,unknown>;
 if(typeof v.name!=='string'||!v.name.trim()||v.name.length>100)throw Error('Enter a check name of 1–100 characters');
 const url=monitorURL(v.url).href;
 if(typeof v.intervalSeconds!=='number'||!uptimeLimits.intervals.includes(v.intervalSeconds))throw Error('Choose a 1, 5 or 15 minute interval');
 if(!Array.isArray(v.recipientIds)||v.recipientIds.length>20||v.recipientIds.some(id=>typeof id!=='string'))throw Error('Choose approved workspace users');
 const allowed=await uptimeRecipients(orgId);
 if(v.recipientIds.some(id=>!allowed.some(u=>u.id===id)))throw Error('Recipients must be active, approved users with verified email addresses');
 if(!Array.isArray(v.tags)||v.tags.length>10||v.tags.some(t=>typeof t!=='string'||t.length>50))throw Error('Use at most 10 tags of 50 characters');
 return {name:v.name.trim(),url,intervalSeconds:v.intervalSeconds,recipientIds:[...new Set(v.recipientIds as string[])],whatsapp:v.whatsapp===true,tags:[...new Set((v.tags as string[]).map(t=>t.trim()).filter(Boolean))],paused:v.paused===true};
}

export function recordUptimeSample(m:UptimeMonitor,sample:UptimeSample):UptimeMonitor{
 const next=structuredClone(m);
 next.samples=[...next.samples,sample].filter(s=>Date.parse(s.at)>=Date.parse(sample.at)-86400000).slice(-uptimeLimits.samples);
 next.failures=sample.ok?0:next.failures+1;next.successes=sample.ok?next.successes+1:0;
 next.updatedAt=sample.at;next.nextCheckAt=new Date(Date.parse(sample.at)+m.intervalSeconds*1000).toISOString();
 if(!sample.ok&&next.failures>=2&&next.state!=='down'){
  const incidentId=randomUUID();next.state='down';next.stateSince=sample.at;next.activeIncidentId=incidentId;
  next.outages=[...next.outages,{incidentId,startedAt:sample.at}].slice(-50);
  next.notices.push({id:randomUUID(),incidentId,kind:'down',at:sample.at,sent:[],sample});
 }else if(sample.ok&&(next.state==='unknown'||next.state==='down'&&next.successes>=2)){
  if(next.activeIncidentId){
   const incidentId=next.activeIncidentId;next.notices.push({id:randomUUID(),incidentId,kind:'recovered',at:sample.at,sent:[],sample});
   next.outages=next.outages.map(o=>o.incidentId===incidentId?{...o,resolvedAt:sample.at}:o);delete next.activeIncidentId;
  }
  next.state='up';next.stateSince=sample.at;
 }
 // Keep unsent state transitions bounded even during a long provider outage.
 next.notices=next.notices.slice(-10);
 return next;
}

async function deliverUptimeNotices(m:UptimeMonitor){
 const settings=await store.settings(m.orgId),users=await uptimeRecipients(m.orgId);
 const destinations=[...(settings.notifications.emailEnabled?users.filter(u=>m.recipientIds.includes(u.id)).map(u=>({channel:'email' as const,destination:u.email})):[]),
  ...(m.whatsapp?(await uptimeWhatsAppRecipients(m.orgId)).map(destination=>({channel:'whatsapp' as const,destination})):[])];
 const pending:typeof m.notices=[];
 for(const notice of m.notices){
  const existing=await store.incident(m.orgId,notice.incidentId);
  const last=notice.sample??m.samples.find(s=>s.at===notice.at)??m.samples.at(-1);
  if(notice.kind==='down'&&!existing)await store.putIncident({tenantId:m.orgId,serverId:'uptime:'+m.id,agentId:'uptime-worker',incidentId:notice.incidentId,state:'review',startedAt:notice.at,updatedAt:notice.at,
   payload:{kind:'uptime',monitorId:m.id,monitorName:m.name,url:m.url,findings:[{name:'UptimeDown',severity:'high',evidence:[`Two consecutive HTTP(S) checks failed for ${m.url}.`,last?.statusCode?`Last HTTP status: ${last.statusCode}`:last?.error??'Endpoint did not return a successful response.'],metrics:{}}]}});
  if(notice.kind==='recovered'&&existing)await store.putIncident({...existing,state:'resolved',updatedAt:notice.at,payload:{...existing.payload as object,recoveredAt:notice.at}});
  const reviewUrl=process.env.GUARDSCALE_PUBLIC_URL?new URL('/incidents/'+notice.incidentId,process.env.GUARDSCALE_PUBLIC_URL).href:undefined;
  const text=`GuardScale | ${notice.kind==='down'?'Website down':'Website recovered'}\n\n${m.name}\n${m.url}\n\n${notice.kind==='down'?'Two consecutive checks failed. Review the incident and investigate the website. No protection rule was requested.':'Two consecutive checks succeeded. The outage incident has been resolved.'}\nChecked from: ${process.env.AWS_REGION??'the deployment region'}\nDetected: ${notice.at}${reviewUrl?'\n\nReview incident: '+reviewUrl:''}`;
  for(const {channel,destination} of destinations){
   const key=channel+':'+destination;if(notice.sent.includes(key))continue;
   try{await notifier().send({channel,destination,subject:`GuardScale: ${notice.kind==='down'?'DOWN':'RECOVERED'} — ${m.name}`,text,reviewUrl});notice.sent.push(key);}catch{ /* Retain this destination for the next worker cycle. */ }
  }
  if(destinations.some(d=>!notice.sent.includes(d.channel+':'+d.destination)))pending.push(notice);
 }
 m.notices=pending;return m;
}

let cycling=false;
export async function runUptimeCycle(probe=probeWebsite){
 if(cycling)return;cycling=true;
 try{
  for(const org of await store.organizations()){
   const monitors=await uptimeStore.list(org.id);
   // The per-monitor conditional lease prevents duplicate checks across workers.
   for(let offset=0;offset<monitors.length;offset+=5)await Promise.all(monitors.slice(offset,offset+5).map(async m=>{
    if(m.paused||Date.parse(m.nextCheckAt)>Date.now()&&!m.notices.length)return;
    const owner=randomUUID();if(!await uptimeStore.claim(m,owner,Date.now()))return;
    try{
     let next=m;
     if(Date.parse(m.nextCheckAt)<=Date.now())next=recordUptimeSample(m,await probe(m.url));
     // Persist transitions before attempting delivery, so a worker restart retries them.
     if(!await uptimeStore.save(next,m.revision,owner))return;
     const current=await uptimeStore.get(org.id,m.id);if(!current?.notices.length||current.paused)return;
     if(!await uptimeStore.claim(current,owner,Date.now()))return;
     await uptimeStore.save(await deliverUptimeNotices(current),current.revision,owner);
    }catch{console.error(JSON.stringify({level:'error',message:'Uptime check deferred',monitorId:m.id}));}
   }));
  }
 }finally{cycling=false;}
}
