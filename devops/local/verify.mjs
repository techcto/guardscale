import {readFile} from 'node:fs/promises';
if(process.env.GUARDSCALE_LOCAL_FIXTURE!=='true')throw Error('Local fixture only');
const base='http://web:3000';let cookie='';
async function request(path,body,method=body?'POST':'GET'){
 const response=await fetch(base+path,{method,headers:{cookie,origin:base,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 if(!response.ok)throw Error(`Fixture verification ${path}: HTTP ${response.status}`);
 const cookies=response.headers.getSetCookie();if(cookies.length)cookie=cookies.map(v=>v.split(';')[0]).join('; ');
 return response.json();
}
const identity=await request('/api/auth/login',{username:'root',password:(await readFile('/run/secrets/root_password','utf8')).trim()});
const org=(await request('/api/orgs')).find(v=>v.id===identity.orgId);
if(!org)throw Error('Root default workspace is unavailable');
await request('/api/orgs/active',{orgId:org.id});
const deadline=Date.now()+60000;
while(Date.now()<deadline){
 const server=(await request('/api/v1/nodes')).find(v=>v.serverId==='local-php-fixture'&&v.agentId==='local-php-agent');
 if(server&&Date.now()-Date.parse(server.lastHeartbeat)<15000){
  if(server.websiteUrls===undefined)await request('/api/v1/nodes/local-php-fixture',{websiteUrls:[process.env.GUARDSCALE_FIXTURE_SITE_URL??'http://localhost:8184']},'PATCH');
  console.log('Ready: root workspace / local-php-fixture has a fresh authenticated real-agent heartbeat and website settings.');process.exit(0);
 }
 await new Promise(resolve=>setTimeout(resolve,1000));
}
throw Error('No fresh fixture heartbeat. Check docker compose logs site; no server was fabricated.');
