import {lookup} from 'node:dns/promises';
import {BlockList,isIP} from 'node:net';
import http from 'node:http';
import https from 'node:https';
import {uptimeLimits,uptimePortError,type UptimeSample} from './uptime-model';

const denied=new BlockList();
for(const [address,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]] as const)denied.addSubnet(address,prefix,'ipv4');
const globalV6=new BlockList();globalV6.addSubnet('2000::',3,'ipv6');
const deniedV6=new BlockList();for(const [a,p] of [['2001:db8::',32],['2001::',23],['2002::',16],['3fff::',20]] as const)deniedV6.addSubnet(a,p,'ipv6');
export function publicMonitorAddress(address:string){const family=isIP(address);return family===4?!denied.check(address,'ipv4'):family===6&&globalV6.check(address,'ipv6')&&!deniedV6.check(address,'ipv6');}
export function localMonitorHostname(value:string){
 const host=value.toLowerCase().replace(/\.$/,'').replace(/^\[|\]$/g,'');
 return ['localhost','test','local','localdomain','internal','invalid','example','home.arpa','localtest.me','lvh.me'].some(suffix=>host===suffix||host.endsWith('.'+suffix))||!host.includes('.')&&!host.includes(':')||!!isIP(host)&&!publicMonitorAddress(host);
}
export function monitorURL(value:unknown){
 if(typeof value!=='string'||value.length>2048)throw Error('Enter a public HTTP(S) website URL');
 let url:URL;try{url=new URL(value.trim())}catch{throw Error('Enter a full http:// or https:// website URL')}
 const portError=uptimePortError(url.href);if(portError)throw Error(portError);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.hash||url.search||url.port&&!['80','443'].includes(url.port))throw Error('Use HTTP(S) on port 80 or 443, without credentials, queries or fragments');
 const host=url.hostname.replace(/^\[|\]$/g,'');
 if(localMonitorHostname(host))throw Error('Local and test hostnames are not public uptime targets');
 return url;
}

// Resolve once and pin the connection to a validated public address. Redirects
// are not followed: a 3xx response proves the configured HTTP endpoint responded.
// No cookies, authentication headers, response bodies or proxy settings are used.
export async function probeWebsite(value:string):Promise<UptimeSample>{
 const at=new Date().toISOString(),start=Date.now();
 const result=(ok:boolean,statusCode?:number,error?:string):UptimeSample=>({at,ok,durationMs:Date.now()-start,...(statusCode?{statusCode}:{}),...(error?{error}:{})});
 try{
  const url=monitorURL(value),host=url.hostname.replace(/^\[|\]$/g,'');
  const addresses=await Promise.race([lookup(host,{all:true,verbatim:true}),new Promise<never>((_,reject)=>{const t=setTimeout(()=>reject(Error('DNS timeout')),2000);t.unref()})]);
  if(!addresses.length||addresses.some(a=>!publicMonitorAddress(a.address)))return result(false,undefined,'Target did not resolve exclusively to public addresses');
  const selected=addresses[0];
  return await new Promise<UptimeSample>(resolve=>{
   const req=(url.protocol==='https:'?https:http).request(url,{method:'GET',agent:false,family:selected.family,maxHeaderSize:16384,
    headers:{'user-agent':'GuardScale-Uptime/1.0','accept':'*/*'},
    lookup:(_hostname,_options,callback)=>callback(null,selected.address,selected.family),
   },res=>{const status=res.statusCode??0;resolve(result(status>=200&&status<400,status));res.destroy();});
   const deadline=setTimeout(()=>{req.destroy();resolve(result(false,undefined,'Connection timed out'));},Math.max(1,uptimeLimits.timeoutMs-(Date.now()-start)));
   req.once('close',()=>clearTimeout(deadline));
   req.on('error',(error:NodeJS.ErrnoException)=>resolve(result(false,undefined,['CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT','ERR_TLS_CERT_ALTNAME_INVALID'].includes(error.code??'')?'TLS certificate validation failed':'Connection failed')));
   req.end();
  });
 }catch{return result(false,undefined,'DNS lookup or target validation failed')}
}
