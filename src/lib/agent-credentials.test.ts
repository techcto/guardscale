import {test} from 'node:test';import assert from 'node:assert/strict';
import {NextRequest} from 'next/server';import {store} from './store';import {authenticate} from './auth';
import {agentCredential} from './agent-credentials';
import {POST as enroll} from '../app/api/v1/agents/credential/route';import {POST as heartbeat} from '../app/api/v1/agents/heartbeat/route';

test('private agent credentials prevent cross-agent, cross-server and bootstrap impersonation, and rotate safely',async()=>{
 const org=await store.createOrganization({name:'Agent isolation regression',ownerId:'root',orgType:'business'});
 const auth=(agent:string,secret:string)=>`${org.id}.${agent}.${secret}`;
 const request=(path:string,agent:string,secret:string,data:unknown)=>new NextRequest('http://localhost'+path,{method:'POST',headers:{authorization:'Bearer '+auth(agent,secret),'content-type':'application/json'},body:JSON.stringify(data)});
 const keyA='a'.repeat(64),keyB='b'.repeat(64),rotated='c'.repeat(64);
 try{
  assert.equal((await enroll(request('/api/v1/agents/credential','agent-a',org.enrollmentToken,{server_id:'server-a',secret:keyA}))).status,200);
  assert.equal((await enroll(request('/api/v1/agents/credential','agent-b',org.enrollmentToken,{server_id:'server-b',secret:keyB}))).status,200);
  assert.equal(await authenticate('Bearer '+auth('agent-a',org.enrollmentToken)),null,'shared key cannot impersonate an upgraded agent');
  assert.equal(await authenticate('Bearer '+auth('agent-b',keyA)),null,'one agent key cannot impersonate another agent');
  const stored=await agentCredential(org.id,'agent-a');assert.ok(stored);assert.ok(!JSON.stringify(stored).includes(keyA),'database stores only a hash');
  assert.equal((await heartbeat(request('/api/v1/agents/heartbeat','agent-a',keyA,{server_id:'server-b'}))).status,401,'key is bound to its server even before first heartbeat');
  assert.equal((await heartbeat(request('/api/v1/agents/heartbeat','agent-a',keyA,{server_id:'server-a'}))).status,202);
  assert.equal((await enroll(request('/api/v1/agents/credential','agent-a',org.enrollmentToken,{server_id:'server-a',secret:rotated}))).status,401,'bootstrap cannot rotate a private key');
  assert.equal((await enroll(request('/api/v1/agents/credential','agent-a',keyA,{server_id:'server-a',secret:rotated}))).status,200);
  assert.equal(await authenticate('Bearer '+auth('agent-a',keyA)),null);
  assert.equal((await enroll(request('/api/v1/agents/credential','agent-a',rotated,{server_id:'server-a',secret:rotated}))).status,200,'lost rotation reply can be retried with the durable candidate');
  assert.equal((await authenticate('Bearer '+auth('agent-a',rotated)))?.serverId,'server-a');
  await store.retireNode(org.id,'server-a');assert.equal(await authenticate('Bearer '+auth('agent-a',rotated)),null,'removing a server revokes its key');
  assert.equal((await authenticate('Bearer '+auth('agent-b',keyB)))?.serverId,'server-b','other agent remains valid');
 }finally{await store.deleteOrganization(org.id)}
});
