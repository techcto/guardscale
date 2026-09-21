import{NextRequest,NextResponse}from'next/server';import{randomUUID}from'node:crypto';import{operator}from'@/lib/operator';import{store}from'@/lib/store';import{stripe}from'@/lib/stripe';
export async function POST(req:NextRequest){
  const session=await operator(req);
  if(!session)return NextResponse.json({error:'unauthorized'},{status:401});
  const {productId}=await req.json() as {productId?:string};
  const product=(await store.products()).find(x=>x.id===productId&&x.active);
  if(!product)return NextResponse.json({error:'Unknown plan'},{status:400});
  const origin=new URL(req.url).origin;
  if(!product.stripePriceId){
    await store.putSubscription({id:randomUUID(),orgId:session.orgId,productId:product.id,status:'active',updatedAt:new Date().toISOString()});
    return NextResponse.json({url:`${origin}/settings?tab=Billing&checkout=local`});
  }
  const checkout=await stripe().checkout.sessions.create({mode:'subscription',line_items:[{price:product.stripePriceId,quantity:1}],client_reference_id:session.orgId,metadata:{orgId:session.orgId,productId:product.id},success_url:`${origin}/settings?tab=Billing&checkout=success`,cancel_url:`${origin}/settings?tab=Billing&checkout=canceled`});
  return NextResponse.json({url:checkout.url});
}
