import {chromium} from 'playwright';
import assert from 'node:assert/strict';
if(process.env.GUARDSCALE_LOCAL_FIXTURE!=='true'||process.env.GUARDSCALE_TEST_REAL_MESSAGING!=='true')throw Error('Explicit real-message local fixture test required');
const base='http://web:3000',browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000}});
async function api(path,method='GET',data){const r=await context.request.fetch(base+path,{method,headers:{origin:base},...(data?{data}:{})});assert.equal(r.status(),200,path);return r.json();}
async function wait(check,label,seconds=90){const end=Date.now()+seconds*1000;while(Date.now()<end){if(await check())return;await new Promise(r=>setTimeout(r,1000));}throw Error('Timed out: '+label);}
try{
 await api('/api/auth/login','POST',{username:'root',password:'test'});
 for(const i of await api('/api/v1/incidents'))if(i.serverId==='local-php-fixture'&&i.state!=='resolved')await api('/api/v1/incidents/'+i.incidentId,'PATCH',{state:'resolved'});
 const settings=await api('/api/v1/settings');
 await api('/api/v1/settings','PUT',{response:{...settings.response,allowRemoteRequests:true,dryRun:false,defaultTtlSeconds:60,maxTtlSeconds:120,renewal:{enabled:true,maxTotalSeconds:120},autoGuardian:{...settings.response.autoGuardian,enabled:false}}});
 const page=await context.newPage();await page.goto(base+'/servers/local-php-fixture');await page.getByRole('region',{name:'Live server logs'}).waitFor();
 const left=await page.locator('.server-log-panel').boundingBox(),right=await page.locator('.server-panels').boundingBox();assert.ok(left.x<right.x&&Math.abs(left.y-right.y)<10);
 const start=Date.now(),attack=await context.request.post('http://probe:8080/attack',{timeout:110000});assert.equal(attack.status(),200);assert.equal((await attack.json()).requests,60);
 let incident;await wait(async()=>{incident=(await api('/api/v1/incidents')).find(i=>i.serverId==='local-php-fixture'&&Date.parse(i.startedAt)>=start-1000);return !!incident;},'real incident');
 await wait(async()=>(await api('/api/v1/incidents/'+incident.incidentId)).incident.payload?.alertedAt,'real notification acceptance');
 await page.getByRole('textbox',{name:'Filter server logs'}).fill('missing-security');await page.locator('.server-log-entry').filter({hasText:'missing-security'}).first().waitFor();
 await page.getByRole('textbox',{name:'Filter server logs'}).fill('');
 await page.goto(base+'/incidents/'+incident.incidentId);await page.getByRole('button',{name:'Block source temporarily…'}).waitFor();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Block source temporarily…'}).click();
 let detail;await wait(async()=>{detail=await api('/api/v1/incidents/'+incident.incidentId);return detail.commands.some(c=>c.kind!=='inspect_server'&&c.status==='applied');},'agent-confirmed block');
 const command=detail.commands.find(c=>c.kind!=='inspect_server');
 const firstExpiry=Date.parse(command.expiresAt);let renewed=false;
 // Actual connection attempts from the blocked probe provide firewall evidence.
 for(let i=0;i<75;i++){
  assert.equal((await(await context.request.get('http://probe:8080/check')).json()).status,'blocked');
  detail=await api('/api/v1/incidents/'+incident.incidentId);
  const active=detail.commands.find(c=>c.id===command.id);
  assert.ok(Date.parse(active.expiresAt)<=Date.parse(command.createdAt)+120000);
  if(Date.parse(active.expiresAt)>firstExpiry){renewed=true;break;}
  await new Promise(r=>setTimeout(r,1000));
 }
 assert.ok(renewed,'fresh blocked packets extended the active rule');
 await page.getByRole('button',{name:'Dismiss and remove protection'}).click();
 await wait(async()=>{detail=await api('/api/v1/incidents/'+incident.incidentId);return detail.commands.some(c=>c.id===command.id&&c.status==='cancelled');},'agent-confirmed removal');
 assert.equal((await(await context.request.get('http://probe:8080/check')).json()).status,200,'Dismiss removed the block before extended expiry');
 const cancelledExpiry=detail.commands.find(c=>c.id===command.id).expiresAt;
 await new Promise(r=>setTimeout(r,12000));detail=await api('/api/v1/incidents/'+incident.incidentId);
 assert.equal(detail.commands.find(c=>c.id===command.id).status,'cancelled');assert.equal(detail.commands.find(c=>c.id===command.id).expiresAt,cancelledExpiry,'no renewal after Dismiss');
 assert.ok(detail.activity.some(e=>e.type==='protection.traffic'),'blocked traffic is visible in console activity');
 assert.equal((await context.request.get('http://site')).status(),200);
 await page.goto(base+'/servers/local-php-fixture');await page.locator('.incident-source-group').first().waitFor();
 const groups=await page.locator('.incident-source-group summary').allTextContents();assert.ok(groups.some(t=>t.includes('192.0.2.20')));
 console.log(JSON.stringify({passed:true,realRequestsVisible:true,splitView:true,sourceGrouping:true,renewal:true,dismissRemovesRule:true,noRenewalAfterDismiss:true,firewallTrafficVisible:true,operatorUnaffected:true,approval:'automated console action; phone approval is a separate manual check'}));
}finally{await browser.close();}
