import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {messagingClientOptions} from './local-messaging-credentials';

test('messaging sessions require the emulator boundary and reject expired credentials',async()=>{
 const saved={...process.env},dir=await mkdtemp(join(tmpdir(),'guardscale-credential-test-'));
 try{
  delete process.env.GUARDSCALE_MESSAGING_CREDENTIALS_FILE;
  assert.deepEqual(messagingClientOptions(),{});
  const file=join(dir,'session.json');
  process.env.GUARDSCALE_MESSAGING_CREDENTIALS_FILE=file;
  process.env.GUARDSCALE_LOCAL_REPLAY='false';
  assert.throws(()=>messagingClientOptions(),/local emulator boundary/);
  Object.assign(process.env,{GUARDSCALE_LOCAL_REPLAY:'true',AWS_ACCESS_KEY_ID:'local',AWS_SECRET_ACCESS_KEY:'local',GUARDSCALE_TABLE:'guardscale-local-fixture',GUARDSCALE_DYNAMODB_ENDPOINT:'http://database:8000'});
  const session={aws_access_key_id:'fixture-key',aws_secret_access_key:'fixture-secret',aws_session_token:'fixture-token',expiration:new Date(Date.now()+60000).toISOString()};
  await writeFile(file,JSON.stringify(session),{mode:0o600});
  const provider=messagingClientOptions().credentials!;
  assert.equal((await provider()).accessKeyId,'fixture-key');
  await writeFile(file,JSON.stringify({...session,expiration:new Date(0).toISOString()}));
  await assert.rejects(provider(),/expired local messaging session/);
  process.env.GUARDSCALE_DYNAMODB_ENDPOINT='https://dynamodb.us-east-1.amazonaws.com';
  assert.throws(()=>messagingClientOptions(),/local emulator boundary/);
 }finally{
  for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];
  Object.assign(process.env,saved);await rm(dir,{recursive:true,force:true});
 }
});
