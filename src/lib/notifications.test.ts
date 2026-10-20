import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AWSNotifier,whatsappOrigination} from './notifications';
test('email delivery uses the verified From address supplied at launch',async()=>{
 const saved=process.env.GUARDSCALE_SES_FROM;
 try{
  process.env.GUARDSCALE_SES_FROM='alerts@example.com';
  const provider=new AWSNotifier();let calls=0;
  Object.assign(provider,{ses:{send:async(command:{input:{FromEmailAddress?:string;Destination?:{ToAddresses?:string[]}}})=>{
   calls++;assert.equal(command.input.FromEmailAddress,'alerts@example.com');
   assert.deepEqual(command.input.Destination?.ToAddresses,['operator@example.com']);return {MessageId:'mock-accepted'};
  }}});
  assert.equal(await provider.send({channel:'email',destination:'operator@example.com',subject:'Test',text:'Summary'}),'mock-accepted');
  delete process.env.GUARDSCALE_SES_FROM;
  await assert.rejects(provider.send({channel:'email',destination:'operator@example.com',subject:'Test',text:'Summary'}),/GUARDSCALE_SES_FROM is required/);
  assert.equal(calls,1,'unconfigured sender fails before contacting AWS');
 }finally{if(saved===undefined)delete process.env.GUARDSCALE_SES_FROM;else process.env.GUARDSCALE_SES_FROM=saved}
});
test('WhatsApp sends use only the launch sender, ignoring organization overrides',()=>{
 const saved=process.env.GUARDSCALE_WHATSAPP_ORIGINATION_ID;
 try{
  process.env.GUARDSCALE_WHATSAPP_ORIGINATION_ID='phone-number-id-deployment';
  assert.equal(whatsappOrigination({originationId:'phone-number-id-org'}),'phone-number-id-deployment');
  assert.equal(whatsappOrigination({originationId:''}),'phone-number-id-deployment','a blank organization field falls back to the deployment default');
  assert.equal(whatsappOrigination({}),'phone-number-id-deployment');
  delete process.env.GUARDSCALE_WHATSAPP_ORIGINATION_ID;
  assert.throws(()=>whatsappOrigination({}),/GUARDSCALE_WHATSAPP_ORIGINATION_ID is required/);
 }finally{if(saved===undefined)delete process.env.GUARDSCALE_WHATSAPP_ORIGINATION_ID;else process.env.GUARDSCALE_WHATSAPP_ORIGINATION_ID=saved}
});
test('a phone number in the sender ID field is rejected with a clear message',()=>{
 const saved=process.env.GUARDSCALE_WHATSAPP_ORIGINATION_ID;try{
 for(const value of ['+15550100000','+1 (555) 010-0000','15550100000']){process.env.GUARDSCALE_WHATSAPP_ORIGINATION_ID=value;assert.throws(()=>whatsappOrigination({}),/phone-number ID/);}
 process.env.GUARDSCALE_WHATSAPP_ORIGINATION_ID='arn:aws:social-messaging:us-east-1:111122223333:phone-number-id/abc';
 assert.equal(whatsappOrigination({originationId:'arn:aws:social-messaging:us-east-1:111122223333:phone-number-id/abc'}),'arn:aws:social-messaging:us-east-1:111122223333:phone-number-id/abc');
 }finally{if(saved===undefined)delete process.env.GUARDSCALE_WHATSAPP_ORIGINATION_ID;else process.env.GUARDSCALE_WHATSAPP_ORIGINATION_ID=saved}
});
