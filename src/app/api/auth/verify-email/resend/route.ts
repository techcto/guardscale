import {userForIdentifier,accountIdentifier} from '@/lib/account-identity';
import{NextRequest,NextResponse}from'next/server';import{resendWaitMinutes,sendVerificationEmail,verificationPending}from'@/lib/email-verification';
import {SignupError,limitAuthRequests,requireEmailDelivery} from '@/lib/signup-policy';
import {readBody} from '@/lib/read-body';
// Follows Osirus's resend: the same answer for unknown or verified accounts, and a wait message inside the cooldown.
export async function POST(req:NextRequest){
 try{
  requireEmailDelivery();await limitAuthRequests(req.headers,'resend');
  const input=JSON.parse(await readBody(req,4096)) as {username?:string;email?:string};const username=accountIdentifier(input.username??input.email);
  if(username.length>254)throw new SignupError('Invalid verification request');
  const user=username?await userForIdentifier(username):null;
  if(!user||user.status!=='active'||!verificationPending(user))return NextResponse.json({status:'ok'});
  const wait=resendWaitMinutes(user);
  if(wait)return NextResponse.json({error:`Please wait. We can send the email again in ${wait} minute${wait===1?'':'s'}`},{status:409});
  const verifyLink=await sendVerificationEmail(req,user);
  return NextResponse.json({status:'ok',...(verifyLink?{verifyLink}:{})});
 }catch(e){return NextResponse.json({error:e instanceof SignupError?e.message:'Unable to send verification email. Please try again.'},{status:e instanceof SignupError?e.status:503,headers:e instanceof SignupError&&e.retryAfter?{'Retry-After':String(e.retryAfter)}:{}});}
}
