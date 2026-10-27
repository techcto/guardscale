import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server';
import {store} from './store';
import {uptimeStore} from './uptime-store';
import {enrollServerWebsites} from './uptime';
import {createSession,sessionCookie} from './session';
import {POST as create} from '../app/api/v1/uptime/route';
import {DELETE as remove,PATCH as edit} from '../app/api/v1/uptime/[id]/route';

test('uptime APIs reject duplicates, preserve deletion suppression and allow explicit re-adding',async()=>{
 const previous=process.env.GUARDSCALE_SESSION_SECRET;process.env.GUARDSCALE_SESSION_SECRET='local-uptime-route-regression-secret';
 const org=await store.createOrganization({name:'Uptime API regression',ownerId:'root',orgType:'business'});
 const cookie=sessionCookie+'='+await createSession({id:'root',username:'root',role:'root',orgId:org.id,expiresAt:Date.now()+60000},process.env.GUARDSCALE_SESSION_SECRET);
 const base='http://localhost:8185',config={name:'Owned website',url:'https://example.com/',intervalSeconds:60,recipientIds:[],whatsapp:false,tags:[],paused:false};
 const request=(method:string,data:unknown,origin=base)=>new NextRequest(base+'/api/v1/uptime',{method,headers:{cookie,origin,host:'localhost:8185','content-type':'application/json'},body:JSON.stringify(data)});
 try{
  assert.equal((await create(request('POST',config,'https://untrusted.example'))).status,403);
  const results=await Promise.all([create(request('POST',config)),create(request('POST',config))]);assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
  const check=(await uptimeStore.list(org.id))[0],params={params:Promise.resolve({id:check.id})};
  assert.equal((await remove(request('DELETE',{confirmation:'wrong'}),params)).status,400);
  assert.equal((await remove(request('DELETE',{confirmation:config.name}),params)).status,200);
  const at=new Date().toISOString();await store.upsertNode({tenantId:org.id,serverId:'web',agentId:'agent',displayName:'Web',websiteUrls:[config.url],tags:[],status:'healthy',createdAt:at,lastHeartbeat:at});
  await enrollServerWebsites(org.id);assert.equal((await uptimeStore.list(org.id)).length,0);
  assert.equal((await create(request('POST',config))).status,201);assert.equal((await uptimeStore.list(org.id)).length,1);
  assert.equal((await create(request('POST',{...config,url:'https://other.example.com/'}))).status,201);
  assert.equal((await edit(request('PATCH',{...config,url:'https://other.example.com/'}),params)).status,409);
 }finally{await store.deleteOrganization(org.id);if(previous===undefined)delete process.env.GUARDSCALE_SESSION_SECRET;else process.env.GUARDSCALE_SESSION_SECRET=previous;}
});
