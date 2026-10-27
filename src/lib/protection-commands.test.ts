import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {store} from './store';
import {approveProtection,acknowledgeCommand,acknowledgeRenewal,cancelIncidentProtection,commandsFor,protect} from './protection-commands';

test('dismissal requests agent removal and prevents renewal before removal acknowledgement',async()=>{
 const org=await store.createOrganization({name:'Dismiss '+randomUUID(),ownerId:'root',orgType:'business'}),now=new Date().toISOString();
 await store.upsertNode({tenantId:org.id,serverId:'dismiss-node',agentId:'agent',displayName:'Dismiss node',tags:[],status:'healthy',createdAt:now,lastHeartbeat:now});
 const incident={tenantId:org.id,serverId:'dismiss-node',agentId:'agent',incidentId:'dismiss-incident',state:'review',startedAt:now,updatedAt:now,payload:{candidate_id:'d'.repeat(32)}};await store.putIncident(incident);
 const s=await store.settings(org.id);await store.putSettings(org.id,{...s,response:{...s.response,allowRemoteRequests:true,dryRun:false,defaultTtlSeconds:60,renewal:{enabled:true,maxTotalSeconds:120}}});
 const c=await approveProtection(org.id,incident.incidentId,'human');await acknowledgeCommand(org.id,'agent','dismiss-node',c.id,'applied');
 await store.putIncident({...incident,state:'resolved'});assert.equal(await cancelIncidentProtection(org.id,incident.incidentId),1);
 assert.equal((await commandsFor(org.id))[0].status,'cancel_requested');
 await assert.rejects(acknowledgeRenewal(org.id,'agent','dismiss-node',c.id,new Date(Date.now()+90000).toISOString(),10),/scoped/);
 await acknowledgeCommand(org.id,'agent','dismiss-node',c.id,'cancelled');assert.equal((await commandsFor(org.id))[0].status,'cancelled');
 assert.equal(await cancelIncidentProtection(org.id,incident.incidentId),0,'dismissal is idempotent');
});

test('renewal requires opt-in, fresh source counters and a hard total-duration cap',async()=>{
 const org=await store.createOrganization({name:'Renewal '+randomUUID(),ownerId:'root',orgType:'business'}),now=new Date().toISOString();
 await store.upsertNode({tenantId:org.id,serverId:'renew-node',agentId:'agent',displayName:'Renew node',tags:[],status:'healthy',createdAt:now,lastHeartbeat:now});
 await store.putIncident({tenantId:org.id,serverId:'renew-node',agentId:'agent',incidentId:'renew-incident',state:'review',startedAt:now,updatedAt:now,payload:{candidate_id:'c'.repeat(32)}});
 const s=await store.settings(org.id);await store.putSettings(org.id,{...s,response:{...s.response,allowRemoteRequests:true,dryRun:false,defaultTtlSeconds:30}});
 const c=await approveProtection(org.id,'renew-incident','human');await acknowledgeCommand(org.id,'agent','renew-node',c.id,'applied');
 const clock=Date.now;Date.now=()=>Date.parse(c.createdAt)+18000;
 try{
  const expiry=new Date(Date.now()+30000).toISOString();
  await assert.rejects(acknowledgeRenewal(org.id,'agent','renew-node',c.id,expiry,3),/disabled/);
  const current=await store.settings(org.id);await store.putSettings(org.id,{...current,response:{...current.response,renewal:{enabled:true,maxTotalSeconds:60}}});
  await assert.rejects(acknowledgeRenewal(org.id,'wrong','renew-node',c.id,expiry,3),/scoped/);
  await assert.rejects(acknowledgeRenewal(org.id,'agent','renew-node',c.id,expiry,2),/evidence/);
  assert.equal(await acknowledgeRenewal(org.id,'agent','renew-node',c.id,expiry,3),true);
  assert.equal(await acknowledgeRenewal(org.id,'agent','renew-node',c.id,expiry,3),undefined,'duplicate reports do not renew twice');
  await assert.rejects(acknowledgeRenewal(org.id,'agent','renew-node',c.id,new Date(Date.now()+31000).toISOString(),3),/evidence/);
  await assert.rejects(acknowledgeRenewal(org.id,'agent','renew-node',c.id,new Date(Date.parse(c.createdAt)+61000).toISOString(),9),/duration/);
  assert.equal((await commandsFor(org.id))[0].expiresAt,expiry);
 }finally{Date.now=clock;}
});

test('protection requires opt-in and scoped candidate; duplicate approval cannot extend TTL',async()=>{
 const org=await store.createOrganization({name:'Command test '+randomUUID(),ownerId:'root',orgType:'business'});
 const now=new Date().toISOString();
 await store.upsertNode({tenantId:org.id,serverId:'node',agentId:'agent',displayName:'Node',tags:[],status:'healthy',createdAt:now,lastHeartbeat:now});
 await store.putIncident({tenantId:org.id,serverId:'node',agentId:'agent',incidentId:'incident',state:'review',startedAt:now,updatedAt:now,payload:{candidate_id:'a'.repeat(32)}});
 await assert.rejects(approveProtection(org.id,'incident','operator'),/Enable remote/);
 const settings=await store.settings(org.id);await store.putSettings(org.id,{...settings,response:{...settings.response,allowRemoteRequests:true,dryRun:false,defaultTtlSeconds:30}});
 const command=await approveProtection(org.id,'incident','human');assert.equal(command.status,'queued');
 assert.equal((await approveProtection(org.id,'incident','human')).expiresAt,command.expiresAt);
 assert.equal((await protect(org.id,command.id)).commandId,command.id);
 await assert.rejects(protect('another-org',command.id),/approval command/);
 await assert.rejects(acknowledgeCommand(org.id,'wrong-agent','node',command.id,'applied'),/not found/);
 await assert.rejects(acknowledgeCommand(org.id,'agent','node',command.id,'expired'),/not expired/);
 await acknowledgeCommand(org.id,'agent','node',command.id,'applied');
 assert.equal((await commandsFor(org.id))[0].status,'applied');
 await acknowledgeCommand(org.id,'agent','node',command.id,'applied');
 await assert.rejects(acknowledgeCommand(org.id,'agent','node',command.id,'failed'),/terminal/);
});
