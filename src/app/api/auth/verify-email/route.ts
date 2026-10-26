import{NextRequest,NextResponse}from'next/server';import{createSession,isSecureRequest,sessionCookie,verifySession,verifyVerifyEmailToken}from'@/lib/session';import{store}from'@/lib/store';import{defaultActiveOrgForUser}from'@/lib/org-resolve';
import {checkEmailDomain,SignupError} from '@/lib/signup-policy';
import {readBody} from '@/lib/read-body';
// Like Osirus: the emailed link opens a page that posts the token here, so mail scanners that prefetch links cannot use
// it. Verifying signs the user in. Sign-in happens only on the unverified -> verified transition, so an old link is not
// a reusable login, and another user's open session is kept.
export async function POST(req:NextRequest){
  const secret=process.env.GUARDSCALE_SESSION_SECRET??'';
  let input;try{input=JSON.parse(await readBody(req,8192));}catch{return NextResponse.json({error:'Invalid verification request'},{status:400});}
  const {token}=input??{};
  if(typeof token!=='string'||token.length>4096)return NextResponse.json({error:'Invalid verification request'},{status:400});
  const claim=await verifyVerifyEmailToken(token,secret);
  const user=claim&&await store.userById(claim.userId);
  if(!user||user.status!=='active'||user.email!==claim.email)return NextResponse.json({error:'This verification link has expired or was already replaced. Sign in to request a new one.'},{status:400});
  if(user.emailVerified!==false)return NextResponse.json({redirect:'/login?verify=done'});
  try{checkEmailDomain(user.email!);}catch(e){return NextResponse.json({error:e instanceof SignupError?e.message:'Verification unavailable'},{status:400});}
  if(!await store.verifyUserEmail(user.id,user.email!))return NextResponse.json({redirect:'/login?verify=done'});
  const current=await verifySession(req.cookies.get(sessionCookie)?.value,secret);
  if(current&&current.id!==user.id)return NextResponse.json({redirect:'/console'});
  const active=await defaultActiveOrgForUser(user.id);
  if(!active)return NextResponse.json({redirect:'/login?verify=done'});
  const session=await createSession({id:user.id,username:user.username,role:active.role,orgId:active.orgId,expiresAt:Date.now()+28800000},secret),res=NextResponse.json({redirect:'/console'});
  res.cookies.set(sessionCookie,session,{httpOnly:true,sameSite:'lax',secure:isSecureRequest(req),path:'/',maxAge:28800});
  return res;
}
