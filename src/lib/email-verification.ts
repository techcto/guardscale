import{browserOrigin,createVerifyEmailToken}from'./session';
import{notifier}from'./notifications';
import{store}from'./store';
import type{GuardScaleUser}from'./model';
// Osirus's RESEND_EMAIL_IN_MINUTES.
export const RESEND_VERIFICATION_MINUTES=25;
export function normalizeEmail(value:unknown){const email=typeof value==='string'?value.trim().toLowerCase():'';return email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?email:null}
// Accounts created before verification existed have no flag and keep signing in, like Osirus's legacy fallback.
export const verificationPending=(user:GuardScaleUser)=>user.emailVerified===false;
// Minutes until another link may be sent, or 0 when one may go now.
export const resendWaitMinutes=(user:GuardScaleUser,now=Date.now())=>user.verificationSentAt?Math.max(0,Math.ceil((Date.parse(user.verificationSentAt)+RESEND_VERIFICATION_MINUTES*60000-now)/60000)):0;
// Returns the link only outside AWS notification mode, the same way the password reset flow exposes it for local installs.
export async function sendVerificationEmail(req:{nextUrl:{protocol:string};headers:{get(name:string):string|null}},user:GuardScaleUser){
 const secret=process.env.GUARDSCALE_SESSION_SECRET;if(!secret||!user.email)return undefined;
 const token=await createVerifyEmailToken(user.id,user.email,secret);
 const link=`${browserOrigin(req)}/login/verify-email?token=${token}`;
 await store.putUser({...user,verificationSentAt:new Date().toISOString()});
 await notifier().send({channel:'email',destination:user.email,subject:'Verify your GuardScale email',text:`Welcome to GuardScale, ${user.displayName}. Confirm this email address to finish setting up your account. This link expires in 24 hours: ${link}`}).catch(e=>console.error(JSON.stringify({level:'error',message:'verification email failed',userId:user.id,error:String(e)})));
 return process.env.GUARDSCALE_NOTIFICATION_MODE!=='aws'?link:undefined;
}
