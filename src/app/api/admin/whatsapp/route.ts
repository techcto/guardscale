import {NextRequest,NextResponse} from 'next/server';
import {operator} from '@/lib/operator';
import {requestOrigin} from '@/lib/session';
import {store} from '@/lib/store';
import {AWSWhatsAppReader,inspectSafely} from '@/lib/whatsapp-readiness';
import {sendSetupTest,setupFingerprint,setupNode,validPhone} from '@/lib/whatsapp-setup';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(req:NextRequest){
 const session=await operator(req);if(session?.role!=='root')return json({error:'Root administrator required'},403);
 const settings=await store.settings(session.orgId),e=process.env,region=e.AWS_REGION??'us-east-1';
 const origin=e.GUARDSCALE_WHATSAPP_ORIGINATION_ID||'';
 const recipients=settings.notifications.recipients.split(/[\s,;]+/).filter(validPhone);
 const proofs=await store.eventsForNode(session.orgId,setupNode,20);
 const verified=proofs.filter(p=>p.type==='whatsapp.setup.verified'&&recipients.some(r=>p.metadata?.fingerprint===setupFingerprint(r,origin))).map(p=>p.metadata?.verifiedAt??p.at)[0]??null;
 const base={region,saas:e.GUARDSCALE_DEPLOYMENT_MODE==='saas',orgId:session.orgId,orgName:(await store.organizationById(session.orgId))?.name??'Active organization',origin,defaultSender:e.GUARDSCALE_WHATSAPP_ORIGINATION_ID??'',recipients,mode:e.GUARDSCALE_NOTIFICATION_MODE==='aws'?'aws':'log',topic:e.GUARDSCALE_WHATSAPP_SNS_TOPIC_ARN??'',template:e.GUARDSCALE_WHATSAPP_ALERT_TEMPLATE??'',language:e.GUARDSCALE_WHATSAPP_TEMPLATE_LANGUAGE??'en_US',verifiedAt:verified,consoleUrl:`https://${region}.console.aws.amazon.com/social-messaging/home?region=${encodeURIComponent(region)}`};
 if(req.nextUrl.searchParams.get('discover')==='true'){
  try{return json({...base,senders:await new AWSWhatsAppReader().senders()})}catch{return json({...base,error:'Could not discover AWS senders. Check AWS credentials, Region and CloudFormation read permissions.'})}
 }
 if(req.nextUrl.searchParams.get('verify')==='true')return json({...base,...await inspectSafely(new AWSWhatsAppReader(),origin,base.topic,base.template,base.language)});
 return json(base);
}
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==requestOrigin(req))return json({error:'Same-origin request required'},403);
 const session=await operator(req);if(session?.role!=='root')return json({error:'Root administrator required'},403);
 try{
  const body=await req.json();
  if(body.action==='test')return json(await sendSetupTest(session.orgId,typeof body.recipient==='string'?body.recipient:''));
  return json({error:'Sender configuration is launch-only. Update the CloudFormation stack; manage recipients in organization notification settings.'},400);
 }catch(e){return json({error:e instanceof Error?e.message:'WhatsApp setup failed'},400)}
}
