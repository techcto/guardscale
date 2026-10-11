import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hasPaidEntitlement} from './subscription-entitlement';
import type {Subscription} from './model';
const local:Subscription={id:'old-local-record',orgId:'test-org',productId:'scale',status:'active',updatedAt:'2026-01-01'};
test('old local subscriptions do not grant paid access',()=>assert.equal(hasPaidEntitlement(local),false));
test('active Stripe subscription grants access',()=>assert.equal(hasPaidEntitlement({...local,stripeSubscriptionId:'sub_example',stripeCustomerId:'cus_example'}),true));
test('canceled and unpaid subscriptions do not grant access',()=>{for(const status of ['canceled','unpaid','past_due'] as const)assert.equal(hasPaidEntitlement({...local,stripeSubscriptionId:'sub_example',stripeCustomerId:'cus_example',status}),false)});
