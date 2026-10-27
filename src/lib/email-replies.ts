import {createHmac} from 'node:crypto';
import PostalMime from 'postal-mime';
import {store} from './store';

export function emailReplyAddress(orgId:string,incidentId:string,recipient:string){
 const domain=process.env.GUARDSCALE_EMAIL_REPLY_DOMAIN?.toLowerCase();if(!domain||!process.env.GUARDSCALE_EMAIL_REPLY_TOPIC_ARN)return undefined;
 if(!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain))throw Error('Invalid email reply domain');
 const secret=process.env.GUARDSCALE_SESSION_SECRET;if(!secret)throw Error('Session signing is not configured');
 const token=createHmac('sha256',secret).update('email-reply:'+orgId+':'+incidentId+':'+recipient.trim().toLowerCase()).digest('hex').slice(0,32);
 return 'reply+'+token+'@'+domain;
}

// Called only after the SQS worker verifies the exact configured SES SNS topic.
// The envelope contains AWS-generated verdicts, not headers supplied by senders.
export async function validatedEmailReply(input:unknown){
 const e=input as {notificationType?:string;receipt?:{timestamp?:string;recipients?:string[];spamVerdict?:{status?:string};virusVerdict?:{status?:string};dmarcVerdict?:{status?:string}};mail?:{messageId?:string};content?:string};
 if(e.notificationType!=='Received'||!e.receipt||!e.mail?.messageId||typeof e.content!=='string'||e.content.length>210000)return null;
 if([e.receipt.spamVerdict,e.receipt.virusVerdict,e.receipt.dmarcVerdict].some(v=>v?.status!=='PASS'))return null;
 const at=Date.parse(e.receipt.timestamp??'');if(!Number.isFinite(at)||Math.abs(Date.now()-at)>15*60000)return null;
 const raw=Buffer.from(e.content,'base64');if(raw.length>150000)return null;
 const parsed=await PostalMime.parse(raw,{maxNestingDepth:10,maxHeadersSize:32768,maxPartCount:30,maxRfc822NestingDepth:0,maxForwardedAddresses:20});
 if(parsed.attachments.length)return null;
 if(parsed.headers.some(h=>h.key==='auto-submitted'&&h.value.trim().toLowerCase()!=='no'||h.key==='precedence'&&/bulk|list|junk/i.test(h.value)))return null;
 const sender=parsed.from?.address?.trim().toLowerCase();if(!sender)return null;
 // Only the first non-empty line can authorize an action. Never search quoted
 // messages or attachments for command words from the original alert.
 const line=parsed.text?.split(/\r?\n/).map(v=>v.trim()).find(Boolean)??'';
 if(!/^(Protect|Watch|Dismiss)$/i.test(line))return null;
 const recipients=(e.receipt.recipients??[]).map(v=>v.toLowerCase());
 for(const org of await store.organizations()){
  const settings=await store.settings(org.id);
  if(!settings.notifications.emailEnabled||!settings.notifications.recipients.split(/[\s,;]+/).some(v=>v.toLowerCase()===sender))continue;
  for(const incident of await store.incidents(org.id)){
   const age=Date.now()-Date.parse(incident.startedAt);if(!Number.isFinite(age)||age<0||age>15*60000)continue;
   const address=emailReplyAddress(org.id,incident.incidentId,sender);if(!address||!recipients.includes(address))continue;
   return {orgId:org.id,incident,sender,action:line.toLowerCase() as 'protect'|'watch'|'dismiss',messageId:e.mail.messageId,replyTo:address};
  }
 }
 return null;
}
