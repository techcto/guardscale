import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {store} from './store';
import {approveProtection,acknowledgeCommand,commandsFor,protect} from './protection-commands';

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
