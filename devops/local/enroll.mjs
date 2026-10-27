import {readFile,writeFile,chmod} from 'node:fs/promises';
if(process.env.GUARDSCALE_LOCAL_FIXTURE!=='true')throw Error('Local fixture only');
const base=process.env.GUARDSCALE_FIXTURE_CONTROL_URL??'http://web:3000';let cookie='';
const production=process.env.GUARDSCALE_FIXTURE_PRODUCTION==='true';
if(!['http://web:3000','http://guardscale-web:3000',...(production?['https://guardscale.org']:[])].includes(base))throw Error('Only an explicitly selected GuardScale control plane is allowed');
if(production&&base!=='https://guardscale.org')throw Error('Production test requires the fixed GuardScale HTTPS origin');
const serverId=process.env.GUARDSCALE_FIXTURE_SERVER_ID??(production?'local-php-fixture-prod':'local-php-fixture');
const agentId=production?'local-php-agent-prod':'local-php-agent';
const mainLab=base==='http://guardscale-web:3000'||production;
const probeCIDRs=mainLab?(process.env.GUARDSCALE_FIXTURE_MULTI_SOURCE==='true'?['198.51.100.20/32','198.51.100.21/32','198.51.100.22/32']:['198.51.100.20/32']):['192.0.2.20/32'];
if(!/^[a-zA-Z0-9._-]{1,100}$/.test(serverId))throw Error('Invalid local test server ID');
async function request(path,body){
 const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',origin:base,...(cookie?{cookie}:{})},redirect:'error',...(body?{body:JSON.stringify(body)}:{})});
 if(!r.ok)throw Error(`Enrollment ${path}: HTTP ${r.status}`);
 const set=r.headers.getSetCookie();if(set.length)cookie=set.map(v=>v.split(';')[0]).join('; ');
 return r.json();
}
let identity;
if(production){
 const token=(await readFile('/run/secrets/production_session','utf8')).trim();
 if(!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))throw Error('Private session file must contain only the cookie value');
 cookie='guardscale_session='+token;
 identity=JSON.parse(Buffer.from(token.split('.')[0],'base64url').toString('utf8'));
}else identity=await request('/api/auth/login',{username:process.env.GUARDSCALE_ROOT_USER??'root',password:process.env.GUARDSCALE_ROOT_PASSWORD??(await readFile('/run/secrets/root_password','utf8')).trim()});
const orgs=await request('/api/orgs');
const org=orgs.find(v=>v.id===identity.orgId);
if(!org)throw Error('Root default workspace is unavailable');
if(!production)await request('/api/orgs/active',{orgId:org.id});
const credential=await request('/api/v1/nodes/enrollment');
await writeFile('/runtime/enrollment.token',credential.enrollmentToken,{mode:0o600});
await chmod('/runtime/enrollment.token',0o600);
await writeFile('/runtime/config.yaml',`server:
  id: ${serverId}
  tenant: ${credential.tenantId}
control_plane:
  endpoint: ${base}
  agent_id: ${agentId}
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
${process.env.GUARDSCALE_SECURITY_TEST==='true'?'  allowed_cidrs:\n'+probeCIDRs.map(cidr=>'    - '+cidr+'\n').join(''):''}
`,{mode:0o600});
console.log('Dedicated local organization enrolled; credentials stored only in runtime volume.');
