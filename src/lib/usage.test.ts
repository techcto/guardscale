import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {memoryStore as store} from './memory-store';
import type {Subscription,UsageHour} from './model';
import {AI_METER,LOG_METER,MB,SERVER_METER,allowanceFor,aiAllowed,aiCredits,exportUsage,forgetPlan,hourOf,logAllowed,logEntryBytes,measureGuardian,overageByHour,recordLogBytes,recordServerHour,serverLimitFor,usagePeriod,validateBilling,type MeterClient} from './usage';

const saas=()=>{process.env.GUARDSCALE_DEPLOYMENT_MODE='saas'};
const hour=(h:string,v:Partial<UsageHour>={}):UsageHour=>({hour:h,periodStart:'p',billable:true,exported:{},serverHours:0,logBytes:0,ai:{},...v});
const paid=(orgId:string):Subscription=>({id:'sub_'+orgId,orgId,productId:'starter',stripeCustomerId:'cus_'+orgId,stripeSubscriptionId:'sub_'+orgId,status:'active',currentPeriodStart:'2026-10-01T00:00:00.000Z',currentPeriodEnd:'2026-10-31T00:00:00.000Z',updatedAt:new Date().toISOString()});

test('approved plan credits and model-cost weights preserve fractional usage',async()=>{
 const products=await store.products();
 assert.deepEqual(products.map(p=>[p.id,p.aiCreditsIncluded]),[['dev',0],['starter',1000],['scale',5000]]);
 // Synthetic rates demonstrate conversion, not a price claim about an actual model.
 const weights={version:'cost-v1',included_credits:{},models:{example:{input_per_1k:0.3,output_per_1k:1.2}}};
 const measured=aiCredits({example:{calls:1,inputTokens:1000,outputTokens:500,unknownCalls:0}},weights);
 assert.ok(Math.abs(measured.credits-0.9)<1e-10);assert.equal(measured.unpriced,0);
 const unknown=aiCredits({other:{calls:2,inputTokens:100000,outputTokens:100000,unknownCalls:0}},weights);
 assert.deepEqual(unknown,{credits:0,unpriced:2});
});

test('allowances come from the plan: server-hours for every hour of the period, included log MB, and AI only with credit weights',()=>{
 delete process.env.GUARDSCALE_LOG_MB_INCLUDED_JSON;delete process.env.GUARDSCALE_AI_CREDIT_WEIGHTS_JSON;
 const period=usagePeriod(paid('a'));
 assert.equal(period.source,'stripe_subscription');
 const starter={id:'starter',serverLimit:5,logMbIncluded:10000,aiCreditsIncluded:null};
 // Measured units come from the plan: included servers per hour and log MB; AI is unmetered without credit weights.
 assert.deepEqual(allowanceFor(starter,period),{serverHours:5*720,logBytes:10000*MB,aiCredits:null});
 assert.deepEqual(allowanceFor({...starter,logMbIncluded:null},period),{serverHours:3600,logBytes:null,aiCredits:null},'a plan without a log allowance leaves logs unmetered');
 assert.deepEqual(allowanceFor({...starter,aiCreditsIncluded:40},period,{version:'v1',included_credits:{},models:{}}),{serverHours:3600,logBytes:10000*MB,aiCredits:40},'plan AI credits apply once weights exist');
 const month=usagePeriod(null,new Date('2026-02-10T00:00:00Z'));
 assert.deepEqual([month.start,month.end],['2026-02-01T00:00:00.000Z','2026-03-01T00:00:00.000Z']);
 // Deployment settings still override the plan values per plan.
 assert.deepEqual(allowanceFor(starter,period,{version:'v1',included_credits:{starter:100},models:{}},{starter:500}),{serverHours:3600,logBytes:500*MB,aiCredits:100});
});

