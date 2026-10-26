import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import Stripe from 'stripe';
import {NextRequest} from 'next/server';

async function main(){
 const key=process.env.STRIPE_SECRET_KEY;
 if(!key||!/^(sk|rk)_test_/.test(key)||process.env.GUARDSCALE_TABLE||process.env.NODE_ENV==='production')throw Error('Requires an isolated process and sandbox key, never a production database or key');
 const client=new Stripe(key,{timeout:20000,maxNetworkRetries:1});
 const {setup}=await import('./setup-plans.mjs');
 // The existing setup-plans coupon flow creates the sandbox-only 100% forever promotion code.
 const prices=await setup(client,undefined,{GUARDSCALE_COUPON_CODE:'SANDBOX100',GUARDSCALE_COUPON_PERCENT_OFF:'100',GUARDSCALE_COUPON_DURATION:'forever'});
 Object.assign(process.env,{GUARDSCALE_DEPLOYMENT_MODE:'saas',GUARDSCALE_STRIPE_MODE:'sandbox',GUARDSCALE_PUBLIC_URL:'https://localhost',GUARDSCALE_SESSION_SECRET:randomUUID()+randomUUID(),STRIPE_WEBHOOK_SECRET:'whsec_'+randomUUID().replaceAll('-',''),STRIPE_STARTER_PRICE_ID:prices.STRIPE_STARTER_PRICE_ID,STRIPE_SCALE_PRICE_ID:prices.STRIPE_SCALE_PRICE_ID});
 const {store}=await import('../../src/lib/store');
 const {createSession}=await import('../../src/lib/session');
 const {POST}=await import('../../src/app/api/billing/checkout/route');
 let clock:string|undefined,checkoutId:string|undefined;
 try{
  const org=await store.createOrganization({name:'Isolated sandbox coupon verification',ownerId:'root',orgType:'personal'});
  const cookie=await createSession({id:'root',username:'root',role:'root',orgId:org.id,expiresAt:Date.now()+60000},process.env.GUARDSCALE_SESSION_SECRET!);
  const request=()=>new NextRequest('https://localhost/api/billing/checkout',{method:'POST',headers:{host:'localhost',origin:'https://localhost',cookie:'guardscale_session='+cookie,'content-type':'application/json'},body:JSON.stringify({productId:'starter'})});
  const response=await POST(request());assert.equal(response.status,200);
  const body=await response.json();assert.ok(body.url);
  const sessions=await client.checkout.sessions.list({limit:10});
  const session=sessions.data.find(s=>s.metadata?.orgId===org.id);assert.ok(session);checkoutId=session.id;
  assert.equal(session.allow_promotion_codes,true);
  const retry=await POST(request());assert.equal((await retry.json()).url,body.url);
  console.log('SANDBOX PASS: actual checkout enables coupon entry and reuses retries.');
  clock=(await client.testHelpers.testClocks.create({frozen_time:Math.floor(Date.now()/1000),name:'GuardScale sandbox coupon verification'})).id;
  const customer=await client.customers.create({test_clock:clock,name:'Sandbox coupon verification'});
  const subscription=await client.subscriptions.create({customer:customer.id,items:[{price:prices.STRIPE_STARTER_PRICE_ID}],discounts:[{promotion_code:prices.coupon.promotion_code}],expand:['latest_invoice']});
  assert.equal((subscription.latest_invoice as Stripe.Invoice).amount_due,0);assert.equal(subscription.status,'active');
  console.log('SANDBOX PASS: discounted subscription activates at $0 without a card.');
  await client.testHelpers.testClocks.advance(clock,{frozen_time:subscription.items.data[0].current_period_end+7200});
  let ready=false;for(let i=0;i<60;i++){if((await client.testHelpers.testClocks.retrieve(clock)).status==='ready'){ready=true;break;}await new Promise(r=>setTimeout(r,1000));}assert.ok(ready);
  const invoices=await client.invoices.list({customer:customer.id,subscription:subscription.id,limit:10});
  const renewal=invoices.data.find(i=>i.billing_reason==='subscription_cycle');assert.ok(renewal);assert.equal(renewal.amount_due,0);assert.equal(renewal.status,'paid');
  console.log('SANDBOX PASS: next-month renewal remains $0 and paid.');
 }finally{
  try{if(checkoutId)await client.checkout.sessions.expire(checkoutId);}finally{if(clock)await client.testHelpers.testClocks.del(clock);}
  console.log('Sandbox sessions and test-clock resources cleaned up; reusable test catalog retained.');
 }
}
main().catch(error=>{console.error(JSON.stringify({error:error instanceof Error?error.message:'Sandbox verification failed'}));process.exitCode=1;});
