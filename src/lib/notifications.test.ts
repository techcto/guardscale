import {test} from 'node:test';
import assert from 'node:assert/strict';
import {whatsappOrigination} from './notifications';
test('WhatsApp sends use the organization sender ID, then the deployment phone-number ID',()=>{
 const saved=process.env.GUARDSCALE_WHATSAPP_ORIGINATION_ID;
 try{
  process.env.GUARDSCALE_WHATSAPP_ORIGINATION_ID='phone-number-id-deployment';
  assert.equal(whatsappOrigination({originationId:'phone-number-id-org'}),'phone-number-id-org');
  assert.equal(whatsappOrigination({originationId:''}),'phone-number-id-deployment','a blank organization field falls back to the deployment default');
  assert.equal(whatsappOrigination({}),'phone-number-id-deployment');
  delete process.env.GUARDSCALE_WHATSAPP_ORIGINATION_ID;
  assert.throws(()=>whatsappOrigination({}),/GUARDSCALE_WHATSAPP_ORIGINATION_ID is required/);
 }finally{if(saved===undefined)delete process.env.GUARDSCALE_WHATSAPP_ORIGINATION_ID;else process.env.GUARDSCALE_WHATSAPP_ORIGINATION_ID=saved}
});
test('a phone number in the sender ID field is rejected with a clear message',()=>{
 for(const value of ['+15550100000','+1 (555) 010-0000','15550100000'])assert.throws(()=>whatsappOrigination({originationId:value}),/phone-number ID/);
 assert.equal(whatsappOrigination({originationId:'arn:aws:social-messaging:us-east-1:111122223333:phone-number-id/abc'}),'arn:aws:social-messaging:us-east-1:111122223333:phone-number-id/abc');
});