test('overage is only the part above the allowance, rounded up on the running total, and never billed for hours without opt-in',()=>{
 const allowance={serverHours:10,logBytes:2*MB,aiCredits:null};
 const values=overageByHour([hour('2026-10-01T00',{serverHours:8,logBytes:MB}),hour('2026-10-01T01',{serverHours:3,logBytes:MB+1}),hour('2026-10-01T02',{serverHours:3,logBytes:MB/2,billable:false}),hour('2026-10-01T03',{serverHours:2,logBytes:MB/4})],allowance,null);
 assert.deepEqual(values.get('2026-10-01T00'),{[SERVER_METER]:0,[LOG_METER]:0,[AI_METER]:0});
 assert.deepEqual(values.get('2026-10-01T01'),{[SERVER_METER]:1,[LOG_METER]:1,[AI_METER]:0},'1 byte over still bills 1 MB');
 assert.deepEqual(values.get('2026-10-01T02'),{[SERVER_METER]:0,[LOG_METER]:0,[AI_METER]:0},'usage without opt-in is not billed');
 assert.deepEqual(values.get('2026-10-01T03'),{[SERVER_METER]:2,[LOG_METER]:0,[AI_METER]:0},'the partial MB already billed is not billed again');
 const ai=overageByHour([hour('h1',{ai:{m:{calls:1,inputTokens:1000,outputTokens:1000,unknownCalls:0}}}),hour('h2',{ai:{m:{calls:2,inputTokens:500,outputTokens:0,unknownCalls:1}}})],{serverHours:0,logBytes:null,aiCredits:3},{version:'v1',included_credits:{},models:{m:{input_per_1k:1,output_per_1k:4}}});
 assert.deepEqual([ai.get('h1')![AI_METER],ai.get('h2')![AI_METER]],[2,1],'5 credits then 0.5 credits above 3 included');
});

test('server-hours count each server once per hour; log bytes follow CloudWatch sizing and duplicate entries are not counted',async()=>{
 saas();const org=randomUUID();forgetPlan(org);
 await recordServerHour(org,'one');await recordServerHour(org,'one');await recordServerHour(org,'two');
 assert.equal(logEntryBytes('héllo'),6+26);
 const event={id:'e1',tenantId:org,serverId:'one',agentId:'a',type:'log.apache_access',at:new Date().toISOString(),metadata:{message:'GET /'}};
 assert.equal(await store.putEvent(event),true);assert.equal(await store.putEvent(event),false);
 await recordLogBytes(org,logEntryBytes('GET /'));
 const totals=await store.usageTotals(org,usagePeriod(null).start);
 assert.equal(totals.serverHours,2);assert.equal(totals.logBytes,31);
 const hours=await store.usageHours(org,hourOf(new Date(Date.now()-3600000)));
 assert.equal(hours.length,1);assert.equal(hours[0].billable,false,'Dev usage is never billable');
});

test('Guardian calls are recorded as unknown before inference and complete with reported tokens',async()=>{
 saas();const org=randomUUID();forgetPlan(org);
 await measureGuardian(org,'nova',async()=>({usage:{inputTokens:120,outputTokens:30}}));
 await assert.rejects(measureGuardian(org,'nova',async()=>{throw Error('Bedrock unavailable')}));
 await measureGuardian(org,'nova',async()=>({}));
 assert.deepEqual((await store.usageTotals(org,usagePeriod(null).start)).ai,{nova:{calls:3,inputTokens:120,outputTokens:30,unknownCalls:2}});
});

test('Dev stops at its allowance; an opted-in paid plan continues to its cap',async()=>{
 saas();process.env.GUARDSCALE_USAGE_EXPORT='enabled';process.env.STRIPE_SERVER_OVERAGE_PRICE_ID='price_server';
 process.env.GUARDSCALE_LOG_MB_INCLUDED_JSON=JSON.stringify({dev:1,starter:2});process.env.GUARDSCALE_AI_CREDIT_WEIGHTS_JSON=JSON.stringify({version:'v1',included_credits:{dev:0,starter:1},models:{nova:{input_per_1k:1,output_per_1k:1}}});
 const dev=randomUUID();forgetPlan(dev);
 assert.equal(await serverLimitFor(dev),3);assert.equal(await logAllowed(dev),true);assert.equal(await aiAllowed(dev),false,'Dev includes no AI credits');
 await recordLogBytes(dev,MB);forgetPlan(dev);assert.equal(await logAllowed(dev),false);
 const org=randomUUID(),subscription=paid(org);await store.putSubscription(subscription);
 const settings=await store.settings(org);await store.putSettings(org,{...settings,billing:validateBilling({overageEnabled:true,capPercent:200,alertPercents:[80]},subscription)});forgetPlan(org);
 assert.equal(await serverLimitFor(org),20,'10 servers at a 200% cap');
 await recordLogBytes(org,3*MB);forgetPlan(org);assert.equal(await logAllowed(org),true,'3 MB is under the 4 MB cap');
 await recordLogBytes(org,MB);forgetPlan(org);assert.equal(await logAllowed(org),false);
 for(const k of ['GUARDSCALE_USAGE_EXPORT','STRIPE_SERVER_OVERAGE_PRICE_ID','GUARDSCALE_LOG_MB_INCLUDED_JSON','GUARDSCALE_AI_CREDIT_WEIGHTS_JSON'])delete process.env[k];
});

