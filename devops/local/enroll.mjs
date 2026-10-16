import {readFile,writeFile,chmod} from 'node:fs/promises';
if(process.env.GUARDSCALE_LOCAL_FIXTURE!=='true')throw Error('Local fixture only');
const base='http://web:3000';let cookie='';
async function request(path,body){
 const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',origin:base,...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
 if(!r.ok)throw Error(`Enrollment ${path}: HTTP ${r.status}`);
 const set=r.headers.getSetCookie();if(set.length)cookie=set.map(v=>v.split(';')[0]).join('; ');
 return r.json();
}
const identity=await request('/api/auth/login',{username:'root',password:(await readFile('/run/secrets/root_password','utf8')).trim()});
const orgs=await request('/api/orgs');
const org=orgs.find(v=>v.id===identity.orgId);
if(!org)throw Error('Root default workspace is unavailable');
await request('/api/orgs/active',{orgId:org.id});
const credential=await request('/api/v1/nodes/enrollment');
await writeFile('/runtime/enrollment.token',credential.enrollmentToken,{mode:0o600});
await chmod('/runtime/enrollment.token',0o600);
await writeFile('/runtime/config.yaml',`server:
  id: local-php-fixture
  tenant: ${credential.tenantId}
control_plane:
  endpoint: http://web:3000
  agent_id: local-php-agent
  token_file: /runtime/enrollment.token
  heartbeat_seconds: 5
logs:
  apache_access: /var/log/guardscale/access.log
  apache_error: /var/log/guardscale/apache-error.log
  php_error: /var/log/guardscale/php-error.log
storage:
  state_dir: /var/lib/guardscale
  max_evidence_lines: 100
  max_incidents: 10
protection:
  enabled: ${process.env.GUARDSCALE_SECURITY_TEST==='true'}
  dry_run: ${process.env.GUARDSCALE_SECURITY_TEST!=='true'}
${process.env.GUARDSCALE_SECURITY_TEST==='true'?'  allowed_cidrs:\n    - 192.0.2.20/32\n':''}
`,{mode:0o600});
console.log('Dedicated local organization enrolled; credentials stored only in runtime volume.');
