import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server';
import {store} from './store';
import {createSession,sessionCookie} from './session';
import {mergeServerTags,serverGroup} from './server-metadata';
import {POST as heartbeat} from '../app/api/v1/agents/heartbeat/route';
import {POST as metrics} from '../app/api/v1/agents/metrics/route';
import {PATCH as edit} from '../app/api/v1/nodes/[id]/route';

test('manual server identity/groups survive heartbeats and metrics cannot cross enrollment boundaries',async()=>{
 const saved=process.env.GUARDSCALE_SESSION_SECRET,mode=process.env.GUARDSCALE_DEPLOYMENT_MODE;
 process.env.GUARDSCALE_SESSION_SECRET='server-management-test-only';process.env.GUARDSCALE_DEPLOYMENT_MODE='on-premise';
 const org=await store.createOrganization({name:'Server management regression',ownerId:'root',orgType:'business'});
 const base='http://localhost:8185',auth=`Bearer ${org.id}.agent.${org.enrollmentToken}`;
 const token=await createSession({id:'root',username:'root',role:'root',orgId:org.id,expiresAt:Date.now()+60000},process.env.GUARDSCALE_SESSION_SECRET);
 const agentRequest=(path:string,data:unknown,authorization=auth)=>new NextRequest(base+path,{method:'POST',headers:{authorization,'content-type':'application/json'},body:JSON.stringify(data)});
 const editRequest=(data:unknown)=>new NextRequest(base+'/api/v1/nodes/server',{method:'PATCH',headers:{cookie:sessionCookie+'='+token,host:'localhost:8185',origin:base,'content-type':'application/json'},body:JSON.stringify(data)});
 const hb={server_id:'server',display_name:'Discovered instance',agent_version:'0.3.8',tags:['Environment=staging','aws:cloudformation:stack-name=auto-stack']};
 try{
  assert.equal((await heartbeat(agentRequest('/api/v1/agents/heartbeat',hb))).status,202);
  const params={params:Promise.resolve({id:'server'})};
  assert.equal((await edit(editRequest({manualDisplayName:'Spacemade production',manualTags:['Group=Spacemade','Environment=production']}),params)).status,200);
  assert.equal((await heartbeat(agentRequest('/api/v1/agents/heartbeat',hb))).status,202);
  let node=(await store.node(org.id,'server'))!;
  assert.equal(node.displayName,'Spacemade production');assert.equal(serverGroup(node),'Spacemade');assert.equal(node.agentVersion,'0.3.8');assert.ok(!node.tags.includes('Environment=staging'));
  const lastHeartbeat=node.lastHeartbeat,sample={server_id:'server',metrics:{sampled_at:new Date().toISOString(),interval_seconds:5,cpu_percent:25,memory_total_bytes:1000,memory_used_bytes:600,memory_percent:999}};
  assert.equal((await metrics(agentRequest('/api/v1/agents/metrics',sample))).status,202);
  node=(await store.node(org.id,'server'))!;assert.equal(node.hostMetrics?.memoryPercent,60);assert.equal(node.hostMetrics?.cpuPercent,25);assert.equal(node.lastHeartbeat,lastHeartbeat);assert.equal(node.displayName,'Spacemade production');
  assert.equal((await metrics(agentRequest('/api/v1/agents/metrics',{...sample,metrics:{...sample.metrics,cpu_percent:101}}))).status,400);
  assert.equal((await metrics(agentRequest('/api/v1/agents/metrics',sample,`Bearer ${org.id}.other.${org.enrollmentToken}`))).status,403);
  assert.equal((await edit(editRequest({manualDisplayName:'',manualTags:[]}),params)).status,200);
  node=(await store.node(org.id,'server'))!;assert.equal(node.displayName,'Discovered instance');assert.equal(serverGroup(node),'auto-stack');assert.ok(node.tags.includes('Environment=staging'));
  await store.retireNode(org.id,'server');assert.equal((await metrics(agentRequest('/api/v1/agents/metrics',sample))).status,403);
  assert.deepEqual(mergeServerTags(['Group=old','Environment=staging'],['Group=new']),['Environment=staging','Group=new']);
 }finally{await store.deleteOrganization(org.id);if(saved===undefined)delete process.env.GUARDSCALE_SESSION_SECRET;else process.env.GUARDSCALE_SESSION_SECRET=saved;if(mode===undefined)delete process.env.GUARDSCALE_DEPLOYMENT_MODE;else process.env.GUARDSCALE_DEPLOYMENT_MODE=mode;}
});
