import{NextRequest,NextResponse}from'next/server';import{createResetToken}from'@/lib/session';import{store}from'@/lib/store';import{notifier}from'@/lib/notifications';
export async function POST(req:NextRequest){
  const {username}=await req.json() as {username?:string};
  const secret=process.env.GUARDIAN_SESSION_SECRET;
  let resetLink:string|undefined;
  if(secret&&username){
    const user=await store.userByName(username);
    if(user&&user.status==='active'){
      const token=await createResetToken(user.id,secret);
      const origin=new URL(req.url).origin;
      const link=`${origin}/login/reset-password?token=${token}`;
      await notifier().send({channel:'email',destination:user.username,subject:'Reset your Guardian.US password',text:`A password reset was requested for your Guardian.US account. This link expires in 15 minutes: ${link}`}).catch(()=>{});
      if(process.env.GUARDIAN_NOTIFICATION_MODE!=='aws')resetLink=link;
    }
  }
  return NextResponse.json({status:'ok',...(resetLink?{resetLink}:{})});
}
