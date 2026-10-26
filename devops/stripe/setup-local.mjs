import {readFileSync,writeFileSync,chmodSync} from 'node:fs';
import {parseEnv} from 'node:util';
import Stripe from 'stripe';
import {setup} from './setup-plans.mjs';
import pricing from '../../src/lib/billing-pricing.json' with {type:'json'};

if(process.argv.slice(2).some(a=>a!=='--apply'))throw Error('Usage: node devops/stripe/setup-local.mjs [--apply]');
const file=new URL('../../.env',import.meta.url);
let source;try{source=readFileSync(file,'utf8');}catch{throw Error('Save GuardScale sandbox credentials in the ignored .env first.');}
const env=parseEnv(source);
if(!/^(sk|rk)_test_[A-Za-z0-9]+$/.test(env.STRIPE_SECRET_KEY??''))throw Error('A local Stripe test key is required; live keys are refused.');
if(!process.argv.includes('--apply'))console.log('Local sandbox preview. Use --apply to create/reuse GuardScale test plans and write their IDs to the ignored .env.');
else{
 try{
  const client=new Stripe(env.STRIPE_SECRET_KEY,{timeout:20000,maxNetworkRetries:1});
  const result=await setup(client,{data:readFileSync(new URL('../../public/guardscale-logo-marketplace-640.png',import.meta.url)),name:'guardscale-logo.png'},{GUARDSCALE_SERVER_HOUR_CENTS:pricing.serverHourCents,GUARDSCALE_LOG_MB_CENTS:pricing.logMiBCents,GUARDSCALE_AI_CREDIT_CENTS:pricing.aiCreditCents});
  const updates={GUARDSCALE_STRIPE_MODE:'sandbox',...Object.fromEntries(Object.entries(result).filter(([key])=>key.startsWith('STRIPE_')))};
  // Only local mode and price IDs are changed; existing passwords, keys and webhook secret are preserved.
  for(const [name,value] of Object.entries(updates)){
   const line=name+'='+value,pattern=new RegExp('^'+name+'=.*$','m');
   source=pattern.test(source)?source.replace(pattern,line):source.replace(/\s*$/,'')+'\n'+line+'\n';
  }
  writeFileSync(file,source,{mode:0o600});chmodSync(file,0o600);
  console.log(JSON.stringify({mode:'sandbox',price_ids_written:Object.keys(updates).filter(k=>k.startsWith('STRIPE_')),webhook_configured:!!env.STRIPE_WEBHOOK_SECRET},null,2));
 }catch(error){console.error('Sandbox setup failed ('+(error?.code??'request_failed')+'). No credential values were printed.');process.exitCode=1;}
}
