import{SESv2Client,SendEmailCommand}from'@aws-sdk/client-sesv2';
import{SocialMessagingClient,SendWhatsAppMessageCommand}from'@aws-sdk/client-socialmessaging';
import {messagingClientOptions} from './local-messaging-credentials';
import {localEmulation} from './local-emulation';
import {emailText,notificationEmail} from './incident-email';

export type Notification={channel:'email'|'whatsapp';destination:string;subject:string;text:string;originationId?:string;replyTo?:string;html?:string;reviewUrl?:string};
export interface Notifier{send(notification:Notification):Promise<string>}
export class LogNotifier implements Notifier{async send(n:Notification){console.log(JSON.stringify({level:'info',message:'local notification audit only; not delivered',channel:n.channel,subject:n.subject}));return'local-notification-not-delivered'}}
export class AWSNotifier implements Notifier{
  private ses=new SESv2Client(messagingClientOptions());private social=new SocialMessagingClient(messagingClientOptions());
  async send(n:Notification){if(n.channel==='email')return this.email(n);return this.whatsapp(n)}
  private async email(n:Notification){const selected=process.env.GUARDSCALE_LOCAL_EMAIL_RECIPIENT;if(selected&&(!localEmulation()||selected.toLowerCase()!==n.destination.toLowerCase()))throw Error('Local email testing is restricted to the selected test recipient');const from=required('GUARDSCALE_SES_FROM');const result=await this.ses.send(new SendEmailCommand({FromEmailAddress:from,...(n.replyTo?{ReplyToAddresses:[n.replyTo]}:{}),Destination:{ToAddresses:[n.destination]},Content:{Simple:{Subject:{Data:n.subject,Charset:'UTF-8'},Body:{Text:{Data:emailText(n.text),Charset:'UTF-8'},Html:{Data:n.html??notificationEmail(n.subject,n.text,n.reviewUrl),Charset:'UTF-8'}}}}}));return result.MessageId??'accepted'}
  private async whatsapp(n:Notification){const localRecipient=process.env.GUARDSCALE_LOCAL_WHATSAPP_RECIPIENT;if(localRecipient&&(!localEmulation()||localRecipient.replace(/\D/g,'')!==n.destination.replace(/\D/g,'')))throw Error('Local WhatsApp testing is restricted to the selected test recipient');const origin=whatsappOrigination(n);const template=process.env.GUARDSCALE_WHATSAPP_ALERT_TEMPLATE;const payload=template?{messaging_product:'whatsapp',to:whatsappDestination(n.destination),type:'template',template:{name:template,language:{code:process.env.GUARDSCALE_WHATSAPP_TEMPLATE_LANGUAGE??'en_US'},components:[{type:'body',parameters:[{type:'text',text:n.text.slice(0,1000)}]}]}}:{messaging_product:'whatsapp',to:whatsappDestination(n.destination),type:'text',text:{preview_url:false,body:n.text}};const result=await this.social.send(new SendWhatsAppMessageCommand({originationPhoneNumberId:origin,metaApiVersion:process.env.GUARDSCALE_WHATSAPP_META_API_VERSION??'v20.0',message:Buffer.from(JSON.stringify(payload))}));return result.messageId??'accepted'}
}
export function notifier():Notifier{return process.env.GUARDSCALE_NOTIFICATION_MODE==='aws'?new AWSNotifier():new LogNotifier()}
// EUM Social needs the registered phone-number ID or ARN, never the phone number itself.
export function whatsappOrigination(_n:Pick<Notification,'originationId'>){const origin=required('GUARDSCALE_WHATSAPP_ORIGINATION_ID');if(/^\+?[\d\s()-]+$/.test(origin))throw new Error('WhatsApp sender ID must be the AWS End User Messaging Social phone-number ID (phone-number-id-…), not a phone number');return origin}
function required(name:string){const value=process.env[name];if(!value)throw new Error(`${name} is required`);return value}

export function whatsappDestination(value:string){const digits=value.replace(/\D/g,'');if(!/^[1-9]\d{7,14}$/.test(digits))throw Error('A valid international WhatsApp recipient is required');return '+'+digits}
