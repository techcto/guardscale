import {NextRequest,NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {operator} from '@/lib/operator';
import {store} from '@/lib/store';
import type {MembershipRole,OrgMembership} from '@/lib/model';
import {hashPassword} from '@/lib/password';
import {normalizeEmail} from '@/lib/email-verification';
import {SignupError,checkEmailDomain,requireEmailDelivery} from '@/lib/signup-policy';
import {requestOrigin} from '@/lib/session';
import {readBody} from '@/lib/read-body';
import {sendMembershipEmail,type MembershipEmailResult} from '@/lib/membership-email';
export async function GET(req:NextRequest){const session=await operator(req);if(!session)return NextResponse.json({error:'unauthorized'},{status:401});const members=await store.membersOfOrg(session.orgId);return NextResponse.json(members.map(({membership,user})=>({id:user.id,username:user.username,email:user.email,displayName:user.displayName,role:membership.role,status:membership.status,createdAt:membership.createdAt})));}
export async function POST(req:NextRequest){
 const session=await operator(req);if(!session||!['root','admin'].includes(session.role)||req.headers.get('origin')!==requestOrigin(req))return NextResponse.json({error:'forbidden'},{status:403});
 let v;try{v=JSON.parse(await readBody(req,8192));if(!v||typeof v!=='object')throw Error();}catch{return NextResponse.json({error:'Invalid user request'},{status:400});}
 if(v.mode!==undefined&&!['existing','new'].includes(v.mode))return NextResponse.json({error:'Choose an existing or new user'},{status:400});
 const email=normalizeEmail(v.email);if(!email)return NextResponse.json({error:'Enter a valid email address'},{status:400});
 if(email===process.env.GUARDSCALE_ROOT_USER?.trim().toLowerCase())return NextResponse.json({error:'This email is reserved'},{status:409});
 if(!['admin','operator','viewer'].includes(v.role))return NextResponse.json({error:'Invalid role'},{status:400});
 const now=new Date().toISOString();let user=await store.userByName(email);
 if(user){
  if(await store.membership(session.orgId,user.id))return NextResponse.json({error:'User is already a member of this organization'},{status:409});
  if(user.status!=='active')return NextResponse.json({error:'This account is disabled'},{status:409});
  if(v.mode==='new')return NextResponse.json({error:'This email already has an account. Choose Existing user to add them.'},{status:409});
 }
 else{
  if(v.mode==='existing')return NextResponse.json({error:'No account found for this email. Choose New user to create one.'},{status:404});
  if(typeof v.displayName!=='string'||!v.displayName.trim()||v.displayName.length>100)return NextResponse.json({error:'Enter a display name of 1-100 characters'},{status:400});
  if(typeof v.password!=='string'||v.password.length<12||v.password.length>256)return NextResponse.json({error:'Password must be 12-256 characters'},{status:400});
  const requireVerification=process.env.GUARDSCALE_DEPLOYMENT_MODE==='saas';
  if(requireVerification){try{requireEmailDelivery();checkEmailDomain(email);}catch(e){return NextResponse.json({error:e instanceof SignupError?e.message:'Email verification unavailable'},{status:e instanceof SignupError?e.status:503});}}
  user={id:randomUUID(),username:email,email,displayName:v.displayName.trim(),...(requireVerification?{emailVerified:false}:{}),status:'active',createdAt:now,updatedAt:now};
  if(!await store.createUser(user,hashPassword(v.password)))return NextResponse.json({error:'This email is already taken'},{status:409});
 }
 const membership:OrgMembership={id:randomUUID(),orgId:session.orgId,userId:user.id,role:v.role as MembershipRole,status:'active',invitedByUserId:session.id,createdAt:now,updatedAt:now};await store.putMembership(membership);
 let invitation:MembershipEmailResult;
 try{invitation=await sendMembershipEmail(req,session.orgId,user.id);}catch{invitation={status:'failed',message:'Access was added, but the invitation email could not be sent. Use Resend invitation to retry.'};console.warn(JSON.stringify({level:'warn',message:'Membership saved; invitation email failed'}));}
 return NextResponse.json({id:user.id,username:user.username,email:user.email,displayName:user.displayName,role:membership.role,status:membership.status,createdAt:membership.createdAt,invitation},{status:201});
}
