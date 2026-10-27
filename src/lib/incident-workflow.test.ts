import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {store} from './store';
import {processWhatsAppEnvelope,processIncident} from './incident-workflow';
import {commandsFor,acknowledgeCommand} from './protection-commands';
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
async function autoscaledGroup(name:string){
 process.env.GUARDSCALE_SESSION_SECRET='alert-group-unit-secret';process.env.GUARDSCALE_WHATSAPP_ORIGINATION_ID='phone-number-id-group';process.env.GUARDSCALE_NOTIFICATION_MODE='log';delete process.env.GUARDSCALE_AI_MODEL_ID;
 const org=await store.createOrganization({name,ownerId:'root',orgType:'business'}),now=new Date().toISOString(),servers=['web-1','web-2','web-3'],recipient='+1555'+String(Math.floor(Math.random()*1e7)).padStart(7,'0');
 for(const s of servers)await store.upsertNode({tenantId:org.id,serverId:s,agentId:'agent-'+s,displayName:s,tags:[],status:'healthy',createdAt:now,lastHeartbeat:now});
 const settings=await store.settings(org.id);await store.putSettings(org.id,{...settings,notifications:{...settings.notifications,whatsappEnabled:true,emailEnabled:true,recipients:recipient+' ops@example.test'},response:{...settings.response,allowRemoteRequests:true,dryRun:false,defaultTtlSeconds:30}});
 const incident=(id:string,serverId:string,startedAt=now,source='203.0.113.9')=>({tenantId:org.id,serverId,agentId:'agent-'+serverId,incidentId:id,state:'review',startedAt,updatedAt:startedAt,payload:{candidate_id:'c'.repeat(32),source_ip:source}});
 const alerts=async()=>(await Promise.all(servers.map(s=>store.eventsForNode(org.id,s)))).flat().filter(e=>e.type==='notification.sent');
 const reply=(id:string,body:string)=>processWhatsAppEnvelope({context:{MetaPhoneNumberIds:[{arn:'arn:aws:social-messaging:us-east-1:123456789012:phone-number-id/group'}]},whatsAppWebhookEntry:JSON.stringify({changes:[{value:{messages:[{id,from:recipient.slice(1),timestamp:String(Math.floor(Date.now()/1000)),type:'text',text:{body}}]}}]})});
 const code=(id:string)=>createHmac('sha256',process.env.GUARDSCALE_SESSION_SECRET!).update(org.id+':'+id).digest('hex').slice(0,16);
 return {org,incident,alerts,reply,code};
}
test('autoscaled servers reporting one source share one alert; other sources still alert',async()=>{
 const {org,incident,alerts}=await autoscaledGroup('Grouped alerts');
 for(const row of [incident('a','web-1'),incident('b','web-2'),incident('c','web-3',undefined,'198.51.100.7')])await store.putIncident(row);
 for(const id of ['a','b','c'])await processIncident(org.id,id);
 assert.equal((await alerts()).length,4,'one WhatsApp and one email for each distinct source');
 assert.equal(((await store.incident(org.id,'b'))?.payload as {alertGroup?:string}).alertGroup,'a');
 assert.equal(((await store.incident(org.id,'b'))?.payload as {alertedAt?:string}).alertedAt,undefined,'grouped server is not alerted again');
 assert.ok((await store.eventsForNode(org.id,'web-2')).some(e=>e.type==='alert.grouped'&&e.metadata?.alert_incident_id==='a'),'grouping is audited on the grouped server');
 assert.equal(((await store.incident(org.id,'c'))?.payload as {alertGroup?:string}).alertGroup,'c');
});
test('concurrent incidents from one source send exactly one alert',async()=>{
 const {org,incident,alerts}=await autoscaledGroup('Concurrent grouped alerts');
 for(const [id,server] of [['x','web-1'],['y','web-2'],['z','web-3']])await store.putIncident(incident(id,server));
 await Promise.all(['x','y','z'].map(id=>processIncident(org.id,id)));
 assert.equal((await alerts()).length,2,'one WhatsApp and one email in total');
 const rows=await Promise.all(['x','y','z'].map(id=>store.incident(org.id,id)));
 assert.equal(new Set(rows.map(r=>(r?.payload as {alertGroup?:string}).alertGroup)).size,1);
 assert.equal(rows.filter(r=>(r?.payload as {alertedAt?:string}).alertedAt).length,1);
});
test('one WhatsApp Protect and Dismiss fan out to every server with per-server confirmation and audit',async()=>{
 const {org,incident,reply}=await autoscaledGroup('Fan-out replies');
 await store.putIncident(incident('p','web-1'));await store.putIncident(incident('q','web-2'));
 await processIncident(org.id,'p');await processIncident(org.id,'q');
 await reply('fan-protect','Protect');
 const commands=(await commandsFor(org.id)).filter(c=>c.kind!=='inspect_server');
 assert.deepEqual(commands.map(c=>c.serverId).sort(),['web-1','web-2'],'the one-word reply is not ambiguous and covers both servers');
 assert.equal(new Set(commands.map(c=>c.id)).size,2,'each server has its own scoped command');
 for(const s of ['web-1','web-2'])assert.ok((await store.eventsForNode(org.id,s)).some(e=>e.type==='response.received'&&e.metadata?.channel==='whatsapp'),'reply audited on '+s);
 const web1=commands.find(c=>c.serverId==='web-1')!;await acknowledgeCommand(org.id,'agent-web-1','web-1',web1.id,'applied');
 const after=await commandsFor(org.id);
 assert.equal(after.find(c=>c.id===web1.id)?.status,'applied');assert.equal(after.find(c=>c.serverId==='web-2'&&c.kind!=='inspect_server')?.status,'queued','one agent cannot confirm another server');
 await reply('fan-dismiss','Dismiss');
 for(const id of ['p','q'])assert.equal((await store.incident(org.id,id))?.state,'resolved');
 assert.deepEqual((await commandsFor(org.id)).filter(c=>c.kind!=='inspect_server').map(c=>c.status).sort(),['cancel_requested','cancel_requested']);
});
test('a group expires 15 minutes after its first incident and a dismissed owner hands over',async()=>{
 const {org,incident,alerts}=await autoscaledGroup('Group window');
 await store.putIncident(incident('old','web-1',new Date(Date.now()-16*60000).toISOString()));await processIncident(org.id,'old');
 await store.putIncident(incident('new','web-2'));await processIncident(org.id,'new');
 assert.equal((await alerts()).length,4,'outside the window the same source alerts again');
 assert.equal(((await store.incident(org.id,'new'))?.payload as {alertGroup?:string}).alertGroup,'new');
 await store.putIncident({...(await store.incident(org.id,'new'))!,state:'resolved'});
 await store.putIncident(incident('next','web-3'));await processIncident(org.id,'next');
 assert.equal((await alerts()).length,6,'a dismissed group no longer suppresses alerts');
 assert.equal(((await store.incident(org.id,'next'))?.payload as {alertGroup?:string}).alertGroup,'next');
});
