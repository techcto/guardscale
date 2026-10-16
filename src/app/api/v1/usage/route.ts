import{NextRequest,NextResponse}from'next/server';import{operator}from'@/lib/operator';import{usageSummary}from'@/lib/usage';
// Measured usage for the current billing period. SaaS only: private installations are not metered.
export async function GET(req:NextRequest){
  const session=await operator(req);
  if(!session)return NextResponse.json({error:'unauthorized'},{status:401});
  if(process.env.GUARDSCALE_DEPLOYMENT_MODE!=='saas')return NextResponse.json({error:'Usage is not metered on private installations'},{status:404});
  const settings=session.role==='root'||session.role==='admin';
  return NextResponse.json({...await usageSummary(session.orgId),canEdit:settings},{headers:{'Cache-Control':'no-store'}});
}
