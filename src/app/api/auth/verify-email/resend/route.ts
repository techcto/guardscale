import{NextRequest,NextResponse}from'next/server';import{store}from'@/lib/store';import{resendWaitMinutes,sendVerificationEmail,verificationPending}from'@/lib/email-verification';
// Follows Osirus's resend: the same answer for unknown or verified accounts, and a wait message inside the cooldown.
export async function POST(req:NextRequest){
  const {username}=await req.json().catch(()=>({})) as {username?:string};
  const user=username?await store.userByName(username):null;
  if(!user||user.status!=='active'||!verificationPending(user))return NextResponse.json({status:'ok'});
  const wait=resendWaitMinutes(user);
  if(wait)return NextResponse.json({error:`Please wait. We can send the email again in ${wait} minute${wait===1?'':'s'}`},{status:409});
  const verifyLink=await sendVerificationEmail(req,user);
  return NextResponse.json({status:'ok',...(verifyLink?{verifyLink}:{})});
}
