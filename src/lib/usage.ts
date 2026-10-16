import {store} from './store';
import {notifier,type Notifier} from './notifications';
import type {Settings,Subscription,UsageAi,UsageCounts,UsageHour} from './model';

// Measured units, priced like the AWS services they run on: server-hours (EC2 instance-hours),
// log MB ingested (CloudWatch Logs ingestion; 7-day retention included) and Guardian AI credits (Bedrock tokens).
export const SERVER_METER='guardscale_server_hours_v1',LOG_METER='guardscale_log_mb_v1',AI_METER='guardscale_ai_credits_v1';
export const meters=[SERVER_METER,LOG_METER,AI_METER] as const;
type Meter=typeof meters[number];
// AWS bills binary megabytes; CloudWatch Logs counts each event as its UTF-8 message bytes plus 26 bytes.
export const MB=1024*1024,LOG_ENTRY_OVERHEAD=26;
export const logEntryBytes=(message:string)=>Buffer.byteLength(message,'utf8')+LOG_ENTRY_OVERHEAD;
const saas=()=>process.env.GUARDSCALE_DEPLOYMENT_MODE==='saas';
// Off by default. Export also gates overage in limits, so no extra usage is ever allowed without a way to bill it.
export const usageExportEnabled=()=>saas()&&process.env.GUARDSCALE_USAGE_EXPORT==='enabled';
export const overagePrices=():Record<Meter,string|null>=>({[SERVER_METER]:process.env.STRIPE_SERVER_OVERAGE_PRICE_ID||null,[LOG_METER]:process.env.STRIPE_LOG_OVERAGE_PRICE_ID||null,[AI_METER]:process.env.STRIPE_AI_OVERAGE_PRICE_ID||null});
export const hourOf=(date=new Date())=>date.toISOString().slice(0,13);

// Versioned token-to-credit weights per approved model, plus AI credits included per plan. No defaults: unpriced AI usage is reported, never limited or exported.
type Weights={version:string;included_credits:Record<string,number>;models:Record<string,{input_per_1k:number;output_per_1k:number}>};
export function creditWeights():Weights|null{
 const raw=process.env.GUARDSCALE_AI_CREDIT_WEIGHTS_JSON;if(!raw)return null;
 try{const v=JSON.parse(raw),rate=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1000000;
  if(typeof v?.version!=='string'||!/^[-a-z0-9_.]{1,40}$/i.test(v.version)||!v.models||typeof v.models!=='object'||Object.keys(v.models).length>50||Object.values(v.models).some((m:unknown)=>!rate((m as {input_per_1k?:unknown})?.input_per_1k)||!rate((m as {output_per_1k?:unknown})?.output_per_1k))||(v.included_credits!==undefined&&(typeof v.included_credits!=='object'||Object.values(v.included_credits).some(n=>!Number.isInteger(n)||!rate(n)))))throw Error();
  return{version:v.version,included_credits:v.included_credits??{},models:v.models}}catch{console.error('Invalid GUARDSCALE_AI_CREDIT_WEIGHTS_JSON; AI usage stays unpriced');return null}
}
// Log MB included per plan. No defaults: without it, log usage is reported, never limited or exported.
export function logAllowances():Record<string,number>|null{
 const raw=process.env.GUARDSCALE_LOG_MB_INCLUDED_JSON;if(!raw)return null;
 try{const v=JSON.parse(raw);if(!v||typeof v!=='object'||Array.isArray(v)||Object.values(v).some(n=>!Number.isInteger(n)||(n as number)<0||(n as number)>100000000))throw Error();return v}catch{console.error('Invalid GUARDSCALE_LOG_MB_INCLUDED_JSON; log usage stays unpriced');return null}
}
// Fractional credits for measured tokens; calls without reported tokens or approved weights are unpriced.
export function aiCredits(ai:UsageAi,weights:Weights|null){
 let credits=0,unpriced=0;
 for(const [model,m] of Object.entries(ai)){const w=weights?.models[model];if(!w){unpriced+=m.calls;continue}credits+=(m.inputTokens*w.input_per_1k+m.outputTokens*w.output_per_1k)/1000;unpriced+=m.unknownCalls}
 return{credits,unpriced};
}

