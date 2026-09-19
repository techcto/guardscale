import{SESv2Client,SendEmailCommand}from'@aws-sdk/client-sesv2';
import{SocialMessagingClient,SendWhatsAppMessageCommand}from'@aws-sdk/client-socialmessaging';

export type Notification={channel:'email'|'whatsapp';destination:string;subject:string;text:string;originationId?:string};
export interface Notifier{send(notification:Notification):Promise<string>}
export class LogNotifier implements Notifier{async send(n:Notification){console.log(JSON.stringify({level:'info',message:'mock notification',channel:n.channel,subject:n.subject}));return'mock-notification'}}
export class AWSNotifier implements Notifier{
  private ses=new SESv2Client({});private social=new SocialMessagingClient({});
  async send(n:Notification){if(n.channel==='email')return this.email(n);return this.whatsapp(n)}
  private async email(n:Notification){const from=required('GUARDIAN_SES_FROM');const result=await this.ses.send(new SendEmailCommand({FromEmailAddress:from,Destination:{ToAddresses:[n.destination]},Content:{Simple:{Subject:{Data:n.subject},Body:{Text:{Data:n.text}}}}}));return result.MessageId??'accepted'}
  private async whatsapp(n:Notification){const origin=n.originationId??required('GUARDIAN_WHATSAPP_ORIGINATION_ID');const payload={messaging_product:'whatsapp',to:n.destination,type:'text',text:{preview_url:false,body:n.text}};const result=await this.social.send(new SendWhatsAppMessageCommand({originationPhoneNumberId:origin,metaApiVersion:process.env.GUARDIAN_WHATSAPP_META_API_VERSION??'v20.0',message:Buffer.from(JSON.stringify(payload))}));return result.messageId??'accepted'}
}
export function notifier():Notifier{return process.env.GUARDIAN_NOTIFICATION_MODE==='aws'?new AWSNotifier():new LogNotifier()}
function required(name:string){const value=process.env[name];if(!value)throw new Error(`${name} is required`);return value}
