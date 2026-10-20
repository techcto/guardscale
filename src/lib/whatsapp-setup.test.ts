import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {acceptSetupReply,notificationReceipt,sendSetupTest,senderMatches,setupChallenge,setupFingerprint,setupNode,validPhone,validSender,verifySetupChallenge} from './whatsapp-setup';
import {inspectSafely,type WhatsAppReader} from './whatsapp-readiness';
import {processWhatsAppEnvelope} from './incident-workflow';
import {store} from './store';
import {commandsFor} from './protection-commands';

process.env.GUARDSCALE_SESSION_SECRET='test-only-whatsapp-signing-secret';
test('AWS prefixed sender IDs match canonical event ARNs; explicit ARNs stay exact',()=>{
 const arn='arn:aws:social-messaging:us-east-1:111122223333:phone-number-id/abc123';
 assert.equal(senderMatches('phone-number-id-abc123',[arn]),true);
 assert.equal(senderMatches('phone-number-id-wrong',[arn]),false);
 assert.equal(senderMatches(arn,[arn.replace('111122223333','999900001111')]),false);
 assert.equal(senderMatches('phone-number-id-abc123',['untrusted/abc123']),false);
});
const origin='phone-number-id-test',recipient='+15550100001',arns=['arn:aws:social-messaging:us-east-1:111122223333:phone-number-id/'+origin];
test('sender and recipient inputs are distinct; log audit never claims delivery',()=>{
 assert.ok(validSender(origin));assert.ok(validSender(arns[0]));assert.equal(validSender(recipient),false);assert.ok(validPhone(recipient));assert.equal(validPhone('5551234'),false);
 assert.equal(notificationReceipt('local-notification-not-delivered').status,'local_only');assert.equal(notificationReceipt('aws-message-id').status,'provider_accepted');
 assert.match(notificationReceipt('aws-message-id').message,/not yet confirmed/);
});
test('setup signatures bind organization, recipient, origin and a ten-minute expiry',()=>{
 const now=Date.now(),token=setupChallenge('org',recipient,origin,now);
 assert.equal(verifySetupChallenge(token,recipient,arns,now)?.orgId,'org');
 assert.equal(verifySetupChallenge(token,'+15550100002',arns,now),null);
 assert.equal(verifySetupChallenge(token,recipient,['wrong-sender'],now),null);
 assert.equal(verifySetupChallenge(token+'a',recipient,arns,now),null);
 assert.equal(verifySetupChallenge(token,recipient,arns,now+600001),null);
 assert.equal(verifySetupChallenge('malformed',recipient,arns,now),null);
});
test('trusted setup reply persists evidence once, rechecks recipients and never issues protection',async()=>{
 const org=await store.createOrganization({name:'WhatsApp setup '+randomUUID(),ownerId:'root',orgType:'business'});
 const settings=await store.settings(org.id);
 await store.putSettings(org.id,{...settings,notifications:{...settings.notifications,whatsappEnabled:true,whatsappSenderId:origin,recipients:recipient}});
 process.env.GUARDSCALE_WHATSAPP_ORIGINATION_ID=origin;
 const token=setupChallenge(org.id,recipient,origin);
 const envelope=(timestamp=String(Math.floor(Date.now()/1000)))=>({context:{MetaPhoneNumberIds:arns.map(arn=>({arn}))},whatsAppWebhookEntry:JSON.stringify({changes:[{value:{messages:[{id:'setup-unit',from:recipient,timestamp,type:'text',text:{body:'Verify '+token}}]}}]})});
 await processWhatsAppEnvelope(envelope('0'));assert.equal((await store.eventsForNode(org.id,setupNode)).length,0,'stale inbound messages rejected');
 await processWhatsAppEnvelope(envelope());await processWhatsAppEnvelope(envelope());
 const rows=await store.eventsForNode(org.id,setupNode);assert.equal(rows.length,1);assert.equal(rows[0].metadata?.fingerprint,setupFingerprint(recipient,origin));assert.equal((await commandsFor(org.id)).length,0);
 await store.putSettings(org.id,{...settings,notifications:{...settings.notifications,whatsappEnabled:true,whatsappSenderId:origin,recipients:''}});
 assert.equal(await acceptSetupReply(token,recipient,arns),false,'removed recipients cannot verify');
 await store.purgeCollectedData(org.id);assert.equal((await store.eventsForNode(org.id,setupNode)).length,0,'privacy purge clears setup proof too');
});
test('setup tests fail closed in log mode and for unconfigured recipients',async()=>{
 const saved=process.env.GUARDSCALE_NOTIFICATION_MODE;
 try{
  process.env.GUARDSCALE_NOTIFICATION_MODE='log';await assert.rejects(sendSetupTest('not-an-org',recipient),/disabled/);
  process.env.GUARDSCALE_NOTIFICATION_MODE='aws';await assert.rejects(sendSetupTest('not-an-org','555'),/international/);
 }finally{if(saved===undefined)delete process.env.GUARDSCALE_NOTIFICATION_MODE;else process.env.GUARDSCALE_NOTIFICATION_MODE=saved}
});
test('AWS inspection errors never report a ready connection or expose provider details',async()=>{
 const denied:WhatsAppReader={senders:async()=>[],inspect:async()=>{throw Object.assign(Error('private-provider-detail'),{name:'AccessDeniedException'})}};
 const result=await inspectSafely(denied,origin,'topic','template','en_US');assert.equal(result.inspection,null);assert.match(result.error!,/CloudFormation/);assert.ok(!result.error!.includes('private-provider-detail'));
});
