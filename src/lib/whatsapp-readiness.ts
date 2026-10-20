import {SocialMessagingClient,ListLinkedWhatsAppBusinessAccountsCommand,GetLinkedWhatsAppBusinessAccountCommand,GetLinkedWhatsAppBusinessAccountPhoneNumberCommand,ListWhatsAppMessageTemplatesCommand} from '@aws-sdk/client-socialmessaging';
import {validSender} from './whatsapp-setup';

export type Sender={id:string;name:string;number:string};
export type Inspection={registered:boolean;routing:boolean;template:boolean;number:string;note:string};
export interface WhatsAppReader{senders():Promise<Sender[]>;inspect(id:string,topic:string,template:string,language:string):Promise<Inspection>}
export class AWSWhatsAppReader implements WhatsAppReader{
 private client=new SocialMessagingClient({maxAttempts:1});
 private signal=AbortSignal.timeout(20000);
 async senders(){
  const senders:Sender[]=[];let nextToken:string|undefined;
  for(let page=0;page<3;page++){
   const r=await this.client.send(new ListLinkedWhatsAppBusinessAccountsCommand({maxResults:10,nextToken}),{abortSignal:this.signal});
   for(const item of r.linkedAccounts??[]){if(!item.id)continue;const {account}=await this.client.send(new GetLinkedWhatsAppBusinessAccountCommand({id:item.id}),{abortSignal:this.signal});for(const p of account?.phoneNumbers??[])if(p.phoneNumberId)senders.push({id:p.phoneNumberId,name:p.displayPhoneNumberName??item.wabaName??'Business sender',number:p.phoneNumber??''})}
   nextToken=r.nextToken;if(!nextToken)break;
  }
  return senders.slice(0,100);
 }
 async inspect(id:string,topic:string,template:string,language:string):Promise<Inspection>{
  if(!validSender(id))throw Error('Enter an AWS phone-number-id or phone-number ARN, not a telephone number.');
  const phone=await this.client.send(new GetLinkedWhatsAppBusinessAccountPhoneNumberCommand({id}),{abortSignal:this.signal});
  if(!phone.linkedWhatsAppBusinessAccountId)throw Error('The sender has no linked WhatsApp Business Account.');
  const {account}=await this.client.send(new GetLinkedWhatsAppBusinessAccountCommand({id:phone.linkedWhatsAppBusinessAccountId}),{abortSignal:this.signal});
  let approved=false,nextToken:string|undefined;
  if(template)for(let page=0;page<5;page++){
   const r=await this.client.send(new ListWhatsAppMessageTemplatesCommand({id:phone.linkedWhatsAppBusinessAccountId,maxResults:100,nextToken}),{abortSignal:this.signal});
   approved=(r.templates??[]).some(t=>t.templateName===template&&t.templateLanguage===language&&t.templateStatus==='APPROVED');nextToken=r.nextToken;if(approved||!nextToken)break;
  }
  return {registered:account?.registrationStatus==='COMPLETE',routing:Boolean(topic&&account?.eventDestinations?.some(d=>d.eventDestinationArn===topic)),template:approved,number:phone.phoneNumber?.phoneNumber??'',note:'AWS account, event destination and template status checked. Template components, queue delivery, worker operation and firewall execution still require testing.'};
 }
}
export async function inspectSafely(reader:WhatsAppReader,id:string,topic:string,template:string,language:string){
 try{return {inspection:await reader.inspect(id,topic,template,language),error:null}}
 catch(e){const name=e instanceof Error?e.name:'';return {inspection:null,error:name.includes('AccessDenied')?'AWS read permission is missing. Deploy the updated CloudFormation IAM policy.':name.includes('Token')||name.includes('Credentials')?'AWS credentials are unavailable or expired. Refresh deployment credentials.':'Unable to verify with AWS. Check sender ID, AWS Region, credentials and permissions.'}}
}
