import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {directoryServers,directoryUsers,organizationUsage} from './admin-directory';
import {store} from './store';
import {DeletionBlocked,deleteOrganization,deleteUserAccount,organizationDeletion,userDeletion} from './admin';
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
const member=(orgId:string,userId:string,role:'admin'|'operator'|'viewer',createdAt=now)=>store.putMembership({id:randomUUID(),orgId,userId,role,status:'active',createdAt,updatedAt:createdAt});
const syntheticUser=async(name:string)=>{const u={id:randomUUID(),username:'synthetic-'+randomUUID(),displayName:name,status:'active' as const,createdAt:now,updatedAt:now};await store.putUser(u,'hash');return u};
test('deleting an organization removes its servers, events, incidents and usage, and the accounts of members with no other organization',async()=>{
 const user=await syntheticUser('Synthetic Deletion Member'),org=await store.createOrganization({name:'Synthetic deletion org',ownerId:'root',orgType:'business'});
 const shared=await syntheticUser('Synthetic Shared Member'),elsewhere=await store.createOrganization({name:'Synthetic elsewhere org',ownerId:'root',orgType:'business'});
 await member(org.id,user.id,'viewer');await member(org.id,shared.id,'operator');await member(elsewhere.id,shared.id,'viewer');
 await store.upsertNode({tenantId:org.id,serverId:'srv-delete',agentId:'agent',displayName:'Synthetic web-01',tags:[],status:'healthy',createdAt:now,lastHeartbeat:now});
 await store.putEvent({tenantId:org.id,serverId:'srv-delete',at:now,type:'log',message:'synthetic'} as never);
 await store.putIncident({tenantId:org.id,serverId:'srv-delete',agentId:'agent',incidentId:randomUUID(),state:'open',startedAt:now,updatedAt:now,payload:{}} as never);
 await store.addUsage(org.id,usagePeriod(null).start,hourOf(new Date()),{serverHours:1},true);
 const impact=await organizationDeletion(org.id);
 assert.equal(impact?.blocker,null);assert.deepEqual(impact?.related.map(r=>r.items),[['Synthetic Deletion Member'],['Synthetic Shared Member'],['Synthetic web-01'],['1 incident']]);
 assert.equal(await deleteOrganization(org.id),true);
 assert.equal(await store.organizationById(org.id),null);assert.equal(await store.membership(org.id,user.id),null);
 assert.deepEqual(await store.nodes(org.id),[]);assert.deepEqual(await store.incidents(org.id),[]);assert.deepEqual(await store.eventsForNode(org.id,'srv-delete'),[]);
 assert.equal((await store.usageTotals(org.id,usagePeriod(null).start)).serverHours,0);
 assert.equal(await store.userById(user.id),null,'a member with no other organization is deleted');assert.equal(await store.password(user.id),null);
 assert.ok(await store.userById(shared.id),'a member of another organization keeps the account');assert.deepEqual((await store.orgsForUser(shared.id)).map(m=>m.org.id),[elsewhere.id]);
 assert.equal(await deleteOrganization(org.id),false);
});
test('organization deletion is blocked by a live Stripe subscription and for the operator workspace',async()=>{
 const org=await store.createOrganization({name:'Synthetic paid org',ownerId:'root',orgType:'business'});
 await store.putSubscription({id:'sub_'+randomUUID(),orgId:org.id,productId:'starter',stripeCustomerId:'cus_synthetic',stripeSubscriptionId:'sub_synthetic',status:'active',updatedAt:now});
 assert.match((await organizationDeletion(org.id))?.blocker??'',/Stripe subscription/);
 await assert.rejects(deleteOrganization(org.id),DeletionBlocked);assert.ok(await store.organizationById(org.id));
 const workspace=await store.ensureSingleDeploymentOrg();
 assert.equal(await store.singleDeploymentOrgId(),workspace.id);
 await assert.rejects(deleteOrganization(workspace.id),DeletionBlocked);
});
test('deleting a user hands shared owned organizations to an admin and deletes ones nobody else uses',async()=>{
 const owner=await syntheticUser('Synthetic Owner'),early=await syntheticUser('Synthetic Early Operator'),admin=await syntheticUser('Synthetic Later Admin');
 const solo=await store.createOrganization({name:'Synthetic solo org',ownerId:owner.id,orgType:'personal'}),shared=await store.createOrganization({name:'Synthetic shared org',ownerId:owner.id,orgType:'business'}),other=await store.createOrganization({name:'Synthetic other org',ownerId:'root',orgType:'business'});
 await member(solo.id,owner.id,'admin');await member(shared.id,owner.id,'admin');await member(other.id,owner.id,'viewer');
 const dormant=await syntheticUser('Synthetic Disabled Solo Member');await store.putMembership({id:randomUUID(),orgId:solo.id,userId:dormant.id,role:'viewer',status:'disabled',createdAt:now,updatedAt:now});
 await member(shared.id,early.id,'operator','2020-01-01T00:00:00.000Z');await member(shared.id,admin.id,'admin');
 const impact=await userDeletion(owner.id);
 assert.deepEqual(impact?.related.map(r=>r.items.sort()),[['Synthetic solo org'],['Synthetic shared org → Synthetic Later Admin'],['Synthetic other org','Synthetic shared org'],['Synthetic Disabled Solo Member']]);
 assert.equal(await deleteUserAccount(owner.id),true);
 assert.equal(await store.userById(owner.id),null);assert.equal(await store.password(owner.id),null);assert.deepEqual(await store.orgsForUser(owner.id),[]);
 assert.equal(await store.organizationById(solo.id),null);assert.equal(await store.userById(dormant.id),null,'a disabled member of a deleted solo organization goes with it');
 assert.equal((await store.organizationById(shared.id))?.ownerId,admin.id);assert.ok(await store.userById(early.id),'members of surviving organizations are kept');assert.ok(await store.organizationById(other.id));
 assert.equal((await store.membership(shared.id,early.id))?.role,'operator');
});
test('user deletion is blocked when an owned organization nobody else uses still has a live subscription',async()=>{
 const owner=await syntheticUser('Synthetic Paying Owner'),org=await store.createOrganization({name:'Synthetic paying solo org',ownerId:owner.id,orgType:'personal'});
 await member(org.id,owner.id,'admin');
 await store.putSubscription({id:'sub_'+randomUUID(),orgId:org.id,productId:'starter',stripeSubscriptionId:'sub_synthetic',status:'past_due',updatedAt:now});
 await assert.rejects(deleteUserAccount(owner.id),DeletionBlocked);
 assert.ok(await store.userById(owner.id));assert.ok(await store.membership(org.id,owner.id),'nothing is removed when blocked');
});
