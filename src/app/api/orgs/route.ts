import{NextRequest,NextResponse}from'next/server';import{randomUUID}from'node:crypto';import{operator}from'@/lib/operator';import{store}from'@/lib/store';import type{OrgMembership}from'@/lib/model';
export async function GET(req:NextRequest){
  const session=await operator(req);
  if(!session)return NextResponse.json({error:'unauthorized'},{status:401});
  const memberships=await store.orgsForUser(session.id);
  return NextResponse.json(memberships.map(m=>({id:m.org.id,name:m.org.name,slug:m.org.slug,orgType:m.org.orgType,role:m.membership.role})));
}
export async function POST(req:NextRequest){
  const session=await operator(req);
  if(!session||session.role!=='root')return NextResponse.json({error:'forbidden'},{status:403});
  const {name,contactEmail,contactPhone}=await req.json() as {name?:string;contactEmail?:string;contactPhone?:string};
  if(!name?.trim())return NextResponse.json({error:'name is required'},{status:400});
  const org=await store.createOrganization({name:name.trim(),ownerId:session.id,orgType:'business',contactEmail:contactEmail?.trim()||undefined,contactPhone:contactPhone?.trim()||undefined});
  const now=new Date().toISOString();
  const membership:OrgMembership={id:randomUUID(),orgId:org.id,userId:session.id,role:'admin',status:'active',createdAt:now,updatedAt:now};
  await store.putMembership(membership);
  return NextResponse.json(org,{status:201});
}
