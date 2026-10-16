import {store} from './store';
import {approveProtection,commandsFor,withAutoGuardianLock} from './protection-commands';
import type {GuardianAssessment} from './guardian';
// Admin-approved standing policy, never a model granting itself permission.
export async function evaluateAutoGuardian(){
 for(const org of await store.organizations()){
  const settings=await store.settings(org.id),policy=settings.response.autoGuardian;
  if(!policy?.enabled||!settings.response.allowRemoteRequests||settings.response.dryRun)continue;
  if(!Number.isInteger(policy.waitSeconds)||policy.waitSeconds<60||policy.waitSeconds>600||!Number.isInteger(policy.maxTtlSeconds)||policy.maxTtlSeconds<10||policy.maxTtlSeconds>120||!Number.isInteger(policy.maxActionsPerHour)||policy.maxActionsPerHour<1||policy.maxActionsPerHour>3)continue;
  await withAutoGuardianLock(org.id,async()=>{
  const commands=await commandsFor(org.id);
  let actions=commands.filter(c=>c.approvedBy==='auto-guardian-policy'&&Date.parse(c.createdAt)>Date.now()-3600000).length;
  for(const incident of await store.incidents(org.id)){
   if(actions>=policy.maxActionsPerHour)break;
   const age=Date.now()-Date.parse(incident.startedAt);
   if(incident.state!=='review'||age<policy.waitSeconds*1000||age>15*60000||commands.some(c=>c.incidentId===incident.incidentId&&c.kind!=='inspect_server'))continue;
   const p=incident.payload as {candidate_id?:string;analysis?:GuardianAssessment;findings?:{name?:string;severity?:string}[];notified?:string[];alertedAt?:string;alertDelivery?:string};
   const alertedAt=Date.parse(p.alertedAt??'');
   if(p.alertDelivery!=='provider_accepted'||!Number.isFinite(alertedAt)||Date.now()-alertedAt<policy.waitSeconds*1000)continue;
   // Require a delivered alert, completed real agent inspection, and a critical correlated finding.
   if(!p.candidate_id||process.env.GUARDSCALE_NOTIFICATION_MODE!=='aws'||!p.notified?.length||p.analysis?.status!=='complete'||p.analysis.recommendation!=='protect'||!p.analysis.trace?.some(v=>v.tool==='inspect_server'&&v.status==='complete')||!p.findings?.some(v=>v.severity==='critical'))continue;
   await approveProtection(org.id,incident.incidentId,'auto-guardian-policy',policy.maxTtlSeconds);actions++;
  }
  });
 }
}
