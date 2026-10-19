import {test} from 'node:test';
import assert from 'node:assert/strict';
import {devFixturesEnabled,seedDevFixtures} from './dev-fixtures';
import {store} from './store';
import {usagePeriod} from './usage';
const keys=['NODE_ENV','GUARDSCALE_TABLE','GUARDSCALE_DYNAMODB_ENDPOINT','GUARDSCALE_DEPLOYMENT_MODE'];
function withEnv<T>(values:Record<string,string|undefined>,fn:()=>T):T{const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));const apply=(v:Record<string,string|undefined>)=>{for(const k of keys)if(v[k]===undefined)delete process.env[k];else Object.assign(process.env,{[k]:v[k]})};apply(values);try{return fn()}finally{apply(saved)}}
test('dev fixtures are enabled only for npm run dev or the local docker DynamoDB in SaaS mode, never AWS',()=>{
 const on=(v:Record<string,string|undefined>)=>withEnv({GUARDSCALE_DEPLOYMENT_MODE:'saas',...v},devFixturesEnabled);
 assert.equal(on({NODE_ENV:'development'}),true,'npm run dev with the in-memory store');
 assert.equal(on({NODE_ENV:'production',GUARDSCALE_TABLE:'guardscale-local',GUARDSCALE_DYNAMODB_ENDPOINT:'http://dynamodb:8000'}),true,'local docker stack');
 assert.equal(on({NODE_ENV:'production'}),false,'production build without a table');
 assert.equal(on({NODE_ENV:'development',GUARDSCALE_TABLE:'guardscale-prod'}),false,'AWS tables have no endpoint override');
 assert.equal(on({NODE_ENV:'production',GUARDSCALE_TABLE:'guardscale-prod',GUARDSCALE_DYNAMODB_ENDPOINT:'https://dynamodb.us-east-1.amazonaws.com'}),false,'remote endpoints are never seeded');
 assert.equal(withEnv({NODE_ENV:'development'},devFixturesEnabled),false,'private mode is never seeded');
 assert.equal(withEnv({GUARDSCALE_DEPLOYMENT_MODE:'on-premise',NODE_ENV:'production',GUARDSCALE_TABLE:'guardscale-local',GUARDSCALE_DYNAMODB_ENDPOINT:'http://dynamodb:8000'},devFixturesEnabled),false,'private local docker stack is never seeded');
});
test('dev fixtures seed organizations, users, servers, and usage once into the in-memory SaaS store',async()=>{
 const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try{
  Object.assign(process.env,{NODE_ENV:'development',GUARDSCALE_DEPLOYMENT_MODE:'saas'});delete process.env.GUARDSCALE_TABLE;delete process.env.GUARDSCALE_DYNAMODB_ENDPOINT;
  assert.equal(await seedDevFixtures(),true);
  assert.equal(await seedDevFixtures(),false,'seeding is idempotent per server');
  const acme=(await store.organizations()).find(o=>o.name==='Acme Retail');assert.ok(acme);
  assert.equal((await store.nodes(acme.id)).length,3);
  const totals=await store.usageTotals(acme.id,usagePeriod(null).start);assert.ok(totals.serverHours>0&&totals.logBytes>0,'fixture usage is recorded for the current period');
  const ava=await store.userByName('ava.patel');assert.ok(ava);assert.equal((await store.orgsForUser(ava.id)).length,2);
 }finally{for(const [k,v] of Object.entries(saved))if(v===undefined)delete process.env[k];else Object.assign(process.env,{[k]:v})}
});
