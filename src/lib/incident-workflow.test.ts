import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {store} from './store';
import {processWhatsAppEnvelope,processIncident} from './incident-workflow';
import {commandsFor} from './protection-commands';
test('an in-flight assessment preserves a concurrent dismissal and does not alert it again',async()=>{
 const org=await store.createOrganization({name:'Concurrent dismissal',ownerId:'root',orgType:'business'}),now=new Date().toISOString();
 const row={tenantId:org.id,serverId:'node',agentId:'agent',incidentId:'assessment-race',state:'review',startedAt:now,updatedAt:now,payload:{}};
 await store.putIncident(row);const original=store.incident,model=process.env.GUARDSCALE_AI_MODEL_ID;delete process.env.GUARDSCALE_AI_MODEL_ID;let reads=0;
 store.incident=async(tenant,id)=>{if(tenant===org.id&&id===row.incidentId&&++reads===2)await store.putIncident({...row,state:'resolved'});return original(tenant,id)};
 try{await processIncident(org.id,row.incidentId);assert.equal((await original(org.id,row.incidentId))?.state,'resolved');assert.equal((await store.eventsForNode(org.id,'node')).filter(e=>e.type==='notification.sent').length,0);}
 finally{store.incident=original;if(model!==undefined)process.env.GUARDSCALE_AI_MODEL_ID=model;}
});
test('one-word Protect requires one fresh notified incident and refuses ambiguity',async()=>{
 process.env.GUARDSCALE_SESSION_SECRET='plain-reply-unit-secret';
 process.env.GUARDSCALE_WHATSAPP_ORIGINATION_ID='phone-number-id-plain';
 process.env.GUARDSCALE_NOTIFICATION_MODE='log';
 const org=await store.createOrganization({name:'Plain replies',ownerId:'root',orgType:'business'}),now=new Date().toISOString(),recipient='+15550100009';
 await store.upsertNode({tenantId:org.id,serverId:'plain-node',agentId:'agent',displayName:'Plain node',tags:[],status:'healthy',createdAt:now,lastHeartbeat:now});
 const settings=await store.settings(org.id);await store.putSettings(org.id,{...settings,notifications:{...settings.notifications,whatsappEnabled:true,recipients:recipient},response:{...settings.response,allowRemoteRequests:true,dryRun:false,defaultTtlSeconds:30}});
 const notified=[createHmac('sha256',process.env.GUARDSCALE_SESSION_SECRET).update('whatsapp'+recipient+':log').digest('hex')];
 const incident=(id:string,notifications=notified)=>({tenantId:org.id,serverId:'plain-node',agentId:'agent',incidentId:id,state:'review',startedAt:now,updatedAt:now,payload:{candidate_id:'b'.repeat(32),notified:notifications}});
 const reply=()=>processWhatsAppEnvelope({context:{MetaPhoneNumberIds:[{arn:'arn:aws:social-messaging:us-east-1:123456789012:phone-number-id/plain'}]},whatsAppWebhookEntry:JSON.stringify({changes:[{value:{messages:[{id:'plain-reply',from:recipient.slice(1),timestamp:String(Math.floor(Date.now()/1000)),type:'text',text:{body:'Protect'}}]}}]})});
 await store.putIncident(incident('one',[]));await reply();assert.equal((await commandsFor(org.id)).length,0,'unnotified incident cannot be selected');
 await store.putIncident(incident('one'));await store.putIncident(incident('two'));await reply();assert.equal((await commandsFor(org.id)).length,0,'multiple alerts must not select a target silently');
 await store.putIncident({...incident('two'),state:'resolved'});await reply();assert.equal((await commandsFor(org.id)).length,1);
 const events=await store.eventsForNode(org.id,'plain-node');assert.ok(events.some(e=>e.type==='response.received'&&e.metadata?.channel==='whatsapp'&&e.metadata?.incident_id==='one'));
 await processWhatsAppEnvelope({context:{MetaPhoneNumberIds:[{arn:'arn:aws:social-messaging:us-east-1:123456789012:phone-number-id/plain'}]},whatsAppWebhookEntry:JSON.stringify({changes:[{value:{messages:[{id:'dismiss-reply',from:recipient.slice(1),timestamp:String(Math.floor(Date.now()/1000)),type:'text',text:{body:'Dismiss'}}]}}]})});
 assert.equal((await store.incident(org.id,'one'))?.state,'resolved');assert.equal((await commandsFor(org.id))[0].status,'cancel_requested','WhatsApp Dismiss cancels active or pending protection');
});
test('WhatsApp approval requires configured sender, origination, fresh code and scoped incident',async()=>{
 process.env.GUARDSCALE_SESSION_SECRET='unit-only-secret-not-a-deployment-credential';
 process.env.GUARDSCALE_WHATSAPP_ORIGINATION_ID='phone-123';
 const org=await store.createOrganization({name:'WhatsApp unit test',ownerId:'root',orgType:'business'}),now=new Date().toISOString();
 await store.upsertNode({tenantId:org.id,serverId:'node',agentId:'agent',displayName:'Node',tags:[],status:'healthy',createdAt:now,lastHeartbeat:now});
 await store.putIncident({tenantId:org.id,serverId:'node',agentId:'agent',incidentId:'incident',state:'review',startedAt:now,updatedAt:now,payload:{candidate_id:'a'.repeat(32)}});
 const settings=await store.settings(org.id);await store.putSettings(org.id,{...settings,notifications:{...settings.notifications,whatsappEnabled:true,whatsappSenderId:'phone-123',recipients:'+15550100001'},response:{...settings.response,allowRemoteRequests:true,dryRun:false,defaultTtlSeconds:30}});
 const code=createHmac('sha256',process.env.GUARDSCALE_SESSION_SECRET).update(org.id+':incident').digest('hex').slice(0,16);
 const envelope=(from:string,origin='phone-123',timestamp=String(Math.floor(Date.now()/1000)))=>({context:{MetaPhoneNumberIds:[{arn:'arn:aws:social-messaging:us-east-1:123456789012:phone-number-id/'+origin}]},whatsAppWebhookEntry:JSON.stringify({changes:[{value:{messages:[{id:'unit-message',from,timestamp,type:'text',text:{body:'Protect '+code}}]}}]})});
 await processWhatsAppEnvelope(envelope('15550100002'));assert.equal((await commandsFor(org.id)).length,0);
 await processWhatsAppEnvelope(envelope('15550100001','wrong-origin'));assert.equal((await commandsFor(org.id)).length,0);
 await processWhatsAppEnvelope(envelope('15550100001','phone-123','NaN'));assert.equal((await commandsFor(org.id)).length,0);
 await processWhatsAppEnvelope(envelope('15550100001'));assert.equal((await commandsFor(org.id)).length,1);
 await processWhatsAppEnvelope(envelope('15550100001'));assert.equal((await commandsFor(org.id)).length,1);
});
