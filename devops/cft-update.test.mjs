import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=dirname(dirname(fileURLToPath(import.meta.url))),project=basename(root)==='gaurdscale'?'guardscale':basename(root);
const fake=`#!/usr/bin/env node
const fs=require('fs'),path=require('path'),args=process.argv.slice(2),dir=process.env.CFT_TEST_DIR,project=process.env.CFT_TEST_PROJECT,scenario=process.env.CFT_TEST_SCENARIO;
const op=args.find(v=>['describe-stacks','get-template-summary','create-change-set','describe-change-set','delete-change-set','execute-change-set','wait'].includes(v));
fs.appendFileSync(path.join(dir,'calls'),JSON.stringify(args)+'\\n');
const arn='arn:aws:cloudformation:us-east-1:111122223333:stack/'+project+'/unit',changeArn='arn:aws:cloudformation:us-east-1:111122223333:changeSet/'+project+'-release-unit/unit';
const params=scenario==='images'?[{ParameterKey:'WebImage',ParameterValue:'111122223333.dkr.ecr.us-east-1.amazonaws.com/'+project+'-web:0.1.0'},{ParameterKey:'WorkerImage',ParameterValue:'111122223333.dkr.ecr.us-east-1.amazonaws.com/'+project+'-worker@sha256:abc'}]:[{ParameterKey:'ImageBase',ParameterValue:'111122223333.dkr.ecr.us-east-1.amazonaws.com/'+(scenario==='wrong-project'?'unrelated':project)},{ParameterKey:'ReleaseVersion',ParameterValue:'0.1.0'}];
params.push({ParameterKey:'SessionSecret',ParameterValue:'do-not-print-this-fixture-secret'});
let body={};
if(op==='describe-stacks')body={Stacks:[{StackName:project,StackId:arn,StackStatus:scenario==='busy'?'UPDATE_IN_PROGRESS':'UPDATE_COMPLETE',Capabilities:['CAPABILITY_NAMED_IAM'],Parameters:params}]};
if(op==='get-template-summary')body={Parameters:params.map(p=>({ParameterKey:p.ParameterKey})),DeclaredTransforms:scenario==='transform'?['AWS::LanguageExtensions']:[]};
if(op==='create-change-set'){const filename=args[args.indexOf('--cli-input-json')+1].slice(7);fs.writeFileSync(path.join(dir,'plan'),fs.readFileSync(filename));body={Id:changeArn};}
if(op==='describe-change-set'){
const plan=JSON.parse(fs.readFileSync(path.join(dir,'plan'),'utf8'));
body={StackId:scenario==='wrong-stack'?arn+'-other':arn,Status:scenario==='empty'?'FAILED':'CREATE_COMPLETE',ExecutionStatus:'AVAILABLE',StatusReason:scenario==='empty'?"The submitted information didn't contain changes.":'',Parameters:plan.Parameters.map(p=>({ParameterKey:p.ParameterKey,ParameterValue:p.ParameterValue??params.find(v=>v.ParameterKey===p.ParameterKey)?.ParameterValue})),Changes:[{ResourceChange:{Action:'Modify',LogicalResourceId:'WebTask',ResourceType:'AWS::ECS::TaskDefinition',Replacement:'True',Scope:['Properties']}}]};
}
if(op==='wait'&&args.includes('stack-update-complete')&&scenario==='wait-failed')process.exit(255);
console.log(JSON.stringify(body));
`;
function fixture(scenario='normal'){
 const dir=mkdtempSync(join(tmpdir(),'cft-cli-test-'));writeFileSync(join(dir,'aws'),fake,{mode:0o700});
 const env={...process.env,PATH:dir+':'+process.env.PATH,CFT_TEST_DIR:dir,CFT_TEST_PROJECT:project,CFT_TEST_SCENARIO:scenario};
 return{dir,scenario:value=>{env.CFT_TEST_SCENARIO=value},run:(extra=[],version='v0.2.6')=>spawnSync('bash',[join(root,'cmd.sh'),'cft-update',version,'--stack',project,...extra],{encoding:'utf8',env}),calls:()=>existsSync(join(dir,'calls'))?readFileSync(join(dir,'calls'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[],plan:()=>JSON.parse(readFileSync(join(dir,'plan'),'utf8')),close:()=>rmSync(dir,{recursive:true})};
}
test('plan preserves secrets, targets UPDATE only, and never executes',()=>{
 const f=fixture();try{const r=f.run(['--plan','--profile','test-profile']);assert.equal(r.status,0,r.stderr);const p=f.plan();assert.equal(p.ChangeSetType,'UPDATE');assert.equal(p.UsePreviousTemplate,true);assert.equal(p.IncludeNestedStacks,true);assert.deepEqual(p.Parameters.find(p=>p.ParameterKey==='SessionSecret'),{ParameterKey:'SessionSecret',UsePreviousValue:true});assert.equal(p.Parameters.find(p=>p.ParameterKey==='ReleaseVersion').ParameterValue,'0.2.6');assert.ok(!JSON.stringify(p).includes('do-not-print'));assert.ok(!r.stdout.includes('do-not-print'));assert.ok(r.stdout.includes('REVIEW REQUIRED'));assert.ok(!f.calls().some(a=>a.includes('execute-change-set')));assert.ok(f.calls().every(a=>a.includes('test-profile')&&a.includes('cloudformation')))}finally{f.close()}
});
test('exact reviewed ARN executes and waits without recreating the change set',()=>{
 const f=fixture();try{assert.equal(f.run(['--plan']).status,0);const arn='arn:aws:cloudformation:us-east-1:111122223333:changeSet/'+project+'-release-unit/unit';const r=f.run(['--approve',arn]);assert.equal(r.status,0,r.stderr);assert.ok(r.stdout.includes('update complete'));assert.equal(f.calls().filter(a=>a.includes('create-change-set')).length,1);assert.equal(f.calls().filter(a=>a.includes('execute-change-set')).length,1);assert.ok(f.calls().some(a=>a.includes('stack-update-complete')))}finally{f.close()}
});
test('explicit image parameters retain repositories while replacing tags/digests',()=>{
 const f=fixture('images');try{assert.equal(f.run(['--plan']).status,0);assert.ok(f.plan().Parameters.filter(p=>p.ParameterKey.endsWith('Image')).every(p=>p.ParameterValue.endsWith(':0.2.6')&&!p.ParameterValue.includes('@')))}finally{f.close()}
});
for(const scenario of ['busy','wrong-project','transform'])test(scenario+' fails before creating an update',()=>{
 const f=fixture(scenario);try{assert.equal(f.run(['--plan']).status,1);assert.ok(!f.calls().some(a=>a.includes('create-change-set')))}finally{f.close()}
});
test('noninteractive default refuses execution without exact prior approval',()=>{
 const f=fixture();try{assert.equal(f.run().status,2);assert.ok(!f.calls().some(a=>a.includes('execute-change-set')))}finally{f.close()}
});
test('empty change set is a no-op and cleans up only its own empty plan',()=>{
 const f=fixture('empty');try{assert.equal(f.run(['--plan']).status,0);assert.ok(f.calls().some(a=>a.includes('delete-change-set')));assert.ok(!f.calls().some(a=>a.includes('execute-change-set')||a.includes('delete-stack')))}finally{f.close()}
});
test('reviewed plan from another stack is rejected',()=>{
 const f=fixture();try{assert.equal(f.run(['--plan']).status,0);f.scenario('wrong-stack');assert.equal(f.run(['--approve','arn:aws:cloudformation:us-east-1:111122223333:changeSet/'+project+'-release-unit/unit']).status,1);assert.ok(!f.calls().some(a=>a.includes('execute-change-set')))}finally{f.close()}
});
test('reviewed plan for a different release is rejected',()=>{
 const f=fixture();try{assert.equal(f.run(['--plan']).status,0);assert.equal(f.run(['--approve','arn:aws:cloudformation:us-east-1:111122223333:changeSet/'+project+'-release-unit/unit'],'0.2.7').status,1);assert.ok(!f.calls().some(a=>a.includes('execute-change-set')))}finally{f.close()}
});
test('invalid versions and approval names fail before any AWS call',()=>{
 const f=fixture();try{assert.equal(f.run(['--plan'],'latest').status,1);assert.equal(f.run(['--approve','not-an-arn']).status,1);assert.equal(f.calls().length,0)}finally{f.close()}
});
test('failed update waiter reports failure without destructive recovery',()=>{
 const f=fixture('wait-failed');try{assert.equal(f.run(['--plan']).status,0);const r=f.run(['--approve','arn:aws:cloudformation:us-east-1:111122223333:changeSet/'+project+'-release-unit/unit']);assert.equal(r.status,1);assert.ok(!r.stdout.includes('CloudFormation update complete'));assert.ok(!f.calls().some(a=>a.includes('delete-stack')||a.includes('update-service')))}finally{f.close()}
});
test('optional template file is passed explicitly rather than using previous template',()=>{
 const f=fixture();try{const path=join(f.dir,'template.json');writeFileSync(path,'{}');assert.equal(f.run(['--plan','--template',path]).status,0);assert.ok(!f.plan().UsePreviousTemplate);assert.ok(f.calls().find(a=>a.includes('create-change-set')).includes('--template-body'))}finally{f.close()}
});
