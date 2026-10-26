import {NextRequest,NextResponse} from 'next/server';
import {operator} from '@/lib/operator';
import {store} from '@/lib/store';
import {stripe} from '@/lib/stripe';
import {browserOrigin} from '@/lib/session';
export async function POST(req:NextRequest){
 const s=await operator(req);
 if(!s||!['root','admin'].includes(s.role))return NextResponse.json({error:'forbidden'},{status:403});
 if(process.env.GUARDSCALE_DEPLOYMENT_MODE!=='saas')return NextResponse.json({error:'Billing is disabled for private installs'},{status:409});
 let origin:string;try{origin=browserOrigin(req);}catch{return NextResponse.json({error:'Billing origin is not configured'},{status:503});}
 if(req.headers.get('origin')!==origin)return NextResponse.json({error:'forbidden'},{status:403});
 const subscription=await store.activeSubscriptionForOrg(s.orgId);
 if(!subscription?.stripeCustomerId)return NextResponse.json({error:'No paid subscription to manage'},{status:409});
 try{const portal=await stripe().billingPortal.sessions.create({customer:subscription.stripeCustomerId,return_url:origin+'/settings/billing'});return NextResponse.json({url:portal.url});}catch{return NextResponse.json({error:'Unable to open billing management'},{status:503});}
}
