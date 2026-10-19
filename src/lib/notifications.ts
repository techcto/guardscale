import{SESv2Client,SendEmailCommand}from'@aws-sdk/client-sesv2';
import{SocialMessagingClient,SendWhatsAppMessageCommand}from'@aws-sdk/client-socialmessaging';

export type Notification={channel:'email'|'whatsapp';destination:string;subject:string;text:string;originationId?:string};
export interface Notifier{send(notification:Notification):Promise<string>}
export class LogNotifier implements Notifier{async send(n:Notification){console.log(JSON.stringify({level:'info',message:'local notification audit only; not delivered',channel:n.channel,subject:n.subject}));return'local-notification-not-delivered'}}
export class AWSNotifier implements Notifier{
  private ses=new SESv2Client({});private social=new SocialMessagingClient({});
  async send(n:Notification){if(n.channel==='email')return this.email(n);return this.whatsapp(n)}
  private async email(n:Notification){const from=required('GUARDSCALE_SES_FROM');const result=await this.ses.send(new SendEmailCommand({FromEmailAddress:from,Destination:{ToAddresses:[n.destination]},Content:{Simple:{Subject:{Data:n.subject},Body:{Text:{Data:n.text}}}}}));return result.MessageId??'accepted'}
  private async whatsapp(n:Notification){const origin=whatsappOrigination(n);const template=process.env.GUARDSCALE_WHATSAPP_ALERT_TEMPLATE;const payload=template?{messaging_product:'whatsapp',to:n.destination,type:'template',template:{name:template,language:{code:process.env.GUARDSCALE_WHATSAPP_TEMPLATE_LANGUAGE??'en_US'},components:[{type:'body',parameters:[{type:'text',text:n.text.slice(0,1000)}]}]}}:{messaging_product:'whatsapp',to:n.destination,type:'text',text:{preview_url:false,body:n.text}};const result=await this.social.send(new SendWhatsAppMessageCommand({originationPhoneNumberId:origin,metaApiVersion:process.env.GUARDSCALE_WHATSAPP_META_API_VERSION??'v20.0',message:Buffer.from(JSON.stringify(payload))}));return result.messageId??'accepted'}
}
export function notifier():Notifier{return process.env.GUARDSCALE_NOTIFICATION_MODE==='aws'?new AWSNotifier():new LogNotifier()}
// EUM Social needs the registered phone-number ID or ARN, never the phone number itself.
export function whatsappOrigination(n:Pick<Notification,'originationId'>){const origin=n.originationId||required('GUARDSCALE_WHATSAPP_ORIGINATION_ID');if(/^\+?[\d\s()-]+$/.test(origin))throw new Error('WhatsApp sender ID must be the AWS End User Messaging Social phone-number ID (phone-number-id-…), not a phone number');return origin}
function required(name:string){const value=process.env[name];if(!value)throw new Error(`${name} is required`);return value}
