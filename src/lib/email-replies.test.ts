import {test} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {store} from './store';import {emailReplyAddress,validatedEmailReply} from './email-replies';
import {processEmailEnvelope} from './incident-workflow';import {commandsFor} from './protection-commands';
test('email replies bind authenticated sender, signed reply address and explicit first-line action',async()=>{
 process.env.GUARDSCALE_SESSION_SECRET='unit-email-reply-secret';process.env.GUARDSCALE_EMAIL_REPLY_DOMAIN='replies.example.com';process.env.GUARDSCALE_EMAIL_REPLY_TOPIC_ARN='unit-topic';process.env.GUARDSCALE_NOTIFICATION_MODE='log';
 const recipient='operator@example.com',org=await store.createOrganization({name:'Email '+randomUUID(),ownerId:'root',orgType:'business'}),now=new Date().toISOString();
 await store.upsertNode({tenantId:org.id,serverId:'email-node',agentId:'agent',displayName:'Email node',tags:[],status:'healthy',createdAt:now,lastHeartbeat:now});
 await store.putIncident({tenantId:org.id,serverId:'email-node',agentId:'agent',incidentId:'email-incident',state:'review',startedAt:now,updatedAt:now,payload:{candidate_id:'e'.repeat(32),source_ip:'192.0.2.20'}});
 const s=await store.settings(org.id);await store.putSettings(org.id,{...s,notifications:{...s.notifications,emailEnabled:true,recipients:recipient},response:{...s.response,allowRemoteRequests:true,dryRun:false,defaultTtlSeconds:60}});
 const replyTo=emailReplyAddress(org.id,'email-incident',recipient)!;assert.ok(replyTo.split('@')[0].length<=64);assert.notEqual(replyTo,emailReplyAddress(org.id,'another',recipient));
 const envelope=(command='Protect',from=recipient,to=replyTo,id=randomUUID())=>({notificationType:'Received',receipt:{timestamp:new Date().toISOString(),recipients:[to],spamVerdict:{status:'PASS'},virusVerdict:{status:'PASS'},dmarcVerdict:{status:'PASS'}},mail:{messageId:id},content:Buffer.from(`From: Operator <${from}>\r\nTo: ${to}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${command}\r\n\r\nOn Tuesday GuardScale wrote:\r\n> Reply Protect or Dismiss`).toString('base64')});
 assert.equal((await validatedEmailReply(envelope()))?.action,'protect');
 assert.equal(await validatedEmailReply(envelope('Protect','attacker@example.net')),null);
 assert.equal(await validatedEmailReply(envelope('Protect',recipient,'reply+wrong@replies.example.com')),null);
 for(const verdict of ['dmarcVerdict','spamVerdict','virusVerdict'] as const){const e=envelope();e.receipt[verdict].status='FAIL';assert.equal(await validatedEmailReply(e),null);}
 assert.equal(await validatedEmailReply(envelope('Thanks\r\nProtect')),null,'never search later lines for commands');
 assert.equal(await validatedEmailReply(envelope('> Protect')),null,'quoted commands cannot authorize actions');
 const stale=envelope();stale.receipt.timestamp=new Date(Date.now()-16*60000).toISOString();assert.equal(await validatedEmailReply(stale),null);
 const approved=envelope();assert.equal(await processEmailEnvelope(approved),true);assert.equal(await processEmailEnvelope(approved),false,'same SES delivery is not processed twice');
 assert.equal((await commandsFor(org.id))[0].status,'queued');
 assert.equal(await processEmailEnvelope(envelope('Dismiss')),true);assert.equal((await commandsFor(org.id))[0].status,'cancel_requested');
 assert.equal((await store.incident(org.id,'email-incident'))?.state,'resolved');
 assert.ok((await store.eventsForNode(org.id,'email-node')).some(e=>e.type==='response.received'&&e.metadata?.channel==='email'));
});
