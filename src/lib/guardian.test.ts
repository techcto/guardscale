import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessWithGuardian} from './guardian';
test('Guardian tool loop evaluates inspection before recommending and cannot self-authorize',async()=>{
 process.env.GUARDSCALE_AI_MODEL_ID='test-model';let calls=0;
 try{
  const result=await assessWithGuardian('org','incident',[],{inspect:async()=>({php_error:'unavailable',recent_requests:'60'}),send:async command=>{
   calls++;if(calls===2)assert.ok(JSON.stringify(command.input.messages).includes('php_error'));
   const name=calls===1?'inspect_server':'request_human_approval';
   const input:Record<string,string>=calls===1?{}:{summary:'Review application log collection.',recommendation:'watch'};
   return {output:{message:{role:'assistant',content:[{toolUse:{toolUseId:'unit-'+calls,name,input}}]}}};
  }});
  assert.equal(calls,2);assert.equal(result.recommendation,'watch');assert.equal(result.trace?.[0].tool,'inspect_server');
  const invalid=await assessWithGuardian('org','incident',[],{send:async()=>({output:{message:{role:'assistant',content:[{toolUse:{toolUseId:'bad',name:'protect',input:{}}}]}}})});
  assert.equal(invalid.status,'unavailable');
 }finally{delete process.env.GUARDSCALE_AI_MODEL_ID;}
});
test('missing Guardian model is explicit and does not manufacture AI output',async()=>{
 const original=process.env.GUARDSCALE_AI_MODEL_ID;delete process.env.GUARDSCALE_AI_MODEL_ID;
 try{assert.deepEqual(await assessWithGuardian('org','incident',[]),{status:'not_configured'});}finally{if(original)process.env.GUARDSCALE_AI_MODEL_ID=original;}
});

test('Guardian reports a specific inspection timeout separately from model failures without exposing errors',async()=>{
 const model=process.env.GUARDSCALE_AI_MODEL_ID;process.env.GUARDSCALE_AI_MODEL_ID='test-model';
 const send=async()=>({output:{message:{role:'assistant' as const,content:[{toolUse:{toolUseId:'inspect',name:'inspect_server',input:{}}}]}}});
 try{
  const result=await assessWithGuardian('timeout-test','incident',[],{send,inspect:async()=>{throw Error('Agent inspection timed out')}});
  assert.equal(result.trace?.[0].reason,'agent_inspection_timeout');assert.match(result.summary!,/45 seconds/);assert.equal(result.recommendation,undefined);
  const failed=await assessWithGuardian('model-test','incident',[],{send:async()=>{throw Error('private provider details')}});
  assert.equal(failed.trace?.[0].tool,'bedrock_converse');assert.equal(failed.trace?.[0].reason,'model_request_failed');assert.ok(!JSON.stringify(failed).includes('private provider details'));
 }finally{if(model===undefined)delete process.env.GUARDSCALE_AI_MODEL_ID;else process.env.GUARDSCALE_AI_MODEL_ID=model;}
});
