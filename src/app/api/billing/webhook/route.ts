import {NextRequest,NextResponse} from 'next/server';
import type Stripe from 'stripe';
import {stripe} from '@/lib/stripe';
import {store} from '@/lib/store';
import {forgetPlan} from '@/lib/usage';
export async function POST(req:NextRequest){
 const signature=req.headers.get('stripe-signature'),secret=process.env.STRIPE_WEBHOOK_SECRET;
 if(!signature||!secret||!process.env.STRIPE_SECRET_KEY)return NextResponse.json({error:'Webhook not configured'},{status:503});
 let event:Stripe.Event;
 try{event=stripe().webhooks.constructEvent(await req.text(),signature,secret)}catch{return NextResponse.json({error:'Invalid signature'},{status:400})}
 if(event.type==='checkout.session.completed'){
  const session=event.data.object;
  if(typeof session.subscription==='string')await save(await stripe().subscriptions.retrieve(session.subscription),session.metadata??{});
 }
 if(event.type==='customer.subscription.created'||event.type==='customer.subscription.updated'||event.type==='customer.subscription.deleted'){
  // Retrieve current state, rather than trusting an out-of-order event snapshot.
  await save(await stripe().subscriptions.retrieve(event.data.object.id));
 }
 return NextResponse.json({received:true});
}
async function save(v:Stripe.Subscription,fallback:Record<string,string>={}){
 const orgId=v.metadata.orgId??fallback.orgId,productId=v.metadata.productId??fallback.productId;
 if(!orgId||!productId||!await store.organizationById(orgId))return;
 const product=(await store.products()).find(p=>p.id===productId&&p.active&&p.monthlyPrice>0);
 const item=v.items.data.find(item=>item.price.id===product?.stripePriceId);
 if(!product||!product.stripePriceId||!item)return;
 const status=['active','trialing','past_due','canceled','unpaid'].includes(v.status)?v.status as 'active'|'trialing'|'past_due'|'canceled'|'unpaid':'unpaid';
 // The plan item's billing period is the usage period for included amounts and overage.
 const iso=(seconds:number)=>new Date(seconds*1000).toISOString();
 await store.putSubscription({id:v.id,orgId,productId,stripeCustomerId:typeof v.customer==='string'?v.customer:v.customer.id,stripeSubscriptionId:v.id,status,currentPeriodStart:iso(item.current_period_start),currentPeriodEnd:iso(item.current_period_end),updatedAt:new Date().toISOString()});
 forgetPlan(orgId);
}
