import {test} from 'node:test';
import assert from 'node:assert/strict';
import {incidentAlert} from './incident-alert';
import {whatsappDestination} from './notifications';
test('AWS destinations normalize WhatsApp inbound digits before replying',()=>{assert.equal(whatsappDestination('15550100001'),'+15550100001');assert.equal(whatsappDestination('+1 555-010-0001'),'+15550100001');assert.throws(()=>whatsappDestination('invalid'),/international/);});
const sample={server:'Test server',source:'192.0.2.20',detectedAt:'2026-10-27T12:00:00Z',analysisStatus:'complete',summary:'Suspicious request burst.',reviewUrl:'http://localhost:8185/incidents/test',code:'0123456789abcdef',blockSeconds:60};
test('WhatsApp alert presents exact scoped commands on separate lines and states limits',()=>{
 const text=incidentAlert(sample,'whatsapp');
 for(const action of ['Protect','Watch','Dismiss'])assert.ok(text.split('\n').includes(action+' '+sample.code));
 assert.match(text,/60 seconds/);assert.match(text,/15 minutes after detection/);assert.match(text,/Dismiss stops renewal/);
 assert.match(text,/confirmed only after/);assert.ok(!text.includes('Country:'));assert.ok(!text.includes('email replies'));
});
test('email directs users to authenticated review without implying reply approval',()=>{
 const text=incidentAlert({...sample,analysisStatus:'unavailable',country:'US'},'email');
 assert.match(text,/AI assessment: unavailable/);assert.match(text,/Country: US/);assert.match(text,/Direct email replies are not supported/);
 assert.ok(!text.includes('Protect '+sample.code));
});

test('proxied sources offer monitoring without origin firewall approval',()=>{
 const text=incidentAlert({...sample,protectionBlocked:true},'whatsapp');
 assert.ok(!text.includes('Reply Protect'));assert.ok(!text.includes('Protect '+sample.code));assert.match(text,/proxy or CDN/);assert.ok(text.includes('Watch '+sample.code));
});
