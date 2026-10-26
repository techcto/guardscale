import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import Stripe from 'stripe';
import {setup,plans} from './setup-plans.mjs';
import pricing from '../../src/lib/billing-pricing.json' with {type:'json'};

// Credentials stay in this process; never put them in shell arguments or output.
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i++){
 const arg=args[i];
 if(arg==='--apply'){options.apply=true;continue;}
 if(arg==='--approved-pricing'){options.pricing=true;continue;}
 if(!['--secret-arn','--mode','--profile','--region'].includes(arg)||!args[i+1]||args[i+1].startsWith('--'))throw Error('Usage: sync-from-secret.mjs --mode live|sandbox [--apply --secret-arn ARN --profile PROFILE --region REGION]');
 if(options[arg.slice(2)])throw Error('Duplicate option');
 options[arg.slice(2)]=args[++i];
}
if(!['live','sandbox'].includes(options.mode))throw Error('Explicit --mode live or sandbox required');
const rates=options.pricing?{GUARDSCALE_SERVER_HOUR_CENTS:pricing.serverHourCents,GUARDSCALE_LOG_MB_CENTS:pricing.logMiBCents,GUARDSCALE_AI_CREDIT_CENTS:pricing.aiCreditCents}:{};
if(!options.apply){console.log(JSON.stringify({mode:options.mode,action:'Preview only; no AWS or Stripe calls',plans,...(options.pricing?{pricing_version:pricing.version,rates}: {})},null,2));}
else{
 if(!/^arn:aws[a-z-]*:secretsmanager:[a-z0-9-]+:\d{12}:secret:/.test(options['secret-arn']??''))throw Error('An exact Secrets Manager ARN is required');
 const region=options.region??'us-east-1';
 if(options['secret-arn'].split(':')[3]!==region)throw Error('Secret region does not match --region');
 let secret;
 try{
  const output=execFileSync('aws',['--region',region,...(options.profile?['--profile',options.profile]:[]),'secretsmanager','get-secret-value','--secret-id',options['secret-arn'],'--query','SecretString','--output','text','--no-cli-pager'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,AWS_PAGER:'',AWS_CLI_AUTO_PROMPT:'off'}});
  secret=JSON.parse(output);
 }catch{throw Error('Unable to read Stripe JSON secret. Check the ARN, AWS credentials and GetSecretValue permission.');}
 const prefix=options.mode==='live'?'live':'test';
 if(!new RegExp('^(sk|rk)_'+prefix+'_[A-Za-z0-9]+$').test(secret.secret_key??''))throw Error('Stripe key is missing or does not match --mode');
 // Catalog setup needs only an API key. Deployment separately requires the matching webhook secret.
 try{
  const client=new Stripe(secret.secret_key,{timeout:20000,maxNetworkRetries:1});
  const result=await setup(client,{data:readFileSync(new URL('../../public/guardscale-logo-marketplace-640.png',import.meta.url)),name:'guardscale-logo.png'},{...process.env,...rates});
  console.log(JSON.stringify({mode:options.mode,...result},null,2));
 }catch(error){console.error('Stripe synchronization failed ('+(error?.code??'request_failed')+'). Credentials were not printed.');process.exitCode=1;}
}
