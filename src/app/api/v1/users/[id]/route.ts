import{NextRequest,NextResponse}from'next/server';import{operator}from'@/lib/operator';import{store}from'@/lib/store';import type{MembershipRole}from'@/lib/model';import{requestOrigin,sessionCookie}from'@/lib/session';import{DeletionBlocked,deleteUserAccount}from'@/lib/admin';

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

// With a typed DELETE confirmation, root deletes any SaaS account and members delete their own (Cloud's user deletion);
// without it, root/admin remove the user from the active organization only.
export async function DELETE(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const session=await operator(req);
  const {id}=await params;
  if((await req.json().catch(()=>null))?.confirmation==='DELETE'){
    if(process.env.GUARDSCALE_DEPLOYMENT_MODE!=='saas'||!session||(session.role!=='root'&&session.id!==id)||req.headers.get('origin')!==requestOrigin(req))return NextResponse.json({error:'forbidden'},{status:403});
    try{if(!await deleteUserAccount(id))return NextResponse.json({error:'not found'},{status:404})}
    catch(e){if(e instanceof DeletionBlocked)return NextResponse.json({error:e.message},{status:409});throw e}
    const res=NextResponse.json({status:'deleted'});if(session.id===id)res.cookies.delete(sessionCookie);return res;
  }
  if(!session||!['root','admin'].includes(session.role))return NextResponse.json({error:'forbidden'},{status:403});
  const existing=await store.membership(session.orgId,id);
  if(!existing)return NextResponse.json({error:'not found'},{status:404});
  await store.deleteMembership(session.orgId,id);
  return NextResponse.json({status:'deleted'});
}
