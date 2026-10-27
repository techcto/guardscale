export type UptimeSample={at:string;ok:boolean;durationMs:number;statusCode?:number;error?:string};
export type UptimeNotice={id:string;incidentId:string;kind:'down'|'recovered';at:string;sent:string[];sample?:UptimeSample};
export type UptimeMonitor={
 id:string;orgId:string;name:string;url:string;intervalSeconds:number;recipientIds:string[];whatsapp:boolean;tags:string[];paused:boolean;
 revision:number;createdAt:string;updatedAt:string;nextCheckAt:string;state:'unknown'|'up'|'down';stateSince?:string;
 failures:number;successes:number;samples:UptimeSample[];notices:UptimeNotice[];outages:{incidentId:string;startedAt:string;resolvedAt?:string}[];activeIncidentId?:string;
 leaseUntil?:number;leaseOwner?:string;
};
export const uptimeLimits={monitors:50,samples:1440,intervals:[60,300,900],timeoutMs:8000};
export function monitorStatus(m:Pick<UptimeMonitor,'paused'|'samples'|'intervalSeconds'|'state'>,now=Date.now()){
 if(m.paused)return 'paused';
 const last=m.samples.at(-1);
 if(!last)return 'unknown';
 return now-Date.parse(last.at)>Math.max(180000,m.intervalSeconds*2000+30000)?'stale':m.state;
}
export function uptimeSummary(m:UptimeMonitor){
 const recent=m.samples.filter(s=>Date.parse(s.at)>=Date.now()-86400000);
 return {checks:recent.length,availability:recent.length?100*recent.filter(s=>s.ok).length/recent.length:null,
  responseMs:recent.some(s=>s.ok)?Math.round(recent.filter(s=>s.ok).reduce((n,s)=>n+s.durationMs,0)/recent.filter(s=>s.ok).length):null};
}
