import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createGuardianBedrockClient} from './guardian-bedrock';
test('dedicated Guardian credentials do not replace local storage identity and reject malformed files',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'guardian-credentials-'));
 const previous=process.env.GUARDSCALE_BEDROCK_CREDENTIALS_FILE;
 try{
  const filename=join(folder,'session.json');process.env.GUARDSCALE_BEDROCK_CREDENTIALS_FILE=filename;
  await writeFile(filename,JSON.stringify({aws_access_key_id:'test-access',aws_secret_access_key:'test-secret',aws_session_token:'test-session'}),{mode:0o600});
  const original=process.env.AWS_ACCESS_KEY_ID;
  const client=createGuardianBedrockClient();
  const credentials=await client.config.credentials();
  assert.equal(credentials.accessKeyId,'test-access');assert.equal(credentials.sessionToken,'test-session');
  assert.equal(process.env.AWS_ACCESS_KEY_ID,original);client.destroy();
  await writeFile(filename,'{"AccessKeyId":"wrong-schema"}');
  const invalid=createGuardianBedrockClient();await assert.rejects(invalid.config.credentials(),/Invalid local Bedrock credential file/);invalid.destroy();
 }finally{
  if(previous===undefined)delete process.env.GUARDSCALE_BEDROCK_CREDENTIALS_FILE;else process.env.GUARDSCALE_BEDROCK_CREDENTIALS_FILE=previous;
  await rm(folder,{recursive:true,force:true});
 }
});
