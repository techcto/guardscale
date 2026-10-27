import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DynamoDBClient,DeleteTableCommand} from '@aws-sdk/client-dynamodb';
import {store} from './store';
import {uptimeStore} from './uptime-store';
import {isLocalDynamoEndpoint} from './dynamo-store';
import type {UptimeMonitor} from './uptime-model';

test('local DynamoDB persists checks and enforces distributed lease/edit isolation',{skip:process.env.GUARDSCALE_RUN_DYNAMO_TESTS!=='true'},async()=>{
 const table=process.env.GUARDSCALE_TABLE;
 if(!table?.startsWith('guardscale-uptime-test-')||!isLocalDynamoEndpoint())throw Error('A dedicated local test table is required');
 const org=await store.createOrganization({name:'Local DynamoDB uptime regression',ownerId:'local-test',orgType:'business'});
 const at=new Date().toISOString();
 const m:UptimeMonitor={id:'owned-check',orgId:org.id,name:'HTTPS health',url:'https://example.com/',intervalSeconds:60,recipientIds:[],whatsapp:false,tags:[],paused:false,revision:0,createdAt:at,updatedAt:at,nextCheckAt:at,state:'unknown',failures:0,successes:0,samples:[],notices:[],outages:[]};
 try{
  assert.ok(await uptimeStore.save(m));const stored=(await uptimeStore.get(org.id,m.id))!;assert.equal(stored.revision,1);
  assert.equal(await uptimeStore.get('another-workspace',m.id),null);
  assert.equal((await uptimeStore.list(org.id)).length,1);
  const claims=await Promise.all([uptimeStore.claim(stored,'worker-a',Date.now()),uptimeStore.claim(stored,'worker-b',Date.now())]);assert.equal(claims.filter(Boolean).length,1);
  assert.ok(await uptimeStore.save({...stored,paused:true},stored.revision));
  assert.equal(await uptimeStore.save({...stored,state:'down'},stored.revision,'worker-a'),false);
  assert.equal((await uptimeStore.get(org.id,m.id))!.paused,true);
  await uptimeStore.remove(org.id,m.id);assert.equal((await uptimeStore.list(org.id)).length,0);
 }finally{await new DynamoDBClient({endpoint:process.env.GUARDSCALE_DYNAMODB_ENDPOINT}).send(new DeleteTableCommand({TableName:table}));}
});
