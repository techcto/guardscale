import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server';
import {POST as checkout} from '../app/api/billing/checkout/route';
import {POST as portal} from '../app/api/billing/portal/route';
import {createSession} from './session';
import {store} from './store';
import {withBillingLock} from './billing-lock';

test('billing rejects cross-origin, malformed, private-mode and duplicate subscription requests before Stripe',async()=>{
 Object.assign(process.env,{GUARDSCALE_DEPLOYMENT_MODE:'saas',GUARDSCALE_PUBLIC_URL:'https://guardscale.example',GUARDSCALE_SESSION_SECRET:'local-route-test-secret',STRIPE_STARTER_PRICE_ID:'price_synthetic',STRIPE_SECRET_KEY:'sk_test_synthetic',STRIPE_WEBHOOK_SECRET:'whsec_synthetic'});
 const org=await store.createOrganization({name:'Billing regression',ownerId:'root',orgType:'personal'});
 const token=await createSession({id:'root',username:'root',role:'root',orgId:org.id,expiresAt:Date.now()+60000},process.env.GUARDSCALE_SESSION_SECRET!);
 const req=(body:string,origin='https://guardscale.example')=>new NextRequest('https://guardscale.example/api/billing/checkout',{method:'POST',headers:{host:'guardscale.example',origin,cookie:'guardscale_session='+token,'content-type':'application/json'},body});
 for(const handler of [checkout,portal])assert.equal((await handler(req('{}','https://evil.example'))).status,403);
 for(const body of ['null','{','{}','{"productId":42}',JSON.stringify({productId:'x'.repeat(3000)})])assert.equal((await checkout(req(body))).status,400);
 await store.putSubscription({id:'existing',orgId:org.id,productId:'starter',stripeSubscriptionId:'sub_existing',status:'past_due',updatedAt:new Date().toISOString()});
 assert.equal((await checkout(req('{"productId":"starter"}'))).status,409);
 process.env.GUARDSCALE_DEPLOYMENT_MODE='on-premise';
 assert.equal((await checkout(req('{"productId":"starter"}'))).status,409);
});

test('workspace billing lock serializes work and releases after failure',async()=>{
 await withBillingLock('locking',async()=>{assert.equal(await withBillingLock('locking',async()=>true),null);});
 await assert.rejects(withBillingLock('locking',async()=>{throw Error('failed');}),/failed/);
 assert.equal(await withBillingLock('locking',async()=>true),true);
});
