import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {directoryServers,directoryUsers,organizationUsage} from './admin-directory';
import {store} from './store';
import {forgetPlan,hourOf,usagePeriod} from './usage';
const now=new Date().toISOString();
test('admin user directory lists each organization member once',async()=>{
 const user={id:randomUUID(),username:'synthetic-admin-'+randomUUID(),displayName:'Synthetic Admin Directory',status:'active' as const,createdAt:now,updatedAt:now};
 await store.putUser(user);
 for(const name of ['Synthetic shop','Synthetic studio']){const org=await store.createOrganization({name,ownerId:user.id,orgType:'business'});await store.putMembership({id:randomUUID(),orgId:org.id,userId:user.id,role:'viewer',status:'active',createdAt:now,updatedAt:now})}
 const rows=(await directoryUsers()).filter(r=>r.user.id===user.id);
 assert.equal(rows.length,1);assert.equal(rows[0].organizations,2);
});
test('admin server directory spans organizations and never exposes website addresses',async()=>{
 const a=await store.createOrganization({name:'Synthetic server org A',ownerId:'root',orgType:'business'});
 await store.upsertNode({tenantId:a.id,serverId:'srv-1',agentId:'agent',displayName:'web-01',platform:'amd64',websiteUrls:['https://private.example.com'],tags:[],status:'healthy',createdAt:now,lastHeartbeat:now});
 const row=(await directoryServers()).find(s=>s.orgId===a.id)!;
 assert.deepEqual(row,{id:'srv-1',orgId:a.id,name:'web-01',platform:'amd64',status:'healthy',sites:1,connectedAt:now,lastSeen:now,organization:'Synthetic server org A'});
 assert.ok(!JSON.stringify(row).includes('private.example.com'),'website URLs must never reach admin views');
});
test('organization usage reports each meter for the current billing period',async()=>{
 const mode=process.env.GUARDSCALE_DEPLOYMENT_MODE;process.env.GUARDSCALE_DEPLOYMENT_MODE='saas';
 try{
  const org=await store.createOrganization({name:'Synthetic usage org',ownerId:'root',orgType:'business'}),period=usagePeriod(null);
  await store.addUsage(org.id,period.start,hourOf(),{serverHours:3,logBytes:5*1024*1024},false);forgetPlan(org.id);
  const usage=await organizationUsage(org.id);
  assert.equal(usage.plan,'dev');assert.equal(usage.period.start,period.start);
  assert.deepEqual(usage.rows.map(r=>r.meter),['Server hours','Log ingestion','AI credits']);
  assert.equal(usage.rows[0].used,3);assert.equal(usage.rows[1].used,5);
 }finally{if(mode===undefined)delete process.env.GUARDSCALE_DEPLOYMENT_MODE;else process.env.GUARDSCALE_DEPLOYMENT_MODE=mode}
});
test('usage periods display in UTC with the last included day',async()=>{
 const {periodLabel,formatUnits}=await import('./admin-directory');
 assert.equal(periodLabel({start:'2026-10-01T00:00:00.000Z',end:'2026-11-01T00:00:00.000Z'}),'Oct 1, 2026 – Oct 31, 2026');
 assert.equal(formatUnits(1,'hours'),'1 hour');assert.equal(formatUnits(2.5,'MB'),'2.5 MB');assert.equal(formatUnits(null,'credits'),'Not metered');
});
