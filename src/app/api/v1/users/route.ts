import{NextRequest,NextResponse}from'next/server';import{randomUUID}from'node:crypto';import{operator}from'@/lib/operator';import{store}from'@/lib/store';import type{MembershipRole,OrgMembership}from'@/lib/model';import{hashPassword}from'@/lib/password';
export async function GET(req:NextRequest){
  const session=await operator(req);
  if(!session)return NextResponse.json({error:'unauthorized'},{status:401});
  const members=await store.membersOfOrg(session.orgId);
  return NextResponse.json(members.map(({membership,user})=>({id:user.id,username:user.username,displayName:user.displayName,role:membership.role,status:membership.status,createdAt:membership.createdAt})));
}
export async function POST(req:NextRequest){
  const session=await operator(req);
  if(!session||!['root','admin'].includes(session.role))return NextResponse.json({error:'forbidden'},{status:403});
  const v=await req.json() as {username?:string;displayName?:string;role?:MembershipRole;password?:string};
  if(!v.username||!v.role||!['admin','operator','viewer'].includes(v.role))return NextResponse.json({error:'Invalid user or role'},{status:400});
  const now=new Date().toISOString();
  let user=await store.userByName(v.username);
  if(user){
    const existing=await store.membership(session.orgId,user.id);
    if(existing)return NextResponse.json({error:'user is already a member of this organization'},{status:409});
  }else{
    if(!v.displayName||!v.password||v.password.length<12)return NextResponse.json({error:'Invalid user or password shorter than 12 characters'},{status:400});
    user={id:randomUUID(),username:v.username.trim(),displayName:v.displayName.trim(),status:'active',createdAt:now,updatedAt:now};
    await store.putUser(user,hashPassword(v.password));
  }
  const membership:OrgMembership={id:randomUUID(),orgId:session.orgId,userId:user.id,role:v.role,status:'active',invitedByUserId:session.id,createdAt:now,updatedAt:now};
  await store.putMembership(membership);
  return NextResponse.json({id:user.id,username:user.username,displayName:user.displayName,role:membership.role,status:membership.status,createdAt:membership.createdAt},{status:201});
}