// The paid Stripe period when the webhook has stored one; otherwise the current calendar month.
export type Period={start:string;end:string;source:'stripe_subscription'|'calendar_month'};
export function usagePeriod(subscription:Subscription|null,now=new Date()):Period{
 if(subscription?.currentPeriodStart&&subscription.currentPeriodEnd)return{start:subscription.currentPeriodStart,end:subscription.currentPeriodEnd,source:'stripe_subscription'};
 return{start:new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)).toISOString(),end:new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1)).toISOString(),source:'calendar_month'};
}
export type Allowance={serverHours:number;logBytes:number|null;aiCredits:number|null};
// Included server-hours are the plan's servers for every hour of the period, so a server added late costs only its hours.
export function allowanceFor(productId:string,serverLimit:number,period:Period,weights=creditWeights(),logs=logAllowances()):Allowance{
 const hours=Math.round((Date.parse(period.end)-Date.parse(period.start))/3600000);
 return{serverHours:serverLimit*hours,logBytes:logs?(logs[productId]??0)*MB:null,aiCredits:weights?weights.included_credits[productId]??0:null};
}

type Plan={subscription:Subscription|null;productId:string;serverLimit:number;period:Period;allowance:Allowance;billing:Settings['billing']|null;optedIn:boolean};
const plans=new Map<string,{at:number;plan:Plan}>();
// Plan context per organization, cached briefly because heartbeats and log batches check it on every request.
export async function planFor(orgId:string,fresh=false):Promise<Plan>{
 const cached=plans.get(orgId);if(!fresh&&cached&&Date.now()-cached.at<60000)return cached.plan;
 const [subscription,products,settings]=await Promise.all([store.activeSubscriptionForOrg(orgId),store.products(),store.settings(orgId)]);
 const product=products.find(p=>p.id===subscription?.productId)??products.find(p=>p.id==='dev')!,period=usagePeriod(subscription);
 const billing=settings.billing??null,optedIn=Boolean(billing?.overageEnabled&&usageExportEnabled()&&subscription?.stripeCustomerId&&product.id!=='dev');
 const plan={subscription,productId:product.id,serverLimit:product.serverLimit,period,allowance:allowanceFor(product.id,product.serverLimit,period),billing,optedIn};
 plans.set(orgId,{at:Date.now(),plan});return plan;
}
// Without opt-in usage stops at the allowance; with it, at the admin's hard cap.
const capped=(allowance:number,plan:Plan)=>plan.optedIn?Math.floor(allowance*(plan.billing!.capPercent/100)):allowance;
export async function serverLimitFor(orgId:string){const plan=await planFor(orgId);return capped(plan.serverLimit,plan)}
export async function logAllowed(orgId:string){if(!saas())return true;const plan=await planFor(orgId);if(plan.allowance.logBytes===null)return true;return (await store.usageTotals(orgId,plan.period.start)).logBytes<capped(plan.allowance.logBytes,plan)}
export async function aiAllowed(orgId:string){if(!saas())return true;const plan=await planFor(orgId);if(plan.allowance.aiCredits===null)return true;return aiCredits((await store.usageTotals(orgId,plan.period.start)).ai,creditWeights()).credits<capped(plan.allowance.aiCredits,plan)}

// One server-hour per server for each hour it sends a heartbeat; repeated heartbeats in the hour are claimed once.
const counted=new Set<string>();
export async function recordServerHour(orgId:string,serverId:string){
 if(!saas())return;
 const hour=hourOf(),claim=`SERVERHOUR#${hour}#${serverId}`;if(counted.has(orgId+claim))return;
 const plan=await planFor(orgId);await store.addUsage(orgId,plan.period.start,hour,{serverHours:1},plan.optedIn,claim);
 if(counted.size>100000)counted.clear();counted.add(orgId+claim);
}
export async function recordLogBytes(orgId:string,bytes:number){if(!saas()||!bytes)return;const plan=await planFor(orgId);await store.addUsage(orgId,plan.period.start,hourOf(),{logBytes:bytes},plan.optedIn)}
const count=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:undefined;
// Durable intent before inference: the call counts as unknown until Bedrock reports tokens. If accounting storage is unavailable, no AI call starts.
export async function measureGuardian<T>(orgId:string,modelId:string,work:()=>Promise<T>):Promise<T>{
 if(!saas())return work();
 const plan=await planFor(orgId),hour=hourOf();
 await store.addUsage(orgId,plan.period.start,hour,{ai:{model:modelId,calls:1,unknownCalls:1}},plan.optedIn);
 const response=await work(),usage=(response as {usage?:{inputTokens?:unknown;outputTokens?:unknown}}).usage,input=count(usage?.inputTokens),output=count(usage?.outputTokens);
 if(input!==undefined&&output!==undefined)await store.addUsage(orgId,plan.period.start,hour,{ai:{model:modelId,inputTokens:input,outputTokens:output,unknownCalls:-1}},plan.optedIn);
 return response;
}

