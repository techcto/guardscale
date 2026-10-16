import {SQSClient,ReceiveMessageCommand,DeleteMessageCommand,CreateQueueCommand} from '@aws-sdk/client-sqs';
import {notifier,type Notification} from '../lib/notifications';
import {store} from '../lib/store';
import {evaluateAutoGuardian} from '../lib/auto-guardian';
import {processIncident,processWhatsAppEnvelope,notifyProtectionOutcome} from '../lib/incident-workflow';
const queue=process.env.GUARDSCALE_QUEUE_URL;if(!queue)throw Error('GUARDSCALE_QUEUE_URL is required');
const sqs=new SQSClient({endpoint:process.env.GUARDSCALE_QUEUE_ENDPOINT});
async function receive(){
 try{return await sqs.send(new ReceiveMessageCommand({QueueUrl:queue,WaitTimeSeconds:20,MaxNumberOfMessages:10}));}
 catch(error){if(process.env.GUARDSCALE_LOCAL_QUEUE_AUTOCREATE==='true'&&error instanceof Error&&error.name==='QueueDoesNotExist'){await sqs.send(new CreateQueueCommand({QueueName:queue!.split('/').pop()!}));return{Messages:[]};}throw error;}
}
async function main(){
 const notifications=notifier();
 for(;;){
  try{await evaluateAutoGuardian();}catch{console.error(JSON.stringify({level:'error',message:'Auto Guardian evaluation deferred; no new action authorized'}));}
  let batch;try{batch=await receive();}catch{console.error(JSON.stringify({level:'error',message:'Queue unavailable; retrying'}));await new Promise(r=>setTimeout(r,5000));continue;}
  for(const message of batch.Messages??[]){
   try{
    const raw=message.Body?JSON.parse(message.Body):{};
    const work=(raw.Type==='Notification'&&typeof raw.Message==='string'?JSON.parse(raw.Message):raw) as {kind?:string;orgId?:string;incidentId?:string;commandId?:string;notification?:Notification&{orgId?:string};whatsAppWebhookEntry?:string};
    if(work.kind==='incident'&&work.orgId&&work.incidentId)await processIncident(work.orgId,work.incidentId);
    if(work.kind==='protection-outcome'&&work.orgId&&work.commandId)await notifyProtectionOutcome(work.orgId,work.commandId);
    if(work.whatsAppWebhookEntry){
     if(!process.env.GUARDSCALE_WHATSAPP_SNS_TOPIC_ARN||raw.TopicArn!==process.env.GUARDSCALE_WHATSAPP_SNS_TOPIC_ARN)throw Error('Untrusted topic');
     await processWhatsAppEnvelope(work);
    }
    if(work.kind==='notification'&&work.notification){
     const n=work.notification;if(!n.orgId)throw Error('Organization required');
     const settings=await store.settings(n.orgId);
     if(!settings.notifications.recipients.split(/[\s,;]+/).includes(n.destination))throw Error('Recipient not authorized');
     if(n.channel==='whatsapp'&&!n.originationId)n.originationId=settings.notifications.whatsappSenderId;
     await notifications.send(n);
    }
    if(message.ReceiptHandle)await sqs.send(new DeleteMessageCommand({QueueUrl:queue,ReceiptHandle:message.ReceiptHandle}));
    console.log(JSON.stringify({level:'info',message:'processed guardscale event',messageId:message.MessageId,kind:work.kind??'provider-event'}));
   }catch{
    // Leave messages for redrive; never log private evidence, tokens or provider bodies.
    console.error(JSON.stringify({level:'error',message:'GuardScale message failed; retained for retry',messageId:message.MessageId}));
   }
  }
 }
}
void main();
