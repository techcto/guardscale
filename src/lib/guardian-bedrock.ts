import {readFile} from 'node:fs/promises';
import {BedrockRuntimeClient} from '@aws-sdk/client-bedrock-runtime';

// Explicit local identity only for Bedrock; storage keeps its local credentials.
// Production omits this setting and uses the ECS task role.
export function createGuardianBedrockClient(){
 const filename=process.env.GUARDSCALE_BEDROCK_CREDENTIALS_FILE;
 return new BedrockRuntimeClient({maxAttempts:1,...(filename?{credentials:async()=>{
  const value=JSON.parse(await readFile(filename,'utf8'));
  if(typeof value.aws_access_key_id!=='string'||!value.aws_access_key_id||typeof value.aws_secret_access_key!=='string'||!value.aws_secret_access_key||
    (value.aws_session_token!==undefined&&typeof value.aws_session_token!=='string'))throw Error('Invalid local Bedrock credential file');
  return{accessKeyId:value.aws_access_key_id,secretAccessKey:value.aws_secret_access_key,...(value.aws_session_token?{sessionToken:value.aws_session_token}:{})};
 }}:{})});
}