// Billable value of each hour: only the part above the allowance, in time order, rounded up on the running total so
// partial MB and credits are never charged twice. Usage recorded without opt-in consumes the allowance but is never billed.
export function overageByHour(hours:UsageHour[],allowance:Allowance,weights:Weights|null){
 const step=(before:number,after:number,allow:number|null,unit:number)=>allow===null?0:Math.ceil(Math.max(0,after-allow)/unit)-Math.ceil(Math.max(0,before-allow)/unit);
 const totals={servers:0,bytes:0,credits:0},values=new Map<string,Record<Meter,number>>();
 for(const h of [...hours].sort((a,b)=>a.hour.localeCompare(b.hour))){
  const credits=weights?aiCredits(h.ai,weights).credits:0,next={servers:totals.servers+h.serverHours,bytes:totals.bytes+h.logBytes,credits:totals.credits+credits};
  const v={[SERVER_METER]:step(totals.servers,next.servers,allowance.serverHours,1),[LOG_METER]:step(totals.bytes,next.bytes,allowance.logBytes,MB),[AI_METER]:weights?step(totals.credits,next.credits,allowance.aiCredits,1):0};
  values.set(h.hour,h.billable?v:{[SERVER_METER]:0,[LOG_METER]:0,[AI_METER]:0});Object.assign(totals,next);
 }
 return values;
}
// Hours are exported once complete, with a few minutes for in-flight writes.
const exportableBefore=()=>hourOf(new Date(Date.now()-5*60000));
async function periodHours(orgId:string,plan:Plan){return (await store.usageHours(orgId,hourOf(new Date(plan.period.start)))).filter(h=>h.periodStart===plan.period.start)}

export async function usageSummary(orgId:string){
 const plan=await planFor(orgId,true),weights=creditWeights(),totals:UsageCounts=await store.usageTotals(orgId,plan.period.start),hours=await periodHours(orgId,plan),values=overageByHour(hours,plan.allowance,weights),ai=aiCredits(totals.ai,weights);
 const overage={server_hours:0,log_mb:0,ai_credits:0};let exported=0,pending=0,retrying=0;
 for(const h of hours){const v=values.get(h.hour)!;overage.server_hours+=v[SERVER_METER];overage.log_mb+=v[LOG_METER];overage.ai_credits+=v[AI_METER];const due=meters.some(m=>v[m]>0&&h.exported[m]===undefined);if(meters.some(m=>(h.exported[m]??0)>0))exported++;if(due){pending++;if(h.exportAttempts)retrying++}}
 const limit=(n:number|null)=>n===null?null:capped(n,plan),mb=(n:number|null)=>n===null?null:Math.round(n/MB*100)/100;
 const prices=overagePrices();
 return{plan:plan.productId,usage_period:plan.period,usage:{server_hours:totals.serverHours,log_mb:mb(totals.logBytes),ai_credits:weights?Math.round(ai.credits*100)/100:null,unpriced_ai_calls:ai.unpriced,ai_models:totals.ai},included:{servers:plan.serverLimit,server_hours:plan.allowance.serverHours,log_mb:mb(plan.allowance.logBytes),ai_credits:plan.allowance.aiCredits},limits:{servers:capped(plan.serverLimit,plan),server_hours:limit(plan.allowance.serverHours),log_mb:mb(limit(plan.allowance.logBytes)),ai_credits:limit(plan.allowance.aiCredits)},overage,billing:{export_enabled:usageExportEnabled(),overage_prices:{servers:!!prices[SERVER_METER],logs:!!prices[LOG_METER],ai:!!prices[AI_METER]},credit_weights_version:weights?.version??null,exported_hours:exported,pending_hours:pending,retrying_hours:retrying},settings:plan.billing};
}

