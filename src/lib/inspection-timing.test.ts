import {test} from 'node:test';import assert from 'node:assert/strict';
import {store} from './store';
import {inspectServer,commandsFor,acknowledgeCommand} from './protection-commands';

test('inspection tolerates an existing agent responding after the old 15-second deadline',async t=>{
 const org=await store.createOrganization({name:'Inspection timing regression',ownerId:'root',orgType:'business'}),now=new Date().toISOString();
 await store.upsertNode({tenantId:org.id,serverId:'server',agentId:'agent',displayName:'Server',tags:[],status:'healthy',createdAt:now,lastHeartbeat:now});
 await store.putIncident({tenantId:org.id,serverId:'server',agentId:'agent',incidentId:'inspection-timing',state:'review',startedAt:now,updatedAt:now,payload:{}});
 t.mock.timers.enable({apis:['Date','setTimeout'],now:Date.now()});
 try{
  const pending=inspectServer(org.id,'inspection-timing');void pending.catch(()=>{});
  await new Promise(resolve=>setImmediate(resolve));
  const command=(await commandsFor(org.id)).find(c=>c.kind==='inspect_server')!;
  assert.ok(command);assert.ok(Date.parse(command.expiresAt)-Date.now()>30000,'command remains valid through a default heartbeat');
  t.mock.timers.tick(25000);
  await acknowledgeCommand(org.id,'agent','server',command.id,'complete',{recent_requests:'27'});
  await new Promise(resolve=>setImmediate(resolve));
  t.mock.timers.tick(1000);
  assert.deepEqual(await pending,{recent_requests:'27'});
 }finally{t.mock.timers.reset();await store.deleteOrganization(org.id)}
});
