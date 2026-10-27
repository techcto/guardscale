import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,existsSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseEnv} from 'node:util';
import {BedrockRuntimeClient,ConverseCommand} from '@aws-sdk/client-bedrock-runtime';

const root=fileURLToPath(new URL('../../',import.meta.url)),file=join(root,'.env');
const local=existsSync(file)?parseEnv(readFileSync(file,'utf8')):{};
const options={profile:process.env.AWS_PROFILE??'',region:local.AWS_REGION??'us-east-1',model:local.GUARDSCALE_AI_MODEL_ID||'us.amazon.nova-lite-v1:0',duration:'3600',apply:false,verify:false};
const args=process.argv.slice(2);
for(let i=0;i<args.length;i++){
 const flag=args[i];if(flag==='--apply'){options.apply=true;continue;}if(flag==='--verify'){options.verify=true;continue;}
 if(!['--profile','--region','--model','--duration'].includes(flag)||!args[i+1]||args[i+1].startsWith('--'))throw Error('Usage: prepare-bedrock.mjs --profile PROFILE [--region REGION --model MODEL --duration 3600] [--apply --verify]');
 options[flag.slice(2)]=args[++i];
}
if(!options.profile||!/^\d+$/.test(options.duration)||Number(options.duration)<900||Number(options.duration)>129600)throw Error('An explicit AWS profile and a 900-129600 second session duration are required');
if(!options.apply){console.log(JSON.stringify({mode:'preview; no AWS calls',profile:options.profile,region:options.region,model:options.model,durationSeconds:Number(options.duration),verification:options.verify}));}
else{
 if(!existsSync(file))throw Error('Create the ignored root .env first; existing local Stripe/settings must be preserved');
 let stage='session creation';
 try{
  const session=JSON.parse(execFileSync('aws',['--profile',options.profile,'--region',options.region,'sts','get-session-token','--duration-seconds',options.duration,'--output','json','--no-cli-pager'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})).Credentials;
  if(!session?.AccessKeyId||!session.SecretAccessKey||!session.SessionToken||!session.Expiration)throw Error('Invalid temporary credentials');
  const directory=mkdtempSync(join(tmpdir(),'guardscale-bedrock-'));chmodSync(directory,0o700);
  const path=join(directory,'session.json');
  writeFileSync(path,JSON.stringify({aws_access_key_id:session.AccessKeyId,aws_secret_access_key:session.SecretAccessKey,aws_session_token:session.SessionToken,expiration:session.Expiration}),{mode:0o600});
  let probe=null;
  if(options.verify){
   stage='Bedrock tool-use verification';
   const client=new BedrockRuntimeClient({region:options.region,maxAttempts:1,credentials:{accessKeyId:session.AccessKeyId,secretAccessKey:session.SecretAccessKey,sessionToken:session.SessionToken}});
   try{
    const response=await client.send(new ConverseCommand({modelId:options.model,messages:[{role:'user',content:[{text:'Local credential check. Call local_probe with ok=true. No customer data is supplied.'}]}],toolConfig:{tools:[{toolSpec:{name:'local_probe',description:'Confirm local tool-use availability.',inputSchema:{json:{type:'object',properties:{ok:{type:'boolean'}},required:['ok']}}}}],toolChoice:{any:{}}},inferenceConfig:{maxTokens:100,temperature:0}}),{abortSignal:AbortSignal.timeout(20000)});
    if(!response.output?.message?.content?.some(c=>c.toolUse?.name==='local_probe'&&c.toolUse.input?.ok===true))throw Error('Expected tool call missing');
    probe={toolUse:true,inputTokens:response.usage?.inputTokens,outputTokens:response.usage?.outputTokens};
   }finally{client.destroy();}
  }
  stage='local environment update';
  let source=readFileSync(file,'utf8');
  for(const [key,value]of Object.entries({GUARDSCALE_AI_MODEL_ID:options.model,GUARDSCALE_BEDROCK_CREDENTIALS_PATH:path.replaceAll('\\','/'),AWS_REGION:options.region})){
   const line=key+'='+value,re=new RegExp('^'+key+'=.*$','m');source=re.test(source)?source.replace(re,line):source.trimEnd()+'\n'+line+'\n';
  }
  writeFileSync(file,source,{mode:0o600});
  console.log(JSON.stringify({status:'ready',profile:options.profile,region:options.region,model:options.model,credentialFile:path,expiresAt:session.Expiration,probe,storageCredentialsUnchanged:true,stripeSettingsPreserved:true},null,2));
 }catch(error){const awsCode=String(error.stderr??'').match(/An error occurred \(([^)]+)\)/)?.[1];console.error(stage+' failed ('+(awsCode??error.name??'unavailable')+'). No credentials were printed.');process.exitCode=1;}
}
