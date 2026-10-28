import {test} from 'node:test';import assert from 'node:assert/strict';
import {requestSamples} from './request-samples';
import {incidentAlert} from './incident-alert';import {incidentEmail} from './incident-email';
test('request examples reject invalid data, mask secrets, and reach both notification formats',()=>{
 const input=[{method:'GET',path:'/.env?token=private-query',status:404,count:12},{method:'POST',path:'/reset-password/private-path',status:403,count:2},{method:'GET',path:'https://external.test/',status:200,count:1},{method:'GET',path:'//external.test/',status:200,count:1},{method:'GET',path:'/bad',status:999,count:1}];
 const samples=requestSamples(input);assert.equal(samples.length,2);assert.equal(samples[0].path,'/.env');assert.equal(samples[1].path,'/reset-password/[redacted]');
 const alert={server:'Test',detectedAt:new Date().toISOString(),analysisStatus:'unavailable',summary:'The server agent did not return its inspection within 45 seconds.',reviewUrl:'https://guardscale.example/incidents/test',code:'0123456789abcdef',blockSeconds:60,requestSamples:samples};
 const text=incidentAlert(alert,'whatsapp'),email=incidentEmail(alert);
 for(const content of [text,email.text,email.html]){assert.match(content,/\.env/);assert.match(content,/404/);assert.match(content,/12 requests/);assert.match(content,/45 seconds/);assert.ok(!content.includes('private-query'));assert.ok(!content.includes('private-path'));}
 const escaped=incidentEmail({...alert,requestSamples:[{method:'GET',path:'/<script>alert(1)</script>',status:404,count:1}]});assert.ok(!escaped.html.includes('<script>'));assert.match(escaped.html,/&lt;script&gt;/);
 assert.equal(requestSamples(new Array(20).fill(input[0])).length,5);
});
