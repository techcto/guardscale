import {NextRequest,NextResponse} from 'next/server';
import {browserOrigin,createResetToken} from '@/lib/session';
import {notifier} from '@/lib/notifications';
import {localAuthLinks} from '@/lib/signup-policy';
import {userForIdentifier} from '@/lib/account-identity';
import {readBody} from '@/lib/read-body';
export async function POST(req:NextRequest){
 let input;try{input=JSON.parse(await readBody(req,4096));if(!input||typeof input!=='object')throw Error();}catch{return NextResponse.json({error:'Invalid password reset request'},{status:400});}
 const secret=process.env.GUARDSCALE_SESSION_SECRET;let resetLink:string|undefined;
 const user=secret?await userForIdentifier(input.email??input.username):null;
 if(secret&&user?.email&&user.status==='active'){
  const token=await createResetToken(user.id,secret),link=browserOrigin(req)+'/login/reset-password?token='+token;
  await notifier().send({channel:'email',destination:user.email,subject:'Reset your GuardScale password',text:'A password reset was requested for your GuardScale account. This link expires in 15 minutes: '+link}).catch(()=>console.error(JSON.stringify({level:'error',message:'password reset email failed',userId:user.id})));
  if(localAuthLinks())resetLink=link;
 }
 return NextResponse.json({status:'ok',...(resetLink?{resetLink}:{})});
}
