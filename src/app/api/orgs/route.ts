import{NextRequest,NextResponse}from'next/server';import{operator}from'@/lib/operator';import{store}from'@/lib/store';import type{OrgType}from'@/lib/model';
export async function GET(req:NextRequest){
  const session=await operator(req);
  if(!session)return NextResponse.json({error:'unauthorized'},{status:401});
  if(session.role==='root'){const orgs=await store.organizations();return NextResponse.json(orgs.map(o=>({id:o.id,name:o.name,slug:o.slug,orgType:o.orgType,role:'root'})))}
  const memberships=await store.orgsForUser(session.id);
  return NextResponse.json(memberships.map(m=>({id:m.org.id,name:m.org.name,slug:m.org.slug,orgType:m.org.orgType,role:m.membership.role})));
}
export async function POST(req:NextRequest){
  const session=await operator(req);
  if(!session||session.role!=='root')return NextResponse.json({error:'forbidden'},{status:403});
  const {name,orgType}=await req.json() as {name?:string;orgType?:OrgType};
  if(!name?.trim())return NextResponse.json({error:'name is required'},{status:400});
  const org=await store.createOrganization({name:name.trim(),ownerId:'',orgType:orgType==='personal'?'personal':'business'});
  return NextResponse.json(org,{status:201});
}
