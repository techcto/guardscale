import{NextRequest,NextResponse}from'next/server';import{operator}from'@/lib/operator';import{store}from'@/lib/store';
export async function GET(req:NextRequest){
  const session=await operator(req);
  if(!session)return NextResponse.json({error:'unauthorized'},{status:401});
  const products=await store.products();
  const subscription=await store.activeSubscriptionForOrg(session.orgId);
  const product=products.find(p=>p.id===subscription?.productId)??products.find(p=>p.id==='dev')??products[0];
  return NextResponse.json({productId:product?.id??null,serverLimit:product?.serverLimit??1});
}
