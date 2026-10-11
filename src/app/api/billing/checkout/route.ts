import {NextRequest,NextResponse} from 'next/server';
import {operator} from '@/lib/operator';
import {store} from '@/lib/store';
import {stripe} from '@/lib/stripe';
import {requestOrigin} from '@/lib/session';
export async function POST(req:NextRequest){
 const session=await operator(req);
 if(!session||!['root','admin'].includes(session.role))return NextResponse.json({error:'forbidden'},{status:403});
 if(process.env.GUARDSCALE_DEPLOYMENT_MODE!=='saas')return NextResponse.json({error:'Billing is disabled for private installations'},{status:409});
 const {productId}=await req.json() as {productId?:string};
 const product=(await store.products()).find(p=>p.id===productId&&p.active&&p.monthlyPrice>0);
 if(!product)return NextResponse.json({error:'Unknown paid plan'},{status:400});
 if(!product.stripePriceId||!process.env.STRIPE_SECRET_KEY||!process.env.STRIPE_WEBHOOK_SECRET)return NextResponse.json({error:'Stripe checkout is not configured. A secret key, webhook secret and plan price ID are required.'},{status:503});
 if(!await store.organizationById(session.orgId))return NextResponse.json({error:'No active organization'},{status:409});
 const origin=requestOrigin(req);
 const checkout=await stripe().checkout.sessions.create({mode:'subscription',line_items:[{price:product.stripePriceId,quantity:1}],client_reference_id:session.orgId,metadata:{orgId:session.orgId,productId:product.id},subscription_data:{metadata:{orgId:session.orgId,productId:product.id}},success_url:origin+'/settings/billing?checkout=success',cancel_url:origin+'/settings/billing?checkout=canceled'});
 return NextResponse.json({url:checkout.url});
}
