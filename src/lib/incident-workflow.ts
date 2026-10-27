import {createHmac} from 'node:crypto';
import {SQSClient,SendMessageCommand} from '@aws-sdk/client-sqs';
import {store} from './store';
import {notifier,whatsappOrigination} from './notifications';
import {acceptSetupReply,senderMatches} from './whatsapp-setup';
import {approveProtection,commandsFor,cancelIncidentProtection} from './protection-commands';
import {assessWithGuardian,type GuardianAssessment} from './guardian';
import {incidentAlert} from './incident-alert';
type Payload={candidate_id?:string;source_ip?:string;country?:string;findings?:unknown;analysis?:GuardianAssessment;notified?:string[];alertedAt?:string;alertDelivery?:'provider_accepted'|'local_only'};
function approvalCode(orgId:string,id:string){const secret=process.env.GUARDSCALE_SESSION_SECRET;if(!secret)throw Error('Approval signing is not configured');return createHmac('sha256',secret).update(orgId+':'+id).digest('hex').slice(0,16);}
export async function enqueueIncident(orgId:string,incidentId:string){
 if(process.env.GUARDSCALE_QUEUE_URL)await new SQSClient({endpoint:process.env.GUARDSCALE_QUEUE_ENDPOINT}).send(new SendMessageCommand({QueueUrl:process.env.GUARDSCALE_QUEUE_URL,MessageBody:JSON.stringify({kind:'incident',orgId,incidentId})}));
 else await processIncident(orgId,incidentId);
}
export async function processIncident(orgId:string,incidentId:string){
 const incident=await store.incident(orgId,incidentId);if(!incident||incident.state==='resolved')return;
 const payload=incident.payload as Payload;
 if(!payload.analysis){
  payload.analysis=await assessWithGuardian(orgId,incidentId,payload.findings??[]);
  const current=await store.incident(orgId,incidentId);if(!current)return;
  await store.putIncident({...current,payload:{...(current.payload as Payload),...payload},updatedAt:new Date().toISOString()});
  if(current.state==='resolved')return;
 }
 const settings=await store.settings(orgId);
 const recipients=settings.notifications.recipients.split(/[\s,;]+/).filter(Boolean).slice(0,20);
 const code=approvalCode(orgId,incidentId);
 const server=await store.node(orgId,incident.serverId);
 const websites=server?.websiteUrls?.slice(0,3).map(url=>url.slice(0,200)).join('\n');
 const base=process.env.GUARDSCALE_PUBLIC_URL;
 const link=base&&/^https?:\/\//.test(base)?base.replace(/\/$/,'')+'/incidents/'+encodeURIComponent(incidentId):'Open this incident in GuardScale.';
 // User-authorized payload/destinations: organization-admin configured recipients only.
 payload.notified??=[];
 for(const destination of recipients){
  const channel=destination.includes('@')?'email':'whatsapp';
  if(channel==='email'?!settings.notifications.emailEnabled:!settings.notifications.whatsappEnabled)continue;
  const key=createHmac('sha256',process.env.GUARDSCALE_SESSION_SECRET!).update(channel+destination+':'+(process.env.GUARDSCALE_NOTIFICATION_MODE??'log')).digest('hex');if(payload.notified.includes(key))continue;
  const text=incidentAlert({server:server?.displayName||incident.serverId,source:payload.source_ip,country:payload.country,detectedAt:incident.startedAt,analysisStatus:payload.analysis.status,summary:payload.analysis.summary,reviewUrl:link,websites:websites?.split('\n'),code,blockSeconds:Math.min(settings.response.defaultTtlSeconds,settings.response.maxTtlSeconds,900)},channel);
  const messageId=await notifier().send({channel,destination,originationId:settings.notifications.whatsappSenderId||undefined,subject:'GuardScale: review server activity',text});
  payload.notified.push(key);payload.alertDelivery=process.env.GUARDSCALE_NOTIFICATION_MODE==='aws'?'provider_accepted':'local_only';payload.alertedAt??=new Date().toISOString();const current=await store.incident(orgId,incidentId);if(!current)return;await store.putIncident({...current,payload:{...(current.payload as Payload),...payload},updatedAt:new Date().toISOString()});
  await store.putEvent({id:'notification-'+incidentId+'-'+key,tenantId:orgId,serverId:incident.serverId,agentId:incident.agentId,type:'notification.sent',at:new Date().toISOString(),metadata:{channel,message_id:messageId,delivery:process.env.GUARDSCALE_NOTIFICATION_MODE==='aws'?'provider_accepted':'local_only'}});
 }
}
const phone=(s:string)=>s.replace(/\D/g,'');
// Trusted SQS worker only; no public inbound approval webhook.
export async function processWhatsAppEnvelope(envelope:unknown){
 const outer=envelope as {context?:{MetaPhoneNumberIds?:{arn?:string}[]};whatsAppWebhookEntry?:string};
 if(typeof outer.whatsAppWebhookEntry!=='string')return false;
 const entry=JSON.parse(outer.whatsAppWebhookEntry) as {changes?:{value?:{messages?:{id?:string;from?:string;timestamp?:string;type?:string;text?:{body?:string}}[]}}[]};
 for(const change of entry.changes??[])for(const message of change.value?.messages??[]){
  if(message.type!=='text'||!message.from||!message.id||!Number.isFinite(Number(message.timestamp))||Math.abs(Date.now()-Number(message.timestamp)*1000)>5*60000)continue;
  const body=message.text?.body?.trim()??'';
  const setup=/^Verify\s+(\S+)$/i.exec(body);
  if(setup){await acceptSetupReply(setup[1],message.from,(outer.context?.MetaPhoneNumberIds??[]).flatMap(v=>v.arn?[v.arn]:[]));continue}
  const match=/^(Protect|Watch|Dismiss)(?:\s+([a-f0-9]{16}))?$/i.exec(body);if(!match)continue;
  const candidates:{orgId:string;incident:Awaited<ReturnType<typeof store.incidents>>[number];origin:string}[]=[];
  for(const org of await store.organizations()){
   const settings=await store.settings(org.id);
   if(!settings.notifications.whatsappEnabled||!settings.notifications.recipients.split(/[\s,;]+/).some(v=>!v.includes('@')&&phone(v)===phone(message.from!)))continue;
   let origin:string;try{origin=whatsappOrigination({originationId:settings.notifications.whatsappSenderId})}catch{continue}
   if(!origin||!senderMatches(origin,(outer.context?.MetaPhoneNumberIds??[]).flatMap(v=>v.arn?[v.arn]:[])))continue;
   for(const incident of await store.incidents(org.id)){
    const age=Date.now()-Date.parse(incident.startedAt);if(!Number.isFinite(age)||age<0||age>15*60000)continue;
    if(match[2]){if(approvalCode(org.id,incident.incidentId)!==match[2].toLowerCase())continue;}
    else{
     if(incident.state==='resolved')continue;
     const key=createHmac('sha256',process.env.GUARDSCALE_SESSION_SECRET!).update('whatsapp'+settings.notifications.recipients.split(/[\s,;]+/).find(v=>!v.includes('@')&&phone(v)===phone(message.from!))+':'+(process.env.GUARDSCALE_NOTIFICATION_MODE??'log')).digest('hex');
     if(!(incident.payload as Payload).notified?.includes(key))continue;
    }
    candidates.push({orgId:org.id,incident,origin});
   }
  }
  if(candidates.length!==1){
   if(candidates.length>1)await notifier().send({channel:'whatsapp',destination:message.from,subject:'GuardScale: choose an incident',text:'More than one current alert needs review. Reply with the Protect, Watch or Dismiss line including the code from the intended alert, or choose the incident in your authenticated console. No new block was requested.'});
   continue;
  }
  const {orgId,incident,origin}=candidates[0],action=match[1].toLowerCase();
  let confirmation=`${action==='watch'?'Monitoring continues':'Incident dismissed'} for ${incident.serverId}. No new block was added; an existing block retains its original expiry.`;
  if(action==='protect'){
   const command=await approveProtection(orgId,incident.incidentId,'whatsapp:'+phone(message.from));
   confirmation=`Protection ${command.status==='applied'?'already active':'requested'} for ${incident.serverId}. Source: ${(incident.payload as Payload).source_ip??'agent-observed source'}. Expires: ${command.expiresAt}. ${command.status==='applied'?'The agent has confirmed the rule.':'Waiting for the server agent to confirm the HTTP(S) block.'}`;
  }else {
   await store.putIncident({...incident,state:action==='watch'?'watch':'resolved',updatedAt:new Date().toISOString()});
   if(action==='dismiss'){
    const pending=await cancelIncidentProtection(orgId,incident.incidentId);
    confirmation=`Dismissed ${incident.serverId}. Automatic extensions for this incident are stopped. ${pending?'Removal of its protection rule is requested; the server agent will confirm when it is removed.':'No active protection rule remains for this incident.'}`;
   }
  }
  await store.putEvent({id:'reply-'+message.id,tenantId:orgId,serverId:incident.serverId,agentId:incident.agentId,type:'response.received',at:new Date().toISOString(),metadata:{option:action,channel:'whatsapp',incident_id:incident.incidentId}});
  await notifier().send({channel:'whatsapp',destination:message.from,originationId:origin,subject:'GuardScale response',text:confirmation});
 }
 return true;
}