// Admin overage settings. Opting in needs export enabled, a paid Stripe subscription and at least one overage price.
export const alertChoices=[50,80,90,100];
export function validateBilling(value:unknown,subscription:Subscription|null):NonNullable<Settings['billing']>{
 const v=value as Record<string,unknown>|null;
 if(!v||typeof v!=='object'||typeof v.overageEnabled!=='boolean'||!Number.isInteger(v.capPercent)||!Array.isArray(v.alertPercents)||v.alertPercents.length>4||v.alertPercents.some(p=>!alertChoices.includes(p as number)))throw Error('Invalid billing settings');
 const cap=v.capPercent as number;if(cap<100||cap>1000)throw Error('Cap must be between 100% and 1000% of the plan allowance');
 if(v.overageEnabled){
  if(!usageExportEnabled())throw Error('Usage-based billing is not enabled on this deployment');
  if(!subscription?.stripeCustomerId||!subscription.stripeSubscriptionId||subscription.productId==='dev')throw Error('Overage requires an active paid subscription');
  if(!Object.values(overagePrices()).some(Boolean))throw Error('Overage prices are not configured on this deployment');
 }
 return{overageEnabled:v.overageEnabled,capPercent:cap,alertPercents:[...new Set(v.alertPercents as number[])].sort((a,b)=>a-b),updatedAt:new Date().toISOString()};
}
export const forgetPlan=(orgId:string)=>{plans.delete(orgId)};
// Adds the per-unit overage prices to the customer's subscription once; Stripe then invoices exported meter usage each period.
export type SubscriptionItemClient={subscriptionItems:{list(params:{subscription:string;limit?:number}):AsyncIterable<{price:{id:string}}>;create(params:{subscription:string;price:string},options?:{idempotencyKey?:string}):Promise<unknown>}};
export async function attachOveragePrices(subscription:Subscription,client:SubscriptionItemClient){
 const wanted=Object.values(overagePrices()).filter((p):p is string=>!!p),present=new Set<string>();
 for await(const item of client.subscriptionItems.list({subscription:subscription.stripeSubscriptionId!,limit:20}))present.add(item.price.id);
 const added=[];for(const price of wanted)if(!present.has(price)){await client.subscriptionItems.create({subscription:subscription.stripeSubscriptionId!,price},{idempotencyKey:'guardscale_overage_'+subscription.stripeSubscriptionId+'_'+price});added.push(price)}
 return added;
}

