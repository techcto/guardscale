if(process.env.GUARDSCALE_SECURITY_TEST!=='true')throw Error('Disposable security probe only');
const mode=process.argv[2];if(!['attack','ffuf','nuclei','recover','stream'].includes(mode))throw Error('Unsupported test mode');
const base='http://127.0.0.1:8080'; // Only the existing fixed-target probe service.
async function check(){const value=await (await fetch(base+'/check',{signal:AbortSignal.timeout(4000)})).json();if(value.paused){console.error('Request generation stopped by the operator.');process.exit(130);}return value.status;}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
if(mode==='recover'){
 const deadline=Date.now()+910000;
 while(Date.now()<deadline){if(await check()===200){console.log('Probe HTTP 200: access restored.');process.exit(0);}await sleep(2000);}
 throw Error('Access did not recover within the maximum block window. Inspect the agent audit; no success is claimed.');
}
await fetch(base+'/resume',{method:'POST',signal:AbortSignal.timeout(4000)});
if(mode==='stream'){
 const deadline=Date.now()+30*60*1000;let requests=0,blocked=0;
 while(Date.now()<deadline){await check();try{const r=await fetch('http://site/missing-security-stream?table_filter=test',{signal:AbortSignal.timeout(1500)});await r.arrayBuffer();}catch{blocked++;}requests++;if(requests%15===0)console.log(JSON.stringify({requests,blockedAttempts:blocked}));await sleep(1000);}
 console.log('30-minute local test limit reached.');process.exit(0);
}
if(await check()!==200)throw Error('Test website is not reachable before the run. Start the fixture or wait for an earlier block to expire.');
const deadline=Date.now()+180000,maxBursts=mode==='attack'?3:1;let bursts=0,nextBurst=0;
while(Date.now()<deadline){
 if(await check()==='blocked'){console.log('Probe lost access. Stopping suspicious requests; checking actual firewall state next.');process.exit(0);}
 if(bursts<maxBursts&&Date.now()>=nextBurst){
  const response=await fetch(base+'/'+mode,{method:'POST',signal:AbortSignal.timeout(110000)});
  if(response.ok){const result=await response.json();if(result.stopped)process.exit(130);bursts++;console.log(`${mode} run ${bursts}/${maxBursts}: ${result.requests??'bounded'} requests. Review the incident in GuardScale.`);if(result.output)console.log(result.output);if(result.unreachable){console.log('Probe lost access during the burst; checking firewall state next.');process.exit(0);}if(result.exitCode!==undefined&&result.exitCode!==0)throw Error('Real scanner failed; no successful scan is claimed.');}
  else if(response.status===503)throw Error((await response.json()).error);
  else console.log('Probe cooldown active; no extra burst sent.');
  nextBurst=Date.now()+61000;
 }
 await sleep(2000);
}
console.error('Bounded run ended; no block was observed. Check incident approval, Settings → Response and agent protection policy. No automatic approval was made.');
process.exit(2);