export async function enqueueProtectionOutcome(orgId:string,commandId:string){
 if(process.env.GUARDSCALE_QUEUE_URL)await new SQSClient({endpoint:process.env.GUARDSCALE_QUEUE_ENDPOINT}).send(new SendMessageCommand({QueueUrl:process.env.GUARDSCALE_QUEUE_URL,MessageBody:JSON.stringify({kind:'protection-outcome',orgId,commandId})}));
 else await notifyProtectionOutcome(orgId,commandId);
}
export async function notifyProtectionOutcome(orgId:string,commandId:string,renewal=false){
 const command=(await commandsFor(orgId)).find(c=>c.id===commandId);if(!command||command.kind==='inspect_server')return;
 const settings=await store.settings(orgId);
 const incident=await store.incident(orgId,command.incidentId);
 const source=(incident?.payload as Payload|undefined)?.source_ip??'agent-observed source';
 const text=command.status==='cancelled'?`*Protection removed*\n\nServer: ${command.serverId}\nSource IP: ${source}\nThe agent confirmed removal of this incident's HTTP(S) source block. Automatic extensions for this incident are stopped. Monitoring continues.`:command.status==='applied'?`${renewal?'*Protection extended*':'*Protected*'}\n\nServer: ${command.serverId}\nSource IP: ${source}\nRule: temporary HTTP(S) source block\nDuration: ${Math.round((Date.parse(command.expiresAt)-Date.parse(command.createdAt))/1000)} seconds\nExpires: ${command.expiresAt}\n\nThe server agent confirmed the rule is active. This is a temporary source block, not a guarantee that all attacks have stopped.`:command.status==='expired'?`*Protection expired*\n\nServer: ${command.serverId}\nSource IP: ${source}\nThe temporary HTTP(S) block has expired. Monitoring continues.`:`GuardScale ${command.serverId}: protection ${command.status}. Source: ${source}. Review the incident in your authenticated console; no active block is confirmed by this status.`;
 for(const destination of settings.notifications.recipients.split(/[\s,;]+/).filter(Boolean).slice(0,20)){
  const channel=destination.includes('@')?'email':'whatsapp';if(channel==='email'?!settings.notifications.emailEnabled:!settings.notifications.whatsappEnabled)continue;
  await notifier().send({channel,destination,originationId:settings.notifications.whatsappSenderId||undefined,subject:'GuardScale protection '+command.status,text});
 }
}
