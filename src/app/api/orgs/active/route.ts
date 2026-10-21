import{NextRequest,NextResponse}from'next/server';import{createSession,isSecureRequest,sessionCookie}from'@/lib/session';import{operator}from'@/lib/operator';import{store}from'@/lib/store';
export async function POST(req:NextRequest){
  const session=await operator(req);
  if(!session)return NextResponse.json({error:'unauthorized'},{status:401});
  const {orgId}=await req.json() as {orgId?:string};
  if(!orgId)return NextResponse.json({error:'orgId is required'},{status:400});
  if(process.env.GUARDSCALE_DEPLOYMENT_MODE!=='saas'&&orgId!==(await store.ensureSingleDeploymentOrg()).id)return NextResponse.json({error:'Organization switching is disabled in private mode'},{status:403});
  const org=await store.organizationById(orgId);
  if(!org)return NextResponse.json({error:'not found'},{status:404});
  let role:'root'|'admin'|'operator'|'viewer';
  if(session.role==='root'){role='root'}
  else{const membership=await store.membership(orgId,session.id);if(!membership||membership.status!=='active')return NextResponse.json({error:'forbidden'},{status:403});role=membership.role}
  const secret=process.env.GUARDSCALE_SESSION_SECRET??'';
  const token=await createSession({id:session.id,username:session.username,role,orgId,expiresAt:Date.now()+28800000},secret);
  const res=NextResponse.json({orgId,role});
  // Lax so the session survives top-level returns from Stripe Checkout; cross-site POSTs still carry no cookie.
  res.cookies.set(sessionCookie,token,{httpOnly:true,sameSite:'lax',secure:isSecureRequest(req),path:'/',maxAge:28800});
  return res;
}
