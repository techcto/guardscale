import {test} from 'node:test';
import assert from 'node:assert/strict';
import {incidentEmail,notificationEmail,emailText} from './incident-email';

const sample={server:'Local test server',source:'198.51.100.20',detectedAt:'2026-10-27T17:00:00Z',analysisStatus:'complete',summary:'Measured local request burst.',reviewUrl:'https://guardscale.org/incidents/example',code:'0123456789abcdef',blockSeconds:60};
test('signed email leads with explicit actions and compose shortcuts, not one-click approvals',()=>{
 const result=incidentEmail({...sample,replyTo:'reply+signed@example.test'});
 for(const action of ['Protect','Watch','Dismiss']){
  assert.ok(result.html.includes('body='+action));
  assert.ok(result.text.includes(action.toUpperCase()));
 }
 assert.ok(result.text.indexOf('PROTECT')<result.text.indexOf('Assessment'));
 assert.match(result.text,/60 seconds/);assert.match(result.text,/15 minutes after detection/);
 assert.match(result.html,/Shortcuts open an email draft/);assert.match(result.html,/press Send/);
 assert.ok(!result.html.includes('<img'),'no remote image or tracking dependency');
});
test('unsigned email offers authenticated review without advertising unsupported reply commands',()=>{
 const result=incidentEmail(sample);assert.ok(!result.html.includes('mailto:'));assert.match(result.text,/Direct email replies are not enabled/);
});
test('HTML escapes agent/model evidence and rejects unsafe review URLs',()=>{
 const result=incidentEmail({...sample,server:'<script>bad</script>',summary:'<img src=x onerror=bad>',reviewUrl:'javascript:bad()',replyTo:'reply+signed@example.test'});
 assert.ok(!result.html.includes('<script>'));assert.ok(!result.html.includes('<img'));assert.ok(!result.html.includes('href="javascript:'));assert.ok(result.html.includes('&lt;script&gt;'));
 assert.ok(!notificationEmail('<script>bad</script>','<svg onload=bad>','javascript:bad').includes('<script>'));
 assert.equal(emailText('*Protected*\n\nServer: local'),'Protected\n\nServer: local');
});
test('verification and password-reset links remain clickable in HTML emails',()=>{
 const html=notificationEmail('Verify email','Confirm this email: https://guardscale.org/login/verify-email?token=signed.test&purpose=verify');
 assert.ok(html.includes('href="https://guardscale.org/login/verify-email?token=signed.test&amp;purpose=verify"'));
 assert.ok(!notificationEmail('Test','<img onerror=bad> javascript:bad').includes('<img'));
});
