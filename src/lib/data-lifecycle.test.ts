import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {memoryStore as store} from './memory-store';
import {NextRequest} from 'next/server';
import {createSession,sessionCookie} from './session';
import {POST as purge} from '../app/api/v1/settings/purge/route';
import {DELETE as remove} from '../app/api/v1/nodes/[id]/route';
import {POST as createOrg} from '../app/api/orgs/route';
import {POST as switchOrg} from '../app/api/orgs/active/route';
import {GET as enrollment} from '../app/api/v1/nodes/enrollment/route';
test('server removal blocks re-enrollment and organization purge retains enrollment and isolates customers',async()=>{
 const tenant=randomUUID(),other=randomUUID();
 const node={tenantId:tenant,serverId:'server-one',agentId:'agent-one',displayName:'One',tags:[],status:'healthy' as const,createdAt:new Date().toISOString(),lastHeartbeat:new Date().toISOString()};
 await store.upsertNode(node);await store.upsertNode({...node,serverId:'server-two'});await store.upsertNode({...node,tenantId:other});
 for(const tenantId of [tenant,other]){
  await store.putEvent({tenantId,serverId:node.serverId,agentId:node.agentId,type:'log.apache_access',at:new Date().toISOString()});
  await store.putIncident({tenantId,serverId:node.serverId,agentId:node.agentId,incidentId:'incident-one',state:'review',startedAt:node.createdAt,updatedAt:node.createdAt,payload:{}});
 }
 await store.retireNode(tenant,node.serverId);
 assert.equal(await store.node(tenant,node.serverId),null);
 assert.equal((await store.nodes(tenant)).length,1);
 await assert.rejects(()=>store.upsertNode(node),/Server removed/);
 assert.equal((await store.eventsForNode(tenant,node.serverId)).length,1);
 assert.deepEqual(await store.purgeCollectedData(tenant),{events:1,incidents:1});
 assert.equal((await store.eventsForNode(tenant,node.serverId)).length,0);
 assert.equal((await store.incidents(tenant)).length,0);
 assert.equal((await store.nodes(tenant)).length,1);
 assert.ok((await store.nodeRecord(tenant,node.serverId))?.deletedAt);
 assert.equal((await store.eventsForNode(other,node.serverId)).length,1);
 assert.equal((await store.incidents(other)).length,1);
 assert.deepEqual(await store.purgeCollectedData(tenant),{events:0,incidents:0});
 await store.putEvent({tenantId:tenant,serverId:'server-two',agentId:node.agentId,type:'log.apache_access',at:new Date().toISOString()});
 assert.equal((await store.eventsForNode(tenant,'server-two')).length,1);
});
test('destructive routes enforce origin, role, confirmation, and active organization scope',async()=>{
 const org=await store.createOrganization({name:'Lifecycle test',ownerId:'test-admin',orgType:'business'});
 const secret=process.env.GUARDSCALE_SESSION_SECRET??'local-lifecycle-test-secret-not-for-production';
 process.env.GUARDSCALE_SESSION_SECRET=secret;
 const token=await createSession({id:'test-admin',username:'test-admin',role:'admin',orgId:org.id,expiresAt:Date.now()+60000},secret);
 await store.putMembership({id:randomUUID(),orgId:org.id,userId:'test-admin',role:'admin',status:'active',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
 const request=(method:string,confirmation:string,origin='http://localhost')=>new NextRequest('http://localhost/api/v1/settings/purge',{method,headers:{host:'localhost',origin,cookie:`${sessionCookie}=${token}`,'content-type':'application/json'},body:JSON.stringify({confirmation})});
 assert.equal((await purge(request('POST','PURGE','https://evil.example'))).status,403);
 assert.equal((await purge(request('POST','wrong'))).status,400);
 assert.equal((await purge(request('POST','PURGE'))).status,200);
 const node={tenantId:org.id,serverId:'route-test',agentId:'agent',displayName:'Route test',tags:[],status:'healthy' as const,createdAt:new Date().toISOString(),lastHeartbeat:new Date().toISOString()};
 await store.upsertNode(node);
 assert.equal((await remove(request('DELETE','wrong'),{params:Promise.resolve({id:node.serverId})})).status,400);
 assert.ok(await store.node(org.id,node.serverId));
 assert.equal((await remove(request('DELETE',node.serverId),{params:Promise.resolve({id:node.serverId})})).status,200);
 assert.equal(await store.node(org.id,node.serverId),null);
 await store.putMembership({id:randomUUID(),orgId:org.id,userId:'test-admin',role:'viewer',status:'active',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
 assert.equal((await purge(request('POST','PURGE'))).status,403);
});
test('root can create customer organizations, switch, and receive isolated enrollment commands',async()=>{
 const previousMode=process.env.GUARDSCALE_DEPLOYMENT_MODE;
 process.env.GUARDSCALE_DEPLOYMENT_MODE='saas';
 try{
  const base=await store.createOrganization({name:'Root test workspace',ownerId:'root',orgType:'business'});
  const secret=process.env.GUARDSCALE_SESSION_SECRET??'local-lifecycle-test-secret-not-for-production';process.env.GUARDSCALE_SESSION_SECRET=secret;
  let cookie=`${sessionCookie}=${await createSession({id:'root',username:'root',role:'root',orgId:base.id,expiresAt:Date.now()+60000},secret)}`;
  const request=(path:string,value?:object)=>new NextRequest('http://localhost'+path,{method:value?'POST':'GET',headers:{host:'localhost',origin:'http://localhost',cookie,'content-type':'application/json'},...(value?{body:JSON.stringify(value)}:{})});
  const tokens:string[]=[];
  for(const name of ['Customer A verification','Customer B verification']){
   const created=await createOrg(request('/api/orgs',{name}));assert.equal(created.status,201);const org=await created.json();
   assert.equal(org.name,name);assert.equal((await store.membership(org.id,'root'))?.role,'admin');
   const switched=await switchOrg(request('/api/orgs/active',{orgId:org.id}));assert.equal(switched.status,200);
   cookie=switched.headers.get('set-cookie')!.split(';')[0];
   const credentials=await enrollment(request('/api/v1/nodes/enrollment'));assert.equal(credentials.status,200);const data=await credentials.json();
   assert.equal(data.tenantId,org.id);assert.ok(data.enrollmentToken);tokens.push(data.enrollmentToken);
   assert.deepEqual(await store.nodes(org.id),[]);
  }
  assert.notEqual(tokens[0],tokens[1]);
 }finally{if(previousMode===undefined)delete process.env.GUARDSCALE_DEPLOYMENT_MODE;else process.env.GUARDSCALE_DEPLOYMENT_MODE=previousMode}
});
