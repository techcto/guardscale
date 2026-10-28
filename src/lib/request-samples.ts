export type RequestSample={method:string;path:string;status:number;count:number};
export function requestSamples(input:unknown):RequestSample[]{
 if(!Array.isArray(input))return [];
 const samples:RequestSample[]=[];
 for(const value of input.slice(0,5)){
  if(!value||typeof value!=='object')continue;
  const {method,path,status,count}=value as Record<string,unknown>;
  if(typeof method!=='string'||!['GET','POST','HEAD','PUT','PATCH','DELETE','OPTIONS','CONNECT','TRACE'].includes(method)||typeof path!=='string'||path.length>1024||!Number.isInteger(status)||Number(status)<100||Number(status)>599||!Number.isInteger(count)||Number(count)<1||Number(count)>1000)continue;
  let decoded=path;try{decoded=decodeURIComponent(path)}catch{/* Keep malformed path evidence as literal text. */}
  decoded=decoded.split(/[?#]/)[0].replace(/[\u0000-\u001f\u007f]/g,'');
  if(!decoded.startsWith('/')||decoded.startsWith('//'))continue;
  const parts=decoded.split('/');let sensitive=false;
  for(let i=0;i<parts.length;i++){
   const part=parts[i];if(sensitive||part.length>32||/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(part))parts[i]='[redacted]';
   sensitive=/^(token|secret|password|reset-password|verify-email|api-key)$/i.test(part);
  }
  samples.push({method,path:parts.join('/').slice(0,180),status:Number(status),count:Number(count)});
 }
 return samples;
}
export function requestSampleLines(input:unknown){return requestSamples(input).map(s=>`${s.method} ${s.path} — HTTP ${s.status} · ${s.count} request${s.count===1?'':'s'}`);}
