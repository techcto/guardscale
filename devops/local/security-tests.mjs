import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
if(process.env.GUARDSCALE_SECURITY_TEST!=='true')throw Error('Explicit security test opt-in required');
const browser=await chromium.launch({headless:true});const context=await browser.newContext();
const base='http://web:3000';const errors=[];context.on('page',page=>{page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('requestfailed',r=>errors.push(r.url().split('?')[0]+': '+r.failure()?.errorText));});
async function json(path){const r=await context.request.get(base+path);assert.equal(r.status(),200,path);return r.json();}
async function wait(check,label){const end=Date.now()+90000;while(Date.now()<end){if(await check())return;await new Promise(r=>setTimeout(r,1000));}throw Error('Timed out: '+label);}
try{
 const login=await context.request.post(base+'/api/auth/login',{data:{username:'root',password:(await readFile('/run/secrets/root_password','utf8')).trim()}});assert.equal(login.status(),200);
 const identity=await login.json();
 const org=(await json('/api/orgs')).find(v=>v.id===identity.orgId);assert.equal(org?.name,'GuardScale');
 assert.ok((await json('/api/v1/nodes')).some(v=>v.serverId==='local-php-fixture'),'fixture is loaded in root workspace');
 console.log('1/5 Root workspace has the real enrolled PHP/Apache server.');
 const settings=await json('/api/v1/settings');
 assert.equal((await context.request.put(base+'/api/v1/settings',{headers:{origin:base},data:{...settings,notifications:{...settings.notifications,recipients:'fixture@example.test'},response:{...settings.response,allowRemoteRequests:true,dryRun:false,defaultTtlSeconds:30,maxTtlSeconds:60,autoGuardian:{enabled:false,waitSeconds:120,maxTtlSeconds:30,maxActionsPerHour:1}}}})).status(),200);
 assert.equal((await (await context.request.get('http://probe:8080/check')).json()).status,200);
 const tool=process.env.GUARDSCALE_SECURITY_TOOL??'attack';assert.ok(['attack','ffuf','nuclei'].includes(tool));
 const attackStarted=Date.now();const attack=await context.request.post('http://probe:8080/'+tool,{timeout:110000});assert.equal(attack.status(),200);const run=await attack.json();
 if(tool==='attack')assert.equal(run.requests,60);else{assert.equal(run.tool,tool);assert.equal(run.exitCode,0,'Real scanner must execute successfully, not be simulated');assert.ok(run.requestLimit<=60);}
 let incident;
 await wait(async()=>{incident=(await json('/api/v1/incidents')).find(v=>v.payload?.source_ip==='192.0.2.20'&&Date.parse(v.startedAt)>=attackStarted-1000);return !!incident;},'real detector incident');
 console.log('2/5 Bounded suspicious requests produced a real detector incident.');
 await wait(async()=>{const d=await json('/api/v1/incidents/'+incident.incidentId);incident=d.incident;return !!incident.payload?.analysis;},'explicit AI assessment status');
 if(process.env.GUARDSCALE_TEST_BEDROCK==='true'){
  assert.equal(incident.payload.analysis.status,'complete','Real Bedrock must complete; unavailable/not_configured is not a passing AI test');
  assert.ok(incident.payload.analysis.trace?.some(v=>v.tool==='inspect_server'&&v.status==='complete'));
  assert.ok(incident.payload.analysis.trace?.some(v=>v.tool==='request_human_approval'&&v.status==='complete'));
 }
 await wait(async()=>(await json('/api/v1/nodes/local-php-fixture')).events.some(e=>e.type==='notification.sent'&&e.metadata.delivery==='local_only'),'local alert audit (not external delivery)');
 // Actual human approval surface, not a bypass or synthetic command injection.
 const page=await context.newPage();await page.goto(base+'/incidents/'+incident.incidentId);
 await page.getByRole('region',{name:'What happened'}).waitFor();
 assert.ok((await page.getByRole('region',{name:'What happened'}).innerText()).includes('Requests observed'));
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Block source temporarily…'}).click();
 console.log('3/5 Playwright approved Protect through the human-review UI.');
 await wait(async()=>{const commands=(await json('/api/v1/incidents/'+incident.incidentId)).commands;if(commands.some(c=>['failed','rejected'].includes(c.status)))throw Error('Agent rejected or failed the disposable block; inspect firewall capabilities and target policy');return commands.some(c=>c.status==='applied');},'agent firewall application (requires ipset kernel support)');
 assert.equal((await (await context.request.get('http://probe:8080/check')).json()).status,'blocked');
 console.log('4/5 Probe blocked; checking operator reachability and automatic expiry.');
 assert.equal((await context.request.get('http://site')).status(),200,'operator/browser connection is not blocked');
 assert.equal((await context.request.get(base+'/api/health')).status(),200,'control plane remains reachable');
 await wait(async()=>(await (await context.request.get('http://probe:8080/check')).json()).status===200,'automatic kernel expiry');
 await wait(async()=>(await json('/api/v1/incidents/'+incident.incidentId)).commands.some(c=>c.status==='expired'),'expiry audit');
 console.log('5/5 Block expired, probe recovered and audit was retained.');
 console.log(JSON.stringify({passed:true,trafficGenerator:tool,detection:'real',analysis:incident.payload.analysis.status,alert:'local audit only; not email/WhatsApp delivery',humanApproval:true,block:true,expiry:true,operatorUnaffected:true}));
}catch(error){console.error(JSON.stringify({pageErrors:errors,pages:await Promise.all(context.pages().map(async p=>({url:p.url(),headings:await p.locator('h1,h2').allTextContents(),buttons:await p.getByRole('button').allTextContents()})))}));throw error;}finally{await browser.close();}
