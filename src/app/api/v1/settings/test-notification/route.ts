import{NextRequest,NextResponse}from'next/server';import{operator}from'@/lib/operator';import{notifier}from'@/lib/notifications';
import {requestOrigin} from '@/lib/session';
import {notificationReceipt} from '@/lib/whatsapp-setup';
export async function POST(req:NextRequest){
  if(req.headers.get('origin')!==requestOrigin(req))return NextResponse.json({error:'Same-origin request required'},{status:403});
  const session=await operator(req);
  if(!session||!['root','admin'].includes(session.role))return NextResponse.json({error:'forbidden'},{status:403});
  const {channel,destination,originationId}=await req.json() as {channel?:'email'|'whatsapp';destination?:string;originationId?:string};
  if(channel!=='email'&&channel!=='whatsapp')return NextResponse.json({error:'channel must be email or whatsapp'},{status:400});
  if(!destination)return NextResponse.json({error:'A destination is required to send a test notification'},{status:400});
  try{
    const id=await notifier().send({channel,destination,originationId,subject:'GuardScale test notification',text:`This is a test notification from GuardScale, sent by ${session.username}.`});
    return NextResponse.json({...notificationReceipt(id),id});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to send test notification'},{status:502});
  }
}
