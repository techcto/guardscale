export type HostMetrics={sampledAt:string;receivedAt:string;intervalSeconds:number;cpuPercent?:number;memoryTotalBytes:number;memoryUsedBytes:number;memoryPercent:number};
export function validateHostMetrics(input:unknown,receivedAt=new Date().toISOString()):HostMetrics{
 if(!input||typeof input!=='object')throw Error('Invalid host metrics');
 const m=input as Record<string,unknown>;
 const number=(key:string,max:number)=>{const v=m[key];if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>max)throw Error('Invalid '+key);return v;};
 if(typeof m.sampled_at!=='string'||!Number.isFinite(Date.parse(m.sampled_at)))throw Error('Invalid sample timestamp');
 const memoryTotalBytes=number('memory_total_bytes',2**50),memoryUsedBytes=number('memory_used_bytes',2**50);
 if(!Number.isSafeInteger(memoryTotalBytes)||!Number.isSafeInteger(memoryUsedBytes)||memoryTotalBytes===0||memoryUsedBytes>memoryTotalBytes)throw Error('Invalid memory counters');
 const intervalSeconds=m.interval_seconds===undefined?5:number('interval_seconds',300);if(intervalSeconds<5)throw Error('Invalid sample interval');
 return {sampledAt:m.sampled_at,receivedAt,intervalSeconds,...(m.cpu_percent===undefined?{}:{cpuPercent:number('cpu_percent',100)}),memoryTotalBytes,memoryUsedBytes,memoryPercent:100*memoryUsedBytes/memoryTotalBytes};
}
