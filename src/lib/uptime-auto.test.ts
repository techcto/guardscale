import {test} from 'node:test';
import assert from 'node:assert/strict';
import {store} from './store';
import {uptimeStore} from './uptime-store';
import {enrollServerWebsites} from './uptime';

test('server websites auto-enroll once, inherit tags and configured approved recipients, and respect edits/deletion',async()=>{
 const org=await store.createOrganization({name:'Auto enrollment regression',ownerId:'owner',orgType:'business'}),at=new Date().toISOString();
 const savedMode=process.env.GUARDSCALE_DEPLOYMENT_MODE;process.env.GUARDSCALE_DEPLOYMENT_MODE='saas';
 try{
  for(const [id,verified] of [['approved',true],['not-subscribed',true],['unverified',false]] as const){
   await store.createUser({id:org.id+id,username:id+'@example.test',email:id+'@example.test',emailVerified:verified,displayName:id,status:'active',createdAt:at,updatedAt:at},'not-a-login-hash');
   await store.putMembership({id:org.id+id,orgId:org.id,userId:org.id+id,role:'viewer',status:'active',createdAt:at,updatedAt:at});
  }
  const settings=await store.settings(org.id);settings.notifications.recipients='approved@example.test unverified@example.test';await store.putSettings(org.id,settings);
  const base={tenantId:org.id,agentId:'agent',displayName:'Server',platform:'linux',tags:['Environment=production','Application=website'],status:'healthy' as const,createdAt:at,lastHeartbeat:at};
  await store.upsertNode({...base,serverId:'one',websiteUrls:['https://example.com/health'],discoveredHosts:['example.com']});
  await store.upsertNode({...base,serverId:'two',discoveredHosts:['example.com']});
  await store.upsertNode({...base,serverId:'private',websiteUrls:['http://127.0.0.1/','http://localhost:8186/']});
  await Promise.all([enrollServerWebsites(org.id),enrollServerWebsites(org.id)]);
  let checks=await uptimeStore.list(org.id);assert.equal(checks.length,1);assert.equal(checks[0].url,'https://example.com/health');
  assert.deepEqual(checks[0].tags,base.tags);assert.deepEqual(checks[0].recipientIds,[org.id+'approved']);assert.equal(checks[0].autoEnrolled,true);
  let check=checks[0];assert.ok(await uptimeStore.save({...check,name:'Operator-customized',paused:true},check.revision));
  await enrollServerWebsites(org.id);check=(await uptimeStore.get(org.id,check.id))!;assert.equal(check.name,'Operator-customized');assert.equal(check.paused,true);
  assert.ok(await uptimeStore.save({...check,deletedAt:at},check.revision));
  await enrollServerWebsites(org.id);assert.equal((await uptimeStore.list(org.id)).length,0);assert.equal((await uptimeStore.list(org.id,true)).length,1);
  await store.upsertNode({...base,serverId:'new-server',discoveredHosts:['other.example.com']});
  await enrollServerWebsites(org.id);checks=await uptimeStore.list(org.id);assert.equal(checks.length,1);assert.equal(checks[0].url,'https://other.example.com/');
  const other=await store.createOrganization({name:'Separate workspace',ownerId:'owner',orgType:'business'});
  await store.upsertNode({...base,tenantId:other.id,serverId:'one',websiteUrls:['https://example.com/health']});await enrollServerWebsites(other.id);
  assert.equal((await uptimeStore.list(other.id)).length,1);await store.deleteOrganization(other.id);
 }finally{await store.deleteOrganization(org.id);if(savedMode===undefined)delete process.env.GUARDSCALE_DEPLOYMENT_MODE;else process.env.GUARDSCALE_DEPLOYMENT_MODE=savedMode;}
 assert.equal((await uptimeStore.list(org.id,true)).length,0);
});
