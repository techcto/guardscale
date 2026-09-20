import{NextRequest,NextResponse}from'next/server';import{operator}from'@/lib/operator';import{notifier}from'@/lib/notifications';
export async function POST(req:NextRequest){
  const session=await operator(req);
  if(!session||!['root','admin'].includes(session.role))return NextResponse.json({error:'forbidden'},{status:403});
  const {channel,destination,originationId}=await req.json() as {channel?:'email'|'whatsapp';destination?:string;originationId?:string};
  if(channel!=='email'&&channel!=='whatsapp')return NextResponse.json({error:'channel must be email or whatsapp'},{status:400});
  if(!destination)return NextResponse.json({error:'A destination is required to send a test notification'},{status:400});
  try{
    const id=await notifier().send({channel,destination,originationId,subject:'Guardian.US test notification',text:`This is a test notification from Guardian.US, sent by ${session.username}.`});
    return NextResponse.json({status:'sent',id});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to send test notification'},{status:502});
  }
}
