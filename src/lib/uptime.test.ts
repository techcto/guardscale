import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicMonitorAddress,monitorURL,probeWebsite} from './uptime-probe';
import {recordUptimeSample,runUptimeCycle,uptimeRecipients,validateMonitor,autoEnrolledName} from './uptime';
import {uptimeStore} from './uptime-store';
import {store} from './store';
import {LogNotifier} from './notifications';
import type {UptimeMonitor} from './uptime-model';
import {monitorStatus,uptimePortError} from './uptime-model';
const now=()=>new Date().toISOString();
function monitor(orgId:string):UptimeMonitor{return{id:'check-'+Math.random(),orgId,name:'Owned website',url:'https://example.com/',intervalSeconds:60,recipientIds:[],whatsapp:false,tags:[],paused:false,revision:0,createdAt:now(),updatedAt:now(),nextCheckAt:now(),state:'unknown',failures:0,successes:0,samples:[],notices:[],outages:[]};}
test('monitor targets reject internal, metadata, reserved, mapped IPv6 and credentials',async()=>{
 for(const address of ['127.0.0.1','10.1.2.3','169.254.169.254','100.64.0.1','198.51.100.20','192.168.1.1','::1','fc00::1','fe80::1','::ffff:8.8.8.8','2001:db8::1'])assert.equal(publicMonitorAddress(address),false,address);
 for(const address of ['8.8.8.8','1.1.1.1','2606:4700:4700::1111'])assert.equal(publicMonitorAddress(address),true,address);
 for(const target of ['http://localhost/','http://2130706433/','http://169.254.169.254/','https://example.com:8443/','https://user:pass@example.com/','https://example.com/?token=private','file:///etc/passwd'])assert.throws(()=>monitorURL(target),Error,target);
 assert.equal(monitorURL('https://example.com/health').href,'https://example.com/health');
 for(const target of ['https://local-fixture.test/','https://sub.localhost/','https://demo.local/','https://localtest.me/','https://site.lvh.me/'])assert.throws(()=>monitorURL(target),/Local and test/);
 assert.equal((await probeWebsite('http://127.0.0.1/')).ok,false);
});
test('two failures open one incident; two successes recover that same incident',()=>{
 let m=monitor('state-test');const bad={at:now(),ok:false,durationMs:8000,error:'Connection timed out'};
 m=recordUptimeSample(m,bad);assert.equal(m.state,'unknown');assert.equal(m.notices.length,0);
 m=recordUptimeSample(m,bad);assert.equal(m.state,'down');assert.equal(m.notices.length,1);const id=m.activeIncidentId;
 m=recordUptimeSample(m,bad);assert.equal(m.notices.length,1);
 m=recordUptimeSample(m,{at:now(),ok:true,durationMs:120,statusCode:200});assert.equal(m.state,'down');
 m=recordUptimeSample(m,{at:now(),ok:true,durationMs:110,statusCode:200});assert.equal(m.state,'up');assert.equal(m.notices[1].incidentId,id);assert.equal(m.notices[1].kind,'recovered');assert.ok(m.outages[0].resolvedAt);
 assert.equal(monitorStatus(m,Date.parse(m.samples.at(-1)!.at)+181000),'stale');assert.equal(monitorStatus({...m,paused:true}),'paused');
});
test('an auto-enrolled check never alerts until it has been up once',()=>{
 let m:UptimeMonitor={...monitor('auto-pending'),autoEnrolled:true};const bad={at:now(),ok:false,durationMs:8000,error:'DNS lookup or target validation failed'};
 for(let i=0;i<3;i++)m=recordUptimeSample(m,bad);
 assert.equal(m.state,'unknown');assert.equal(m.notices.length,0);assert.equal(m.outages.length,0);assert.equal(m.activeIncidentId,undefined);
 m=recordUptimeSample(m,{at:now(),ok:true,durationMs:120,statusCode:200});assert.equal(m.state,'up');
 m=recordUptimeSample(recordUptimeSample(m,bad),bad);assert.equal(m.state,'down');assert.equal(m.notices.length,1);assert.equal(m.notices[0].kind,'down');
});
test('unsupported ports get one clear message in the form and the API',async()=>{
 const message='Port 8443 is not supported. Uptime checks use port 80 (HTTP) or 443 (HTTPS) only.';
 assert.equal(uptimePortError('https://example.com:8443/'),message);
 for(const ok of ['https://example.com/','http://example.com:80/','https://example.com:443/','http://example.com:443/','not a url','https://'])assert.equal(uptimePortError(ok),'',ok);
 assert.throws(()=>monitorURL('https://example.com:8443/'),{message});
 await assert.rejects(validateMonitor('port-test',{name:'Port',url:'https://example.com:8443/',intervalSeconds:60,recipientIds:[],tags:[]}),{message});
});
test('auto-enrolled names do not repeat a host used as the server name',()=>{
 assert.equal(autoEnrolledName('local-fixture.test','https://local-fixture.test/'),'local-fixture.test');
 assert.equal(autoEnrolledName('Web 1','https://example.com/'),'Web 1 — example.com');
});
test('a provider failure stays pending and retries without opening another incident',async()=>{
 const org=await store.createOrganization({name:'Notification retry regression',ownerId:'owner',orgType:'business'}),at=now(),userId='retry-'+org.id;
 await store.createUser({id:userId,username:userId+'@example.test',email:userId+'@example.test',emailVerified:true,displayName:'Approved test operator',status:'active',createdAt:at,updatedAt:at},'not-a-login-hash');
 await store.putMembership({id:userId,orgId:org.id,userId,role:'viewer',status:'active',createdAt:at,updatedAt:at});
 let m=monitor(org.id);m.recipientIds=[userId];
 m=recordUptimeSample(recordUptimeSample(m,{at,ok:false,durationMs:2,statusCode:503}),{at,ok:false,durationMs:2,statusCode:503});
 const incidentId=m.activeIncidentId!;await uptimeStore.save(m);
 const original=LogNotifier.prototype.send;let attempts=0;
 LogNotifier.prototype.send=async()=>{if(++attempts===1)throw Error('provider unavailable');return 'local-notification-not-delivered'};
 try{
  await runUptimeCycle();assert.equal((await uptimeStore.get(org.id,m.id))!.notices.length,1);
  await runUptimeCycle();assert.equal((await uptimeStore.get(org.id,m.id))!.notices.length,0);assert.equal(attempts,2);
  assert.equal((await store.incidents(org.id)).length,1);assert.equal((await store.incidents(org.id))[0].incidentId,incidentId);
 }finally{LogNotifier.prototype.send=original;await uptimeStore.remove(org.id,m.id);}
});
test('monitor leases reject concurrent workers and stale saves after administrator changes',async()=>{
 const m=monitor('lease-test');assert.ok(await uptimeStore.save(m));const current=(await uptimeStore.get(m.orgId,m.id))!;
 assert.ok(await uptimeStore.claim(current,'worker-a',Date.now()));assert.equal(await uptimeStore.claim(current,'worker-b',Date.now()),false);
 assert.ok(await uptimeStore.save({...current,paused:true},current.revision));assert.equal(await uptimeStore.save(current,current.revision,'worker-a'),false);
 assert.equal((await uptimeStore.get(m.orgId,m.id))!.paused,true);
 await uptimeStore.remove(m.orgId,m.id);assert.equal(await uptimeStore.get('other-org',m.id),null);
});
test('only approved verified members are eligible and worker creates outage/recovery incidents',async()=>{
 const savedMode=process.env.GUARDSCALE_DEPLOYMENT_MODE,savedNotify=process.env.GUARDSCALE_NOTIFICATION_MODE;
 process.env.GUARDSCALE_DEPLOYMENT_MODE='saas';process.env.GUARDSCALE_NOTIFICATION_MODE='log';
 const org=await store.createOrganization({name:'Isolated uptime regression',ownerId:'owner',orgType:'business'});
 const userId='uptime-user-'+org.id,stamp=now();
 await store.createUser({id:userId,username:userId+'@example.test',email:userId+'@example.test',emailVerified:true,displayName:'Approved operator',status:'active',createdAt:stamp,updatedAt:stamp},'not-a-login-hash');
 await store.putMembership({id:'membership-'+org.id,orgId:org.id,userId,role:'viewer',status:'active',createdAt:stamp,updatedAt:stamp});
 const recipients=await uptimeRecipients(org.id);assert.equal(recipients.length,1);
 const config={name:'Owned site',url:'https://example.com',intervalSeconds:60,recipientIds:[userId],tags:[],whatsapp:false};
 await assert.rejects(()=>validateMonitor(org.id,{...config,recipientIds:['other-workspace-user']}),/approved users/);
 await store.putUser({...await store.userById(userId),id:userId,emailVerified:false} as Parameters<typeof store.putUser>[0]);
 assert.equal((await uptimeRecipients(org.id)).length,0);
 const user=(await store.userById(userId))!;await store.putUser({...user,emailVerified:true});
 let m=monitor(org.id);m.recipientIds=[userId];await uptimeStore.save(m);
 const sent:string[]=[],original=LogNotifier.prototype.send;
 LogNotifier.prototype.send=async n=>{sent.push(n.subject);return 'local-notification-not-delivered'};
 async function due(ok:boolean){const current=(await uptimeStore.get(org.id,m.id))!;await uptimeStore.save({...current,nextCheckAt:now()},current.revision);await runUptimeCycle(async()=>({at:now(),ok,durationMs:100,statusCode:ok?200:503}));m=(await uptimeStore.get(org.id,m.id))!;}
 try{
  await due(false);assert.equal(sent.length,0);await due(false);assert.equal(sent.length,1);const incidentId=m.activeIncidentId!;assert.equal((await store.incident(org.id,incidentId))!.state,'review');
  await due(false);assert.equal(sent.length,1);await due(true);assert.equal(sent.length,1);await due(true);assert.equal(sent.length,2);assert.match(sent[1],/RECOVERED/);assert.equal((await store.incident(org.id,incidentId))!.state,'resolved');
  await store.purgeCollectedData(org.id);const purged=(await uptimeStore.get(org.id,m.id))!;assert.equal(purged.samples.length,0);assert.equal(purged.notices.length,0);assert.equal(purged.outages.length,0);assert.deepEqual(purged.recipientIds,[userId]);
  const current=(await uptimeStore.get(org.id,m.id))!;await uptimeStore.save({...current,paused:true},current.revision);let calls=0;await runUptimeCycle(async()=>{calls++;return{at:now(),ok:false,durationMs:1}});assert.equal(calls,0);
 }finally{LogNotifier.prototype.send=original;await uptimeStore.remove(org.id,m.id);if(savedMode===undefined)delete process.env.GUARDSCALE_DEPLOYMENT_MODE;else process.env.GUARDSCALE_DEPLOYMENT_MODE=savedMode;if(savedNotify===undefined)delete process.env.GUARDSCALE_NOTIFICATION_MODE;else process.env.GUARDSCALE_NOTIFICATION_MODE=savedNotify;}
});
