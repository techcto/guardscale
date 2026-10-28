import {test} from 'node:test';import assert from 'node:assert/strict';import {joinRecipients,splitRecipients} from './notification-recipients';
test('separate channel editors preserve existing recipients across saves',()=>{
 const existing='+15550100001,ops@example.com;second@example.com +15550100002';
 const split=splitRecipients(existing);assert.equal(split.whatsapp,'+15550100001\n+15550100002');assert.equal(split.email,'ops@example.com\nsecond@example.com');
 assert.deepEqual(new Set(joinRecipients(split.whatsapp,split.email).split(',')),new Set(existing.split(/[\s,;]+/)));
 assert.equal(joinRecipients(split.whatsapp,split.email+'\nOPS@EXAMPLE.COM'),'+15550100001,+15550100002,ops@example.com,second@example.com');
 assert.equal(joinRecipients('',split.email),'ops@example.com,second@example.com');
 assert.throws(()=>joinRecipients('ops@example.com',''),/WhatsApp/);assert.throws(()=>joinRecipients('','+15550100001'),/Email/);
 assert.throws(()=>joinRecipients('+1 5550100001',''),/international/);
});
