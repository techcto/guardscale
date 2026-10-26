import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const run=(...args)=>{
 const env={...process.env,AWS_PROFILE:'not-a-real-profile',STRIPE_SECRET_KEY:''};delete env.NODE_TEST_CONTEXT;
 return spawnSync(process.execPath,['devops/stripe/sync-from-secret.mjs',...args],{encoding:'utf8',env});
};
test('live and sandbox preview are offline and expose only the plan catalog',()=>{
 for(const mode of ['live','sandbox']){
  const result=run('--mode',mode);assert.equal(result.status,0,result.stderr);
  const out=JSON.parse(result.stdout);assert.equal(out.mode,mode);assert.match(out.action,/no AWS or Stripe calls/);
  assert.deepEqual(out.plans.map(p=>[p.cents,p.servers]),[[4900,5],[19900,50]]);
  assert.ok(!result.stdout.includes('secret_key'));
 }
});
test('mode and exact secret ARN are mandatory before any credential read',()=>{
 for(const args of [[],['--mode','production'],['--mode','live','--apply'],['--mode','live','--apply','--secret-arn','not-an-arn']])assert.notEqual(run(...args).status,0);
 const mismatch=run('--mode','live','--apply','--secret-arn','arn:aws:secretsmanager:us-west-2:111122223333:secret:test');
 assert.notEqual(mismatch.status,0);assert.match(mismatch.stderr,/region does not match/);
});
