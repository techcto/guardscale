import {createHmac} from 'node:crypto';
import {SQSClient,SendMessageCommand} from '@aws-sdk/client-sqs';
import {store} from './store';
import {notifier,whatsappOrigination} from './notifications';
import {acceptSetupReply,senderMatches} from './whatsapp-setup';
import {approveProtection,commandsFor} from './protection-commands';
import {assessWithGuardian,type GuardianAssessment} from './guardian';
type Payload={candidate_id?:string;source_ip?:string;country?:string;findings?:unknown;analysis?:GuardianAssessment;notified?:string[];alertedAt?:string;alertDelivery?:'provider_accepted'|'local_only'};
function approvalCode(orgId:string,id:string){const secret=process.env.GUARDSCALE_SESSION_SECRET;if(!secret)throw Error('Approval signing is not configured');return createHmac('sha256',secret).update(orgId+':'+id).digest('hex').slice(0,16);}
export async function enqueueIncident(orgId:string,incidentId:string){
 if(process.env.GUARDSCALE_QUEUE_URL)await new SQSClient({endpoint:process.env.GUARDSCALE_QUEUE_ENDPOINT}).send(new SendMessageCommand({QueueUrl:process.env.GUARDSCALE_QUEUE_URL,MessageBody:JSON.stringify({kind:'incident',orgId,incidentId})}));
 else await processIncident(orgId,incidentId);
}
export async function processIncident(orgId:string,incidentId:string){
 const incident=await store.incident(orgId,incidentId);if(!incident)return;
 const payload=incident.payload as Payload;
 if(!payload.analysis){
  payload.analysis=await assessWithGuardian(orgId,incidentId,payload.findings??[]);
  await store.putIncident({...incident,payload,updatedAt:new Date().toISOString()});
 }
 const settings=await store.settings(orgId);
 const recipients=settings.notifications.recipients.split(/[\s,;]+/).filter(Boolean).slice(0,20);
 const code=approvalCode(orgId,incidentId);
 const server=await store.node(orgId,incident.serverId);
 const websites=server?.websiteUrls?.slice(0,3).map(url=>url.slice(0,200)).join('\n');
 const base=process.env.GUARDSCALE_PUBLIC_URL;
 const link=base&&/^https?:\/\//.test(base)?base.replace(/\/$/,'')+'/incidents/'+encodeURIComponent(incidentId):'Open this incident in GuardScale.';
 // User-authorized payload/destinations: organization-admin configured recipients only.
 const text=`GuardScale: review ${incident.serverId.slice(0,100)}. Source: ${payload.source_ip??'not supplied'}; country: ${payload.country??'unknown (no geolocation source configured)'}.\nAI ${payload.analysis.status}: ${payload.analysis.summary?.slice(0,250)??'Review measured findings in the console.'}\n${link}${websites?`\nWebsites:\n${websites}`:''}\nWhatsApp: Protect ${code}, Watch ${code}, or Dismiss ${code}. Protect requests a temporary HTTP(S) block of the agent-observed candidate. Approval expires 15 minutes after detection. Email: use the authenticated console; direct email replies are not implemented.`;
 payload.notified??=[];
 for(const destination of recipients){
  const channel=destination.includes('@')?'email':'whatsapp';
  if(channel==='email'?!settings.notifications.emailEnabled:!settings.notifications.whatsappEnabled)continue;
  const key=createHmac('sha256',process.env.GUARDSCALE_SESSION_SECRET!).update(channel+destination+':'+(process.env.GUARDSCALE_NOTIFICATION_MODE??'log')).digest('hex');if(payload.notified.includes(key))continue;
  const messageId=await notifier().send({channel,destination,originationId:settings.notifications.whatsappSenderId||undefined,subject:'GuardScale: review server activity',text});
  payload.notified.push(key);payload.alertDelivery=process.env.GUARDSCALE_NOTIFICATION_MODE==='aws'?'provider_accepted':'local_only';payload.alertedAt??=new Date().toISOString();await store.putIncident({...incident,payload,updatedAt:new Date().toISOString()});
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
  const match=/^(Protect|Watch|Dismiss)\s+([a-f0-9]{16})$/i.exec(body);if(!match)continue;
  for(const org of await store.organizations()){
   const settings=await store.settings(org.id);
   if(!settings.notifications.whatsappEnabled||!settings.notifications.recipients.split(/[\s,;]+/).some(v=>!v.includes('@')&&phone(v)===phone(message.from!)))continue;
   let origin:string;try{origin=whatsappOrigination({originationId:settings.notifications.whatsappSenderId})}catch{continue}
   if(!origin||!senderMatches(origin,(outer.context?.MetaPhoneNumberIds??[]).flatMap(v=>v.arn?[v.arn]:[])))continue;
   for(const incident of await store.incidents(org.id)){
    if(Date.now()-Date.parse(incident.startedAt)>15*60000||approvalCode(org.id,incident.incidentId)!==match[2].toLowerCase())continue;
    let confirmation='Review state updated; an existing block, if any, retains its original expiry.';
    if(match[1].toLowerCase()==='protect'){const command=await approveProtection(org.id,incident.incidentId,'whatsapp:'+phone(message.from));confirmation=`Protect ${command.status}; expires ${command.expiresAt}. Application is confirmed only when the agent reports it.`;}
    else await store.putIncident({...incident,state:match[1].toLowerCase()==='watch'?'watch':'resolved',updatedAt:new Date().toISOString()});
    await store.putEvent({id:'reply-'+message.id,tenantId:org.id,serverId:incident.serverId,agentId:incident.agentId,type:'response.received',at:new Date().toISOString(),metadata:{option:match[1].toLowerCase()}});
    await notifier().send({channel:'whatsapp',destination:message.from,originationId:origin,subject:'GuardScale response',text:confirmation});
   }
  }
 }
 return true;
}

export async function enqueueProtectionOutcome(orgId:string,commandId:string){
 if(process.env.GUARDSCALE_QUEUE_URL)await new SQSClient({endpoint:process.env.GUARDSCALE_QUEUE_ENDPOINT}).send(new SendMessageCommand({QueueUrl:process.env.GUARDSCALE_QUEUE_URL,MessageBody:JSON.stringify({kind:'protection-outcome',orgId,commandId})}));
 else await notifyProtectionOutcome(orgId,commandId);
}
export async function notifyProtectionOutcome(orgId:string,commandId:string){
 const command=(await commandsFor(orgId)).find(c=>c.id===commandId);if(!command||command.kind==='inspect_server')return;
 const settings=await store.settings(orgId);
 for(const destination of settings.notifications.recipients.split(/[\s,;]+/).filter(Boolean).slice(0,20)){
  const channel=destination.includes('@')?'email':'whatsapp';if(channel==='email'?!settings.notifications.emailEnabled:!settings.notifications.whatsappEnabled)continue;
  await notifier().send({channel,destination,originationId:settings.notifications.whatsappSenderId||undefined,subject:'GuardScale protection '+command.status,text:`GuardScale ${command.serverId}: agent reports protection ${command.status}. Command expires ${command.expiresAt}. Review incident ${command.incidentId} in your authenticated console. This is the execution audit status, not proof that an attack has stopped.`});
 }
}
