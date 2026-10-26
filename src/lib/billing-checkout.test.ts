import {test} from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import {checkoutForWorkspace} from './billing-checkout';
import {stripe} from './stripe';
import {localEmulation} from './local-emulation';
import {localAuthLinks} from './signup-policy';

test('production-built localhost auth needs the complete isolated emulator boundary',()=>{
 const keys=['NODE_ENV','GUARDSCALE_DEPLOYMENT_MODE','GUARDSCALE_LOCAL_REPLAY','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','GUARDSCALE_TABLE','GUARDSCALE_DYNAMODB_ENDPOINT'];const old=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 try{Object.assign(process.env,{NODE_ENV:'production',GUARDSCALE_DEPLOYMENT_MODE:'saas',GUARDSCALE_LOCAL_REPLAY:'true'});assert.equal(localEmulation(),false);assert.equal(localAuthLinks(),false);
 Object.assign(process.env,{AWS_ACCESS_KEY_ID:'local',AWS_SECRET_ACCESS_KEY:'local',GUARDSCALE_TABLE:'guardscale-local',GUARDSCALE_DYNAMODB_ENDPOINT:'http://dynamodb:8000'});assert.equal(localEmulation(),true);assert.equal(localAuthLinks(),true);
 process.env.GUARDSCALE_DYNAMODB_ENDPOINT='https://dynamodb.us-east-1.amazonaws.com';assert.equal(localEmulation(),false);assert.equal(localAuthLinks(),false);
 }finally{for(const key of keys)if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];}
});

test('completed checkout permits repurchase only after Stripe confirms workspace cancellation',async()=>{
 let status='active',orgId='repurchase';let created=0;
 const client={checkout:{sessions:{create:async()=>({id:'cs_'+(++created),status:'complete',subscription:'sub_previous'}),retrieve:async()=>({id:'cs_1',status:'complete',subscription:'sub_previous'})}},subscriptions:{retrieve:async()=>({id:'sub_previous',status,metadata:{orgId}})}} as unknown as Stripe;
 const params:Stripe.Checkout.SessionCreateParams={mode:'subscription',success_url:'https://localhost/success'};
 await checkoutForWorkspace('repurchase',params,client);
 await assert.rejects(checkoutForWorkspace('repurchase',params,client),/completed/);
 status='canceled';orgId='another-workspace';
 await assert.rejects(checkoutForWorkspace('repurchase',params,client),/completed/);
 orgId='repurchase';await checkoutForWorkspace('repurchase',params,client);
 assert.equal(created,2);
});

test('local sandbox and production live keys cannot be swapped',()=>{
 const oldKey=process.env.STRIPE_SECRET_KEY,oldMode=process.env.GUARDSCALE_STRIPE_MODE;
 try{process.env.GUARDSCALE_STRIPE_MODE='sandbox';process.env.STRIPE_SECRET_KEY='sk_live_synthetic';assert.throws(stripe,/environment/);
 process.env.GUARDSCALE_STRIPE_MODE='live';process.env.STRIPE_SECRET_KEY='sk_test_synthetic';assert.throws(stripe,/environment/);
 }finally{if(oldKey===undefined)delete process.env.STRIPE_SECRET_KEY;else process.env.STRIPE_SECRET_KEY=oldKey;if(oldMode===undefined)delete process.env.GUARDSCALE_STRIPE_MODE;else process.env.GUARDSCALE_STRIPE_MODE=oldMode;}
});

test('checkout retries recover the same attempt, expire superseded sessions and block duplicate completed purchases',async()=>{
 const sessions=new Map<string,{id:string;status:string;url:string}>(),attempts=new Map<string,string>();let calls=0,loseResponse=true;
 const client={checkout:{sessions:{create:async(_params:unknown,options:{idempotencyKey:string})=>{
  calls++;let id=attempts.get(options.idempotencyKey);if(!id){id='cs_test_'+attempts.size;attempts.set(options.idempotencyKey,id);sessions.set(id,{id,status:'open',url:'https://checkout.example/'+id});}
  if(loseResponse){loseResponse=false;throw Error('lost response');}return sessions.get(id);
 },retrieve:async(id:string)=>sessions.get(id),expire:async(id:string)=>{sessions.get(id)!.status='expired';return sessions.get(id);}}}} as unknown as Stripe;
 const params:Stripe.Checkout.SessionCreateParams={mode:'subscription',line_items:[{price:'price_test',quantity:25}],success_url:'https://localhost/success'};
 await assert.rejects(checkoutForWorkspace('retry-checkout',params,client),/lost response/);
 const first=await checkoutForWorkspace('retry-checkout',params,client);
 assert.equal(attempts.size,1);assert.equal(calls,2);
 assert.equal((await checkoutForWorkspace('retry-checkout',params,client)).id,first.id);assert.equal(calls,2);
 const changed=await checkoutForWorkspace('retry-checkout',{...params,line_items:[{price:'price_test',quantity:26}]},client);
 assert.equal(sessions.get(first.id)!.status,'expired');assert.notEqual(changed.id,first.id);
 sessions.get(changed.id)!.status='complete';
 await assert.rejects(checkoutForWorkspace('retry-checkout',params,client),/completed/);assert.equal(attempts.size,2);
});