test('overage settings require export, a paid subscription and a price, and a cap between 100% and 1000%',()=>{
 saas();delete process.env.GUARDSCALE_USAGE_EXPORT;
 const settings={overageEnabled:true,capPercent:200,alertPercents:[80,100]};
 assert.throws(()=>validateBilling(settings,paid('a')),/not enabled/);
 process.env.GUARDSCALE_USAGE_EXPORT='enabled';
 assert.throws(()=>validateBilling(settings,null),/paid subscription/);
 assert.throws(()=>validateBilling(settings,paid('a')),/prices are not configured/);
 process.env.STRIPE_LOG_OVERAGE_PRICE_ID='price_log';
 assert.equal(validateBilling(settings,paid('a')).capPercent,200);
 assert.throws(()=>validateBilling({...settings,capPercent:50},paid('a')),/Cap/);
 assert.equal(validateBilling({...settings,overageEnabled:false},null).overageEnabled,false,'opting out never needs Stripe');
 delete process.env.GUARDSCALE_USAGE_EXPORT;delete process.env.STRIPE_LOG_OVERAGE_PRICE_ID;
});

test('export sends one meter event per completed hour and meter, retries failures and never double counts',async()=>{
 saas();process.env.GUARDSCALE_USAGE_EXPORT='enabled';process.env.STRIPE_SERVER_OVERAGE_PRICE_ID='price_server';
 const org=randomUUID(),subscription={...paid(org),currentPeriodStart:new Date(Date.now()-3*86400000).toISOString(),currentPeriodEnd:new Date(Date.now()+27*86400000).toISOString()};
 await store.putSubscription({...subscription,productId:'dev'});forgetPlan(org);
 assert.equal((await exportUsage(org,{} as MeterClient)).status,'no_customer');
 await store.putSubscription(subscription);forgetPlan(org);
 const start=subscription.currentPeriodStart,earlier=hourOf(new Date(Date.now()-2*3600000)),now=hourOf(),included=10*720;
 await store.addUsage(org,start,earlier,{serverHours:included+3},true);await store.addUsage(org,start,now,{serverHours:2},true);
 const sent:{event_name:string;identifier:string;payload:Record<string,string>}[]=[];let fail=true;
 const client={billing:{meterEvents:{create:async(e:{event_name:string;identifier:string;payload:Record<string,string>})=>{if(fail){fail=false;throw Error('Stripe unavailable')}sent.push(e)}},meters:{list:async function*(){},listEventSummaries:async function*(){}}}} as unknown as MeterClient;
 assert.deepEqual(await exportUsage(org,client),{status:'ok',sent:0,failed:1});
 assert.equal((await store.usageHours(org,earlier)).find(h=>h.hour===earlier)!.exportAttempts,1);
 assert.deepEqual(await exportUsage(org,client),{status:'ok',sent:1,failed:0});
 assert.deepEqual(await exportUsage(org,client),{status:'ok',sent:0,failed:0},'exported hours are never sent again');
 assert.equal(sent.length,1,'the current hour is not exported until complete');
 assert.deepEqual([sent[0].event_name,sent[0].identifier,sent[0].payload],[SERVER_METER,`${org}_${earlier}_${SERVER_METER}`,{stripe_customer_id:subscription.stripeCustomerId,value:'3'}]);
 delete process.env.GUARDSCALE_USAGE_EXPORT;delete process.env.STRIPE_SERVER_OVERAGE_PRICE_ID;
});

test('private installs never meter or cap usage, whatever the plan includes',async()=>{
 const mode=process.env.GUARDSCALE_DEPLOYMENT_MODE;process.env.GUARDSCALE_DEPLOYMENT_MODE='on-premise';
 try{
  const org=randomUUID();forgetPlan(org);
  // Usage far beyond any plan's included log MB (the Dev plan includes 1,000 MB).
  await store.addUsage(org,usagePeriod(null).start,hourOf(),{logBytes:5000*MB},false);
  assert.equal(await logAllowed(org),true,'logs are never capped in private mode');
  assert.equal(await aiAllowed(org),true,'Guardian AI is never capped in private mode');
  await recordLogBytes(org,1234);await recordServerHour(org,'srv-private');
  assert.deepEqual(await store.usageTotals(org,usagePeriod(null).start),{serverHours:0,logBytes:5000*MB,ai:{}},'nothing new is metered in private mode');
  assert.deepEqual(await exportUsage(org,{} as MeterClient),{status:'disabled'},'nothing is ever exported in private mode');
 }finally{if(mode===undefined)delete process.env.GUARDSCALE_DEPLOYMENT_MODE;else process.env.GUARDSCALE_DEPLOYMENT_MODE=mode}
});
