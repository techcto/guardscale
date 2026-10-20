import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {store} from './store';
import {whatsappSetupAuditId} from './model';
import {notifier,whatsappOrigination} from './notifications';

export const setupNode=whatsappSetupAuditId;
export const normalizePhone=(value:string)=>value.replace(/\D/g,'');
export function validSender(value:string){return value.length<=200&&(/^phone-number-id-[a-zA-Z0-9]+$/.test(value)||/^arn:aws[a-z-]*:social-messaging:[a-z0-9-]+:\d{12}:phone-number-id\/[a-zA-Z0-9-]+$/.test(value))}
export function validPhone(value:string){return /^\+[1-9]\d{7,14}$/.test(value)}
export function senderMatches(origin:string,arns:string[]){
 if(origin.startsWith('arn:'))return arns.includes(origin);
 // AWS IDs have a phone-number-id- prefix; event ARN resource IDs do not.
 const id=origin.replace(/^phone-number-id-/,'');
 return arns.some(arn=>/^arn:aws[a-z-]*:social-messaging:[a-z0-9-]+:\d{12}:phone-number-id\/[a-zA-Z0-9-]+$/.test(arn)&&(arn.endsWith('/'+id)||arn.endsWith('/'+origin)));
}
export function notificationReceipt(id:string){return id==='local-notification-not-delivered'?{status:'local_only',message:'Recorded locally only. No message was delivered.'}:{status:'provider_accepted',message:'AWS accepted the message. Delivery is not yet confirmed; check your phone.'}}
const secret=()=>{const value=process.env.GUARDSCALE_SESSION_SECRET;if(!value)throw Error('Session signing is not configured');return value};
const digest=(value:string)=>createHmac('sha256',secret()).update(value).digest('hex');
type Challenge={orgId:string;recipient:string;origin:string;expires:number;nonce:string};
export function setupChallenge(orgId:string,recipient:string,origin:string,now=Date.now()){
 const claims:Challenge={orgId,recipient:normalizePhone(recipient),origin,expires:now+10*60000,nonce:randomBytes(12).toString('hex')};
 const payload=Buffer.from(JSON.stringify(claims)).toString('base64url');return payload+'.'+digest('whatsapp-setup:'+payload);
}
export function verifySetupChallenge(token:string,from:string,arns:string[],now=Date.now()):Challenge|null{
 try{
  if(token.length>1800)return null;const [payload,signature,...rest]=token.split('.');if(rest.length||!signature||!/^[a-f0-9]{64}$/.test(signature))return null;
  const expected=Buffer.from(digest('whatsapp-setup:'+payload),'hex');if(!timingSafeEqual(expected,Buffer.from(signature,'hex')))return null;
  const v=JSON.parse(Buffer.from(payload,'base64url').toString()) as Challenge;
  if(typeof v.orgId!=='string'||typeof v.origin!=='string'||typeof v.recipient!=='string'||typeof v.nonce!=='string'||!Number.isFinite(v.expires)||v.expires<now||v.expires>now+10*60000||v.recipient!==normalizePhone(from)||!senderMatches(v.origin,arns))return null;
  return v;
 }catch{return null}
}
export const setupFingerprint=(recipient:string,origin:string)=>digest('whatsapp-recipient:'+normalizePhone(recipient)+':'+origin);
export async function sendSetupTest(orgId:string,destination:string){
 if(process.env.GUARDSCALE_NOTIFICATION_MODE!=='aws')throw Error('Real AWS notification delivery is disabled. Update NotificationMode=aws through CloudFormation first.');
 if(!validPhone(destination))throw Error('Use your recipient number in international format, such as +15551234567.');
 const settings=await store.settings(orgId),origin=whatsappOrigination({originationId:settings.notifications.whatsappSenderId});
 if(!validSender(origin))throw Error('Configure a registered AWS phone-number ID first.');
 if(!settings.notifications.whatsappEnabled||!settings.notifications.recipients.split(/[\s,;]+/).some(v=>!v.includes('@')&&normalizePhone(v)===normalizePhone(destination)))throw Error('Enable WhatsApp and save this recipient in the active organization first.');
 // A durable per-org minute claim prevents repeat clicks/retries from generating paid messages.
 if(!await store.claimOnce(orgId,'WHATSAPP_SETUP_SEND#'+Math.floor(Date.now()/60000),1))throw Error('A setup test was already requested this minute. Wait before retrying.');
 const token=setupChallenge(orgId,destination,origin);
 const id=await notifier().send({channel:'whatsapp',destination,originationId:origin,subject:'GuardScale connection test',text:'GuardScale setup test. To verify the return path, reply with this entire line:\nVerify '+token+'\nThis verifies messaging only; it never blocks a server. Expires in 10 minutes.'});
 return notificationReceipt(id);
}
// Called only by the trusted SNS/SQS path, after worker topic validation and message-age validation.
export async function acceptSetupReply(token:string,from:string,arns:string[]){
 const claims=verifySetupChallenge(token,from,arns);if(!claims)return false;
 const settings=await store.settings(claims.orgId);let origin:string;try{origin=whatsappOrigination({originationId:settings.notifications.whatsappSenderId})}catch{return false}
 if(origin!==claims.origin||!settings.notifications.whatsappEnabled||!settings.notifications.recipients.split(/[\s,;]+/).some(v=>!v.includes('@')&&normalizePhone(v)===normalizePhone(from)))return false;
 // Stable key makes SQS retries idempotent without claiming success before a durable write.
 await store.putEvent({id:'whatsapp-setup-'+claims.nonce,tenantId:claims.orgId,serverId:setupNode,agentId:'system',at:new Date(claims.expires-10*60000).toISOString(),type:'whatsapp.setup.verified',metadata:{fingerprint:setupFingerprint(from,origin),verifiedAt:new Date().toISOString()}});
 return true;
}
