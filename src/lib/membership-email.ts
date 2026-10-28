import {randomUUID} from 'node:crypto';
import {store} from './store';
import {notifier,type Notifier} from './notifications';
import {browserOrigin} from './session';
import {sendVerificationEmail,verificationPending} from './email-verification';
import {requireEmailDelivery,SignupError} from './signup-policy';

type EmailRequest={nextUrl:{protocol:string};headers:{get(name:string):string|null}};
export type MembershipEmailResult={status:'provider_accepted'|'verification_sent'|'local_only'|'failed';message:string};

export async function sendMembershipEmail(req:EmailRequest,orgId:string,userId:string,delivery:Notifier=notifier()):Promise<MembershipEmailResult>{
 const [org,user,membership]=await Promise.all([store.organizationById(orgId),store.userById(userId),store.membership(orgId,userId)]);
 if(!org||!user?.email||user.status!=='active'||membership?.status!=='active')throw new SignupError('An active member with an email address is required.',404);
 requireEmailDelivery();
 const link=browserOrigin(req)+'/login';
 const bucket=Math.floor(Date.now()/60000);
 if(!await store.claimOnce(orgId,'MEMBERSHIP_EMAIL#'+userId+'#'+bucket,1))throw new SignupError('An invitation email was just requested. Wait one minute before resending.',429,60);
 let status:MembershipEmailResult['status'];
 if(verificationPending(user)){
  if(user.emailVerified!==false)throw new SignupError('This account must verify its email from Sign in before receiving an invitation.',409);
  await sendVerificationEmail(req,user,{name:org.name,role:membership.role});
  status=process.env.GUARDSCALE_NOTIFICATION_MODE==='aws'?'verification_sent':'local_only';
 }else{
  const receipt=await delivery.send({channel:'email',destination:user.email,subject:'You have been added to '+org.name.replace(/[\r\n]/g,' ').slice(0,120)+' on GuardScale',text:`Hello ${user.displayName},\n\nYou have been added to ${org.name} on GuardScale as ${membership.role}. Your organization access is already active.\n\nSign in using your existing email and password: ${link}\n\nAfter signing in, open the workspace picker in the header and select ${org.name}. Your password and access to other organizations have not changed.`,reviewUrl:link});
  status=receipt==='local-notification-not-delivered'?'local_only':'provider_accepted';
 }
 await store.putEvent({id:randomUUID(),tenantId:orgId,serverId:'__guardscale_membership_email__',agentId:'guardscale',type:'membership.email.'+status,at:new Date().toISOString(),metadata:{user_id:userId}}).catch(()=>console.warn(JSON.stringify({level:'warn',message:'Membership email accepted; delivery audit write deferred'})));
 return {status,message:status==='local_only'?'Access added. Email delivery is disabled in local notification mode.':status==='verification_sent'?'Verification and organization-access email accepted by the email service.':'Organization-access email accepted by the email service. Delivery to the inbox is not yet confirmed.'};
}
