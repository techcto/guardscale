import{NextRequest,NextResponse}from'next/server';import{operator}from'@/lib/operator';import{store}from'@/lib/store';import type{UserRole}from'@/lib/model';

export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const session=await operator(req);
  if(!session)return NextResponse.json({error:'unauthorized'},{status:401});
  const {id}=await params;
  const user=(await store.users()).find(u=>u.id===id);
  if(!user)return NextResponse.json({error:'not found'},{status:404});
  return NextResponse.json(user);
}

export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const session=await operator(req);
  if(!session||!['root','admin'].includes(session.role))return NextResponse.json({error:'forbidden'},{status:403});
  const {id}=await params;
  const user=(await store.users()).find(u=>u.id===id);
  if(!user)return NextResponse.json({error:'not found'},{status:404});
  const v=await req.json() as {role?:UserRole;status?:'active'|'disabled'};
  if(v.role&&!['admin','operator','viewer'].includes(v.role))return NextResponse.json({error:'invalid role'},{status:400});
  if(v.status&&!['active','disabled'].includes(v.status))return NextResponse.json({error:'invalid status'},{status:400});
  const updated={...user,role:v.role??user.role,status:v.status??user.status,updatedAt:new Date().toISOString()};
  await store.putUser(updated);
  return NextResponse.json(updated);
}

export async function DELETE(req:NextRequest,{params}:{params:Promise<{id:string}>}){const session=await operator(req);if(!session||!['root','admin'].includes(session.role))return NextResponse.json({error:'forbidden'},{status:403});return await store.deleteUser((await params).id)?NextResponse.json({status:'deleted'}):NextResponse.json({error:'not found'},{status:404})}
