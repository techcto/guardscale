import{NextRequest,NextResponse}from'next/server';import{operator}from'@/lib/operator';import{store}from'@/lib/store';

export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const session=await operator(req);
  if(!session)return NextResponse.json({error:'unauthorized'},{status:401});
  const {id}=await params;
  const incident=await store.incident(session.orgId,id);
  if(!incident)return NextResponse.json({error:'not found'},{status:404});
  const node=await store.node(session.orgId,incident.serverId);
  return NextResponse.json({incident,node});
}

export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const session=await operator(req);
  if(!session||session.role==='viewer')return NextResponse.json({error:'forbidden'},{status:403});
  const {state}=await req.json() as {state?:string};
  if(!state||!['acknowledged','resolved','watch'].includes(state))return NextResponse.json({error:'state must be acknowledged, resolved, or watch'},{status:400});
  const {id}=await params;
  const existing=await store.incident(session.orgId,id);
  if(!existing)return NextResponse.json({error:'not found'},{status:404});
  const updated={...existing,state,updatedAt:new Date().toISOString()};
  await store.putIncident(updated);
  return NextResponse.json(updated);
}
