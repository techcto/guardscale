import http from 'node:http';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
if(process.env.GUARDSCALE_SECURITY_TEST!=='true')throw Error('Explicit security-test opt-in required');
let lastRun=0,paused=false;
let activeChild=null;
async function runTool(tool){
 const args=tool==='ffuf'?['-u','http://site/FUZZ','-w','/fixtures/paths.txt','-t','1','-rate','5','-timeout','2','-maxtime','20','-noninteractive','-mc','all','-of','json','-o','/tmp/ffuf-local.json']:
 ['-u','http://site','-t','/fixtures/local-enumeration.yaml','-duc','-ni','-dr','-no-stdin','-rl','5','-c','1','-pc','1','-bs','1','-timeout','2','-retries','0','-mhe','3','-silent'];
 const result=await new Promise(resolve=>{
  let output='',finished=false;const child=spawn(tool,args,{cwd:'/tmp'});activeChild=child;
  const timer=setTimeout(()=>{child.kill('SIGTERM');setTimeout(()=>child.kill('SIGKILL'),2000).unref();},90000);
  const finish=value=>{if(finished)return;finished=true;clearTimeout(timer);activeChild=null;resolve(value);};
  for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{output=(output+chunk.toString()).slice(-16000)});
  child.on('error',()=>finish({tool,exitCode:1,error:'Scanner binary unavailable; start the optional --tools fixture.'}));
  child.on('close',code=>finish({tool,exitCode:code??1,output}));
 });
 if(tool==='ffuf'&&result.exitCode===0){try{result.requests=JSON.parse(await readFile('/tmp/ffuf-local.json','utf8')).results.length;}catch{/* No fabricated count. */}}
 return {...result,requestLimit:tool==='ffuf'?60:32,unreachable:await request('/')==='blocked',stopped:paused};
}
async function request(path){try{const r=await fetch('http://site'+path,{signal:AbortSignal.timeout(1500)});await r.arrayBuffer();return r.status;}catch{return 'blocked';}}
http.createServer(async(req,res)=>{
 res.setHeader('content-type','application/json');
 if(req.url==='/stop'&&req.method==='POST'){paused=true;activeChild?.kill('SIGTERM');res.end(JSON.stringify({stopped:true}));return;}
 if(req.url==='/resume'&&req.method==='POST'){paused=false;res.end(JSON.stringify({resumed:true}));return;}
 if(req.url==='/check'){res.end(JSON.stringify({status:await request('/'),paused}));return;}
 if(['/ffuf','/nuclei'].includes(req.url)&&req.method==='POST'&&!paused&&!activeChild&&Date.now()-lastRun>60000){
  if(process.env.GUARDSCALE_SECURITY_TOOLS!=='true'){res.statusCode=503;res.end(JSON.stringify({error:'Real scanners are not installed. Start npm run local:security -- --tools first.'}));return;}
  lastRun=Date.now();res.end(JSON.stringify(await runTool(req.url.slice(1))));return;
 }
 if(req.url==='/attack'&&req.method==='POST'&&!paused&&!activeChild&&Date.now()-lastRun>60000){
  lastRun=Date.now();let count=0;
  // Fixed disposable target, fixed bounded requests, no destructive payloads or concurrency.
  let unreachable=false;
  for(let i=0;i<60&&!paused;i++){const status=await request('/missing-security-'+i+'?table_filter=test');count++;if(status==='blocked'){unreachable=true;break;}await new Promise(r=>setTimeout(r,80));}
  res.end(JSON.stringify({requests:count,unreachable,stopped:paused}));return;
 }
 res.statusCode=404;res.end('{}');
}).listen(8080,'0.0.0.0');
