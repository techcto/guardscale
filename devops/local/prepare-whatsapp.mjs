import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseEnv} from 'node:util';
const file=fileURLToPath(new URL('../../.env',import.meta.url));
const env=parseEnv(readFileSync(file,'utf8'));
const opts={profile:process.env.AWS_PROFILE??'',stack:'guardscale-dev-whatsapp-replies',region:env.AWS_REGION??'us-east-1',apply:false};
const args=process.argv.slice(2);
for(let i=0;i<args.length;i++){
 if(args[i]==='--apply'){opts.apply=true;continue;}
 if(!['--profile','--stack','--region'].includes(args[i])||!args[i+1]||args[i+1].startsWith('--'))throw Error('Usage: prepare-whatsapp.mjs --profile PROFILE [--stack DEV_STACK --region REGION] [--apply]');
 opts[args[i].slice(2)]=args[++i];
}
if(!opts.profile||!/^\+[1-9]\d{7,14}$/.test(env.GUARDSCALE_LOCAL_WHATSAPP_RECIPIENT??''))throw Error('Select an AWS profile and save the authorized international-format test recipient in the ignored .env');
if(!opts.apply)console.log(JSON.stringify({mode:'preview; no AWS calls',stack:opts.stack,region:opts.region,recipientEnding:env.GUARDSCALE_LOCAL_WHATSAPP_RECIPIENT.slice(-4)}));
else{
 let stage='development stack inspection';
 try{
  const aws=(...a)=>JSON.parse(execFileSync('aws',['--profile',opts.profile,'--region',opts.region,...a,'--output','json','--no-cli-pager'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  const s=aws('cloudformation','describe-stacks','--stack-name',opts.stack).Stacks[0];
  if(!['CREATE_COMPLETE','UPDATE_COMPLETE'].includes(s.StackStatus))throw Error('Stack is not ready');
  const outputs=new Map(s.Outputs.map(o=>[o.OutputKey,o.OutputValue])),parameters=new Map(s.Parameters.map(p=>[p.ParameterKey,p.ParameterValue]));
  if(!outputs.get('LocalTestingRoleArn')||!outputs.get('QueueUrl'))throw Error('Development role/queue outputs missing');
  stage='temporary role assumption';
  const c=aws('sts','assume-role','--role-arn',outputs.get('LocalTestingRoleArn'),'--role-session-name','guardscale-local-whatsapp','--duration-seconds','3600').Credentials;
  if(!c?.AccessKeyId||!c.SecretAccessKey||!c.SessionToken)throw Error('Temporary credentials missing');
  const dir=mkdtempSync(join(tmpdir(),'guardscale-whatsapp-'));chmodSync(dir,0o700);const path=join(dir,'session.json');
  writeFileSync(path,JSON.stringify({aws_access_key_id:c.AccessKeyId,aws_secret_access_key:c.SecretAccessKey,aws_session_token:c.SessionToken,expiration:c.Expiration}),{mode:0o600});
  let source=readFileSync(file,'utf8');
  for(const[k,v]of Object.entries({GUARDSCALE_MESSAGING_CREDENTIALS_PATH:path.replaceAll('\\','/'),GUARDSCALE_WHATSAPP_DEV_QUEUE_URL:outputs.get('QueueUrl'),GUARDSCALE_WHATSAPP_LOCAL_ROLE_ARN:outputs.get('LocalTestingRoleArn'),GUARDSCALE_WHATSAPP_ORIGINATION_ID:parameters.get('WhatsappSenderId'),GUARDSCALE_WHATSAPP_SNS_TOPIC_ARN:parameters.get('WhatsappEventTopicArn')})){
   if(!v)throw Error('Missing development setting '+k);const line=k+'='+v,re=new RegExp('^'+k+'=.*$','m');source=re.test(source)?source.replace(re,line):source.trimEnd()+'\n'+line+'\n';
  }
  writeFileSync(file,source,{mode:0o600});console.log(JSON.stringify({status:'ready',credentialFile:path,expiresAt:c.Expiration,recipientEnding:env.GUARDSCALE_LOCAL_WHATSAPP_RECIPIENT.slice(-4),separateReplyQueue:true,productionRoutingUnchanged:true},null,2));
 }catch(e){const code=String(e.stderr??'').match(/An error occurred \(([^)]+)\)/)?.[1]??e.name??'unavailable';console.error(stage+' failed ('+code+'). No credential or message values were printed.');process.exitCode=1;}
}
