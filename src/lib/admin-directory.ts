import {store} from './store';
import {usageSummary} from './usage';
import type {GuardScaleUser,Node} from './model';
// Admin views expose server inventory and usage totals only: never logs, events, incidents, website URLs, or credentials.
export type ServerSummary={id:string;orgId:string;name:string;platform:string;status:Node['status'];sites:number;connectedAt:string;lastSeen:string};
export const serverSummary=(n:Node):ServerSummary=>({id:n.serverId,orgId:n.tenantId,name:n.displayName||n.serverId,platform:n.platform??'—',status:n.status,sites:n.websiteUrls?.length??0,connectedAt:n.createdAt,lastSeen:n.lastHeartbeat});
export async function directoryServers(){
 const orgs=await store.organizations();
 return (await Promise.all(orgs.map(async org=>(await store.nodes(org.id)).map(n=>({...serverSummary(n),organization:org.name}))))).flat().sort((a,b)=>a.organization.localeCompare(b.organization)||a.name.localeCompare(b.name));
}
// Users are indexed by username only, so the directory is built from organization memberships.
export async function directoryUsers(){
 const users=new Map<string,{user:GuardScaleUser;organizations:number}>();
 for(const members of await Promise.all((await store.organizations()).map(o=>store.membersOfOrg(o.id))))for(const {user} of members)users.set(user.id,{user,organizations:(users.get(user.id)?.organizations??0)+1});
 return [...users.values()].sort((a,b)=>a.user.displayName.localeCompare(b.user.displayName));
}
// Metered usage for the current billing period, one row per meter (Osirus admin billing-panel pattern).
export type UsageRow={meter:string;unit:string;used:number|null;included:number|null;overage:number};
export async function organizationUsage(orgId:string){
 const s=await usageSummary(orgId);
 const rows:UsageRow[]=[
  {meter:'Server hours',unit:'hours',used:s.usage.server_hours,included:s.included.server_hours,overage:s.overage.server_hours},
  {meter:'Log ingestion',unit:'MB',used:s.usage.log_mb,included:s.included.log_mb,overage:Math.round(s.overage.log_mb*100)/100},
  {meter:'AI credits',unit:'credits',used:s.usage.ai_credits,included:s.included.ai_credits,overage:Math.round(s.overage.ai_credits*100)/100},
 ];
 return {plan:s.plan,period:s.usage_period,rows,servers:s.included.servers,exportEnabled:s.billing.export_enabled,pendingHours:s.billing.pending_hours,exportedHours:s.billing.exported_hours,unpricedAiCalls:s.usage.unpriced_ai_calls};
}
export const adminDate=(v?:string)=>v&&Number.isFinite(Date.parse(v))?new Date(v).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'}):'—';
export const formatUnits=(n:number|null,unit:string)=>n===null?'Not metered':`${n.toLocaleString('en-US',{maximumFractionDigits:2})} ${n===1&&unit==='hours'?'hour':unit}`;
// Billing periods are UTC with an exclusive end, so show the last included day in UTC.
const utcDay=(ms:number)=>new Date(ms).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'});
export const periodLabel=(p:{start:string;end:string})=>`${utcDay(Date.parse(p.start))} – ${utcDay(Date.parse(p.end)-1)}`;
