import{browserOrigin,createVerifyEmailToken}from'./session';
import{notifier}from'./notifications';
import{store}from'./store';
import type{GuardScaleUser}from'./model';
import {SignupError,checkEmailDomain,localAuthLinks,requireEmailDelivery} from './signup-policy';
// Osirus's RESEND_EMAIL_IN_MINUTES.
export const RESEND_VERIFICATION_MINUTES=25;
export function normalizeEmail(value:unknown){const email=typeof value==='string'?value.trim().toLowerCase():'';const [local,domain]=email.split('@');return email.length<=254&&local?.length<=64&&!local.startsWith('.')&&!local.endsWith('.')&&!local.includes('..')&&/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(email)&&domain.split('.').every(label=>label.length<=63&&!label.startsWith('-')&&!label.endsWith('-'))?email:null}
// Public accounts must explicitly prove ownership; absence of a flag is not approval.
export const verificationPending=(user:GuardScaleUser)=>process.env.GUARDSCALE_DEPLOYMENT_MODE==='saas'?user.emailVerified!==true:user.emailVerified===false;
// Minutes until another link may be sent, or 0 when one may go now.
export const resendWaitMinutes=(user:GuardScaleUser,now=Date.now())=>user.verificationSentAt?Math.max(0,Math.ceil((Date.parse(user.verificationSentAt)+RESEND_VERIFICATION_MINUTES*60000-now)/60000)):0;
// Returns the link only outside AWS notification mode, the same way the password reset flow exposes it for local installs.
export async function sendVerificationEmail(req:{nextUrl:{protocol:string};headers:{get(name:string):string|null}},user:GuardScaleUser){
 requireEmailDelivery();if(!user.email)throw new SignupError('Email address required');checkEmailDomain(user.email);
 const secret=process.env.GUARDSCALE_SESSION_SECRET!;
 const token=await createVerifyEmailToken(user.id,user.email,secret);
 const link=`${browserOrigin(req)}/login/verify-email?token=${token}`;
 const sentAt=new Date().toISOString(),cutoff=new Date(Date.now()-RESEND_VERIFICATION_MINUTES*60000).toISOString();
 if(!await store.reserveVerificationEmail(user.id,user.email,sentAt,cutoff))throw new SignupError('A verification email was recently requested. Please wait before requesting another.',409);
 try{await notifier().send({channel:'email',destination:user.email,subject:'Verify your GuardScale email',text:`Welcome to GuardScale, ${user.displayName}. Confirm this email address to finish setting up your account. This link expires in 24 hours: ${link}`});}catch{await store.releaseVerificationEmail(user.id,sentAt).catch(()=>{});console.error(JSON.stringify({level:'error',message:'verification email delivery failed'}));throw new SignupError('Unable to send verification email. Your account is not verified. Please request a new link from Sign in.',503);}
 return localAuthLinks()?link:undefined;
}
