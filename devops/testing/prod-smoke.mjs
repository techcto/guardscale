import {readFile,stat} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';

// Authenticated GET-only checks. Never print cookies or response bodies.
const base=new URL(process.env.GUARDSCALE_SMOKE_URL??'https://guardscale.org');
if(base.origin!=='https://guardscale.org'&&!['http://localhost','http://127.0.0.1'].some(v=>base.origin===v||base.origin.startsWith(v+':')))throw Error('Only GuardScale production or localhost is allowed');
const path=process.env.GUARDSCALE_SESSION_FILE;if(!path)throw Error('Set GUARDSCALE_SESSION_FILE to a private file outside the repository');
if(!(await stat(path)).isFile())throw Error('Session path must be a file');
const token=(await readFile(path,'utf8')).trim();if(!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))throw Error('File must contain only the session cookie value');
const results=[];let failures=0;
async function check(path,{auth=true,json=true,status=200,validate=()=>true}={}){
 const start=performance.now();
 try{
  const response=await fetch(new URL(path,base),{headers:{accept:json?'application/json':'text/html',...(auth?{cookie:'guardscale_session='+token}:{})},redirect:'manual',signal:AbortSignal.timeout(20000)});
  const body=await response.text();let value=body;if(json){try{value=JSON.parse(body)}catch{throw Error('Expected JSON response')}}
  const allowed=Array.isArray(status)?status:[status];
  if(!allowed.includes(response.status))throw Error('HTTP '+response.status+'; expected '+allowed.join('/'));
  if(!validate(value,response))throw Error('Response contract failed');
  const result={path,status:response.status,ms:Math.round(performance.now()-start),bytes:Buffer.byteLength(body),passed:true};results.push(result);console.log('PASS',path,result.status,result.ms+'ms',result.bytes+' bytes');return value;
 }catch(error){failures++;results.push({path,passed:false});console.error('FAIL',path,error instanceof Error?error.message:'Request failed');return null;}
}
await check('/api/health',{auth:false});
await check('/api/v1/nodes',{auth:false,json:false,status:[401,303,307],validate:(_value,response)=>response.status===401||new URL(response.headers.get('location')??'/',base).pathname==='/login'});
const orgs=await check('/api/orgs',{validate:Array.isArray});
const nodes=await check('/api/v1/nodes',{validate:Array.isArray});
const incidents=await check('/api/v1/incidents',{validate:Array.isArray});
await check('/api/v1/settings',{validate:v=>!!v&&typeof v==='object'});
await check('/api/v1/billing/plan',{validate:v=>typeof v?.serverLimit==='number'});
await check('/api/v1/products',{validate:Array.isArray});
await check('/api/v1/usage',{validate:v=>!!v&&typeof v==='object'});
await check('/api/v1/activity',{validate:v=>Array.isArray(v?.entries)});
for(const route of ['/console','/servers','/incidents','/settings','/providers','/billing'])await check(route,{json:false,validate:v=>v.includes('<html')&&!v.includes('NEXT_REDIRECT')});
for(const route of ['/','/api-reference','/docs/mcp'])await check(route,{auth:false,json:false,validate:html=>{const header=html.match(/<header[\s\S]*?<\/header>/)?.[0]??'';return !!header&&!/>\s*Demo\s*</i.test(header);}});
console.log(JSON.stringify({passed:failures===0,checks:results.length,failures,organizations:orgs?.length??null,servers:nodes?.length??null,incidents:incidents?.length??null}));
if(failures)process.exitCode=1;
