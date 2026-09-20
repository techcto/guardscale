import{NextRequest,NextResponse}from'next/server';import{operator}from'@/lib/operator';import{store}from'@/lib/store';import type{MembershipRole}from'@/lib/model';

export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const session=await operator(req);
  if(!session)return NextResponse.json({error:'unauthorized'},{status:401});
  const {id}=await params;
  const [user,membership]=await Promise.all([store.userById(id),store.membership(session.orgId,id)]);
  if(!user||!membership)return NextResponse.json({error:'not found'},{status:404});
  return NextResponse.json({id:user.id,username:user.username,displayName:user.displayName,role:membership.role,status:membership.status,createdAt:membership.createdAt});
}

export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const session=await operator(req);
  if(!session||!['root','admin'].includes(session.role))return NextResponse.json({error:'forbidden'},{status:403});
  const {id}=await params;
  const [user,membership]=await Promise.all([store.userById(id),store.membership(session.orgId,id)]);
  if(!user||!membership)return NextResponse.json({error:'not found'},{status:404});
  const v=await req.json() as {role?:MembershipRole;status?:'active'|'disabled'};
  if(v.role&&!['admin','operator','viewer'].includes(v.role))return NextResponse.json({error:'invalid role'},{status:400});
  if(v.status&&!['active','disabled'].includes(v.status))return NextResponse.json({error:'invalid status'},{status:400});
  const updated={...membership,role:v.role??membership.role,status:v.status??membership.status,updatedAt:new Date().toISOString()};
  await store.putMembership(updated);
  return NextResponse.json({id:user.id,username:user.username,displayName:user.displayName,role:updated.role,status:updated.status,createdAt:updated.createdAt});
}

export async function DELETE(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const session=await operator(req);
  if(!session||!['root','admin'].includes(session.role))return NextResponse.json({error:'forbidden'},{status:403});
  const {id}=await params;
  const existing=await store.membership(session.orgId,id);
  if(!existing)return NextResponse.json({error:'not found'},{status:404});
  await store.deleteMembership(session.orgId,id);
  return NextResponse.json({status:'deleted'});
}