// Minimal Stripe surface so export can be tested without network access.
export type MeterClient={billing:{meterEvents:{create(params:{event_name:string;payload:Record<string,string>;identifier:string;timestamp:number}):Promise<unknown>};meters:{list(params?:{limit?:number}):AsyncIterable<{id:string;event_name:string}>;listEventSummaries(id:string,params:{customer:string;start_time:number;end_time:number}):AsyncIterable<{aggregated_value:number}>}}};
const duplicate=(e:unknown)=>{const v=e as {code?:string;message?:string};return v?.code==='resource_already_exists'||/identifier.*(already|duplicate)|duplicate.*identifier/i.test(v?.message??'')};
// Idempotent outbox: one meter event per completed hour and meter, identified by organization, hour and meter, so retries never double count.
// Runs for every paid subscription, including after opt-out, so overage already consumed is still billed. Meters without a price are not sent.
export async function exportUsage(orgId:string,client:MeterClient){
 if(!usageExportEnabled())return{status:'disabled' as const};
 const plan=await planFor(orgId,true);if(!plan.subscription?.stripeCustomerId||plan.productId==='dev')return{status:'no_customer' as const};
 const weights=creditWeights(),hours=await periodHours(orgId,plan),values=overageByHour(hours,plan.allowance,weights),prices=overagePrices(),before=exportableBefore();
 let sent=0,failed=0;
 for(const h of hours.filter(h=>h.hour<before)){
  const v=values.get(h.hour)!,done:Record<string,number>={};let error='';
  for(const meter of meters){
   if(h.exported[meter]!==undefined||!prices[meter]||(meter===AI_METER&&!weights)||(meter===LOG_METER&&plan.allowance.logBytes===null))continue;
   if(v[meter]===0){done[meter]=0;continue}
   try{await client.billing.meterEvents.create({event_name:meter,payload:{stripe_customer_id:plan.subscription.stripeCustomerId,value:String(v[meter])},identifier:`${orgId}_${h.hour}_${meter}`,timestamp:Math.floor(Date.parse(h.hour+':00:00Z')/1000)});done[meter]=v[meter];sent++}
   catch(e){if(duplicate(e)){done[meter]=v[meter];continue}failed++;error=(e instanceof Error?e.message:'Stripe export failed').slice(0,300)}
  }
  if(Object.keys(done).length||error)await store.markUsageHour(orgId,h.hour,h.periodStart,{exported:done,...(error?{exportAttempts:(h.exportAttempts??0)+1,lastExportError:error}:{})});
 }
 return{status:'ok' as const,sent,failed};
}
// Compares exported values with Stripe meter summaries for the current period. Stripe aggregates with a short delay.
export async function reconcileUsage(orgId:string,client:MeterClient){
 const plan=await planFor(orgId,true);if(!plan.subscription?.stripeCustomerId)return[];
 const hours=await periodHours(orgId,plan),ids=new Map<string,string>();
 for await(const m of client.billing.meters.list({limit:100}))ids.set(m.event_name,m.id);
 const minute=(ms:number)=>Math.floor(ms/60000)*60,start=minute(Date.parse(hourOf(new Date(plan.period.start))+':00:00Z')),end=minute(Date.now())+60,result=[];
 for(const meter of meters){
  const ledger=hours.reduce((n,h)=>n+(h.exported[meter]??0),0),id=ids.get(meter);let stripeTotal:number|null=null;
  if(id){stripeTotal=0;for await(const s of client.billing.meters.listEventSummaries(id,{customer:plan.subscription.stripeCustomerId,start_time:start,end_time:end}))stripeTotal+=s.aggregated_value}
  result.push({meter,ledger,stripe:stripeTotal,difference:stripeTotal===null?null:stripeTotal-ledger});
 }
 return result;
}
// Email once per unit and threshold per period, against the plan allowance and, when opted in, the cap.
export async function usageAlerts(orgId:string,send:Notifier=notifier()){
 if(!saas())return 0;
 const settings=await store.settings(orgId),recipients=settings.notifications.recipients.split(/[\s,;]+/).filter(Boolean);
 if(!settings.notifications.emailEnabled||!recipients.length)return 0;
 const plan=await planFor(orgId,true),totals=await store.usageTotals(orgId,plan.period.start),percents=settings.billing?.alertPercents??[80,100];let sent=0;
 const units:[string,number,number|null,(n:number)=>string][]=[['server-hours',totals.serverHours,plan.allowance.serverHours,n=>n.toLocaleString('en-US')],['log MB',totals.logBytes,plan.allowance.logBytes,n=>(n/MB).toLocaleString('en-US',{maximumFractionDigits:1})],['AI credits',aiCredits(totals.ai,creditWeights()).credits,plan.allowance.aiCredits,n=>Math.round(n).toLocaleString('en-US')]];
 for(const [unit,used,allowance,format] of units){
  if(allowance===null||allowance===0)continue;
  const limits:[string,number][]=[['plan allowance',allowance],...(plan.optedIn?[['spending cap',capped(allowance,plan)] as [string,number]]:[])];
  for(const [name,limit] of limits)for(const pct of percents){
   if(used<limit*pct/100||!await store.claimOnce(orgId,`ALERT#${plan.period.start}#${unit}#${name}#${pct}`,400))continue;
   for(const destination of recipients)await send.send({channel:'email',destination,subject:`GuardScale usage at ${pct}% of your ${name} for ${unit}`,text:`${format(used)} of ${format(limit)} ${unit} used this ${plan.period.source==='stripe_subscription'?'billing period':'month'}.`+(name==='plan allowance'&&!plan.optedIn?' Usage stops at the allowance unless an admin enables usage beyond the plan.':'')});
   sent++;
  }
 }
 return sent;
}
