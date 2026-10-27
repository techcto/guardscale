import {readFile} from 'node:fs/promises';
import {localEmulation} from './local-emulation';

// Optional local-only role session. Production keeps using the ECS task role;
// local database/object-storage clients keep their emulator credentials.
export function messagingClientOptions(){
 const filename=process.env.GUARDSCALE_MESSAGING_CREDENTIALS_FILE;
 if(!filename)return {};
 if(!localEmulation())throw Error('Dedicated messaging credentials require the local emulator boundary');
 return {credentials:async()=>{
  const v=JSON.parse(await readFile(filename,'utf8'));
  const expiration=new Date(v.expiration);
  if(typeof v.aws_access_key_id!=='string'||!v.aws_access_key_id||typeof v.aws_secret_access_key!=='string'||!v.aws_secret_access_key||typeof v.aws_session_token!=='string'||!v.aws_session_token||!Number.isFinite(expiration.getTime())||expiration.getTime()<=Date.now())throw Error('Invalid or expired local messaging session; refresh the temporary role credentials');
  return{accessKeyId:v.aws_access_key_id,secretAccessKey:v.aws_secret_access_key,sessionToken:v.aws_session_token,expiration};
 }};
}
