import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createInterface} from 'node:readline/promises';

const [project,command,...args]=process.argv.slice(2);
const projects={autovision:['autovision'],smartdetector:['smartdetector'],guardscale:['guardscale','guardian']};
function fail(message){throw Error(message)}
function help(){console.log(`Usage: bash cmd.sh cft-update VERSION --stack STACK [options]

Updates an EXISTING stack through a reviewed CloudFormation UPDATE change set.
VERSION accepts 0.2.6 or v0.2.6. No tag, image build, or Marketplace submission occurs.

  --stack NAME          Or ${project?.toUpperCase()}_STACK_NAME / CFT_STACK_NAME
  --region REGION       Or AWS_REGION / AWS_DEFAULT_REGION (default us-east-1)
  --profile PROFILE     Or AWS_PROFILE; use your approved short-lived login
  --plan                Create/show the change set without executing
  --approve ARN         Execute this exact previously reviewed change set
  --template FILE       Optional updated template (default: deployed template)
  --template-url URL    Optional HTTPS S3 template URL instead of a local file

By default, review the summary and type the stack name to execute, then wait for
UPDATE_COMPLETE. Non-interactive execution requires --approve with an exact ARN.
All other parameter values, including credentials, use UsePreviousValue=true.
Replacements/removals are highlighted; never approve unexpected data deletion.`)}
const valueFlags=new Set(['--stack','--region','--profile','--approve','--template','--template-url']);
function options(){
 if(!projects[project])fail('Unknown project');
 if(!command||command==='help'||command==='--help'||args.includes('--help')){help();return null}
 if(command!=='cft-update')fail('Unknown command; use bash cmd.sh --help');
 const version=args[0]?.replace(/^v/,'');if(!version||!/^\d[0-9A-Za-z.-]{0,127}$/.test(version))fail('Provide an immutable release version, e.g. 0.2.6 (not latest).');
 const opts={version};
 for(let i=1;i<args.length;i++){
  const flag=args[i];if(flag==='--plan'){opts.plan=true;continue}
  if(!valueFlags.has(flag)||!args[i+1]||args[i+1].startsWith('--'))fail('Unknown option or missing value: '+flag);
  if(opts[flag.slice(2)]!==undefined)fail('Duplicate option: '+flag);opts[flag.slice(2)]=args[++i];
 }
 opts.stack??=process.env[project.toUpperCase()+'_STACK_NAME']??process.env.CFT_STACK_NAME;
 opts.region??=process.env.AWS_REGION??process.env.AWS_DEFAULT_REGION??'us-east-1';opts.profile??=process.env.AWS_PROFILE;
 if(!opts.stack)fail('Set '+project.toUpperCase()+'_STACK_NAME once, or pass --stack NAME. Stack names are never guessed.');
 if(opts.plan&&opts.approve)fail('--plan and --approve cannot be combined');
 if(opts.template&&opts['template-url'])fail('Choose one template source');
 if(opts.approve&&(opts.template||opts['template-url']))fail('--approve executes the existing plan; do not supply a new template');
 if(opts.approve&&!/^arn:aws[a-z-]*:cloudformation:[^:]+:\d{12}:changeSet\//.test(opts.approve))fail('--approve must be an exact CloudFormation change-set ARN');
 if(opts['template-url']&&!/^https:\/\//.test(opts['template-url']))fail('Template URL must be HTTPS');
 return opts;
}
function retag(value,version){
 if(!value||/\s/.test(value))fail('Invalid existing image URI; use an explicit reviewed template update.');
 const repo=value.split('@')[0],colon=repo.lastIndexOf(':');return (colon>repo.lastIndexOf('/')?repo.slice(0,colon):repo)+':'+version;
}
function imageParameters(stack,version){
 const params=stack.Parameters??[],values=new Map(params.map(p=>[p.ParameterKey,p.ParameterValue]));
 const base=values.get('ImageBase'),images=params.filter(p=>/^(Web|Api|Worker|Vision|Agent)Image$/.test(p.ParameterKey));
 const roots=base?[base]:images.map(p=>p.ParameterValue);
 if(!roots.length||roots.some(v=>!projects[project].some(alias=>new RegExp('(?:^|[/_-])'+alias+'(?:$|[/_:-])','i').test(v??''))))fail('Stack image repositories do not identify '+project+'. Refusing a possibly wrong application stack.');
 const replacements=new Map();
 if(values.has('ReleaseVersion')){if(!base)fail('ReleaseVersion requires an ImageBase parameter');replacements.set('ReleaseVersion',version)}
 for(const p of images)replacements.set(p.ParameterKey,retag(p.ParameterValue,version));
 if(!replacements.size)fail('No supported release/image parameters found. Nothing was changed.');
 return replacements;
}
async function main(){
 const opts=options();if(!opts)return;
 const aws=(...parts)=>{
  const flags=['--region',opts.region,...(opts.profile?['--profile',opts.profile]:[]),'--output','json','--no-cli-pager'];
  try{const out=execFileSync('aws',[...flags,...parts],{encoding:'utf8',maxBuffer:16*1024*1024,env:{...process.env,AWS_PAGER:'',AWS_CLI_AUTO_PROMPT:'off'},stdio:['ignore','pipe','pipe']});return out.trim()?JSON.parse(out):{}}
  catch(error){if(error.code==='ENOENT')fail('AWS CLI is required.');const code=String(error.stderr??'').match(/An error occurred \(([A-Za-z0-9_.-]+)\)/)?.[1]??(String(error.stderr??'').includes('Unable to locate credentials')?'MissingCredentials':'CliFailure');throw Error(`AWS ${parts.slice(0,2).join(' ')} failed (${code}). Check credentials, permissions and stack/change-set status. No force-update or resource cleanup was attempted.`)}
 };
 const stack=aws('cloudformation','describe-stacks','--stack-name',opts.stack).Stacks?.[0];
 if(!stack)fail('Stack not found');
 if(!['CREATE_COMPLETE','UPDATE_COMPLETE','UPDATE_ROLLBACK_COMPLETE','IMPORT_COMPLETE','IMPORT_ROLLBACK_COMPLETE'].includes(stack.StackStatus))fail('Stack is not ready for an update: '+stack.StackStatus+'. Wait or resolve the existing operation first.');
 console.log(`Project: ${project}\nStack: ${stack.StackId}\nRegion: ${opts.region}\nVersion: ${opts.version}`);
 const replacements=imageParameters(stack,opts.version);
 let arn=opts.approve;
 if(!arn){
  const template=opts.template?resolve(opts.template):null;
  if(template&&statSync(template).size>51200)fail('Template exceeds 51,200 bytes; publish it and use --template-url.');
  const summaryArgs=template?['--template-body','file://'+template]:opts['template-url']?['--template-url',opts['template-url']]:['--stack-name',stack.StackId];
  const summary=aws('cloudformation','get-template-summary',...summaryArgs);
  if(!template&&!opts['template-url']&&(summary.DeclaredTransforms??[]).includes('AWS::LanguageExtensions'))fail('This stack uses AWS::LanguageExtensions; provide --template or --template-url, as required by AWS.');
  const current=new Map((stack.Parameters??[]).map(p=>[p.ParameterKey,p]));
  const declared=summary.Parameters??[];
  for(const p of declared)if(!current.has(p.ParameterKey)&&p.DefaultValue===undefined)fail('New required parameter '+p.ParameterKey+' needs a separate reviewed configuration update.');
  for(const key of replacements.keys())if(!declared.some(p=>p.ParameterKey===key))fail('Updated template removed an expected image/version parameter: '+key);
  const parameters=declared.filter(p=>current.has(p.ParameterKey)).map(p=>replacements.has(p.ParameterKey)?{ParameterKey:p.ParameterKey,ParameterValue:replacements.get(p.ParameterKey)}:{ParameterKey:p.ParameterKey,UsePreviousValue:true});
  const capabilities=[...new Set([...(stack.Capabilities??[]),...(summary.Capabilities??[])])];
  const input={StackName:stack.StackId,ChangeSetType:'UPDATE',ChangeSetName:`${project}-release-${opts.version.replace(/[^a-zA-Z0-9-]/g,'-').slice(0,70)}-${Date.now()}`,Description:`${project} reviewed release ${opts.version}`,ClientToken:randomUUID(),IncludeNestedStacks:true,Parameters:parameters,...(capabilities.length?{Capabilities:capabilities}:{}),...(template?{TemplateBody:undefined}:opts['template-url']?{TemplateURL:opts['template-url']}:{UsePreviousTemplate:true})};
  // Runtime file contains parameter references and image versions, never fetched secret values.
  const temp=mkdtempSync(join(tmpdir(),project+'-cft-update-'));
  try{
   const filename=join(temp,'request.json');writeFileSync(filename,JSON.stringify(input),{mode:0o600});
   const result=aws('cloudformation','create-change-set','--cli-input-json','file://'+filename,...(template?['--template-body','file://'+template]:[]));arn=result.Id;if(!arn)fail('AWS did not return a change-set ARN');
  }finally{rmSync(temp,{recursive:true})}
  console.log('Preparing change set: '+arn);
  try{aws('cloudformation','wait','change-set-create-complete','--change-set-name',arn,'--stack-name',stack.StackId)}catch{/* inspect the terminal status below */}
 }
 let change=aws('cloudformation','describe-change-set','--change-set-name',arn,'--stack-name',stack.StackId);
 if(change.StackId!==stack.StackId)fail('Change set belongs to another stack');
 if(change.Status==='FAILED'&&/didn.t contain changes|no updates are to be performed/i.test(change.StatusReason??'')){
  if(!opts.approve)aws('cloudformation','delete-change-set','--change-set-name',arn,'--stack-name',stack.StackId);
  console.log('No changes: this version/template is already deployed.');return;
 }
 if(change.Status!=='CREATE_COMPLETE'||change.ExecutionStatus!=='AVAILABLE')fail('Change set is not executable: '+change.Status+' / '+change.ExecutionStatus);
 const planned=new Map((change.Parameters??[]).map(p=>[p.ParameterKey,p.ParameterValue]));
 for(const [key,value] of replacements)if(planned.get(key)!==value)fail('Reviewed change set does not match requested version/image parameter '+key);
 console.log('Change set: '+arn);
 for(const c of change.Changes??[]){const r=c.ResourceChange??{};console.log(`${r.Action??'Unknown'} ${r.LogicalResourceId??''} (${r.ResourceType??''}) replacement=${r.Replacement??'n/a'} scope=${(r.Scope??[]).join(',')}`);if(r.Action==='Remove'||r.Replacement==='True'||r.Replacement==='Conditional')console.log('  REVIEW REQUIRED: removal/replacement may affect availability or retained data.');}
 console.log('Review availability impact and full nested changes in CloudFormation. ECS task rollouts may briefly reduce capacity. Credentials and unrelated parameters were preserved.');
 if(opts.plan){console.log('Plan only; nothing executed. After review, rerun with --approve '+arn);return}
 if(!opts.approve){
  if(!process.stdin.isTTY){console.log('Not executed: interactive review is required. Use --plan, review the ARN, then --approve ARN.');process.exitCode=2;return}
  const rl=createInterface({input:process.stdin,output:process.stdout});let answer;try{answer=await rl.question(`Type ${stack.StackName} to execute (anything else cancels): `)}finally{rl.close()}
  if(answer!==stack.StackName){console.log('Cancelled; change set retained for review.');return}
 }
 // Revalidate immediately before execution; another deployment may have invalidated this plan.
 change=aws('cloudformation','describe-change-set','--change-set-name',arn,'--stack-name',stack.StackId);
 if(change.Status!=='CREATE_COMPLETE'||change.ExecutionStatus!=='AVAILABLE')fail('Change set became unavailable; create and review a fresh plan.');
 aws('cloudformation','execute-change-set','--change-set-name',arn,'--stack-name',stack.StackId,'--client-request-token',randomUUID());
 console.log('Executing reviewed change set. Waiting for UPDATE_COMPLETE…');
 aws('cloudformation','wait','stack-update-complete','--stack-name',stack.StackId);
 const final=aws('cloudformation','describe-stacks','--stack-name',stack.StackId).Stacks?.[0];
 if(final?.StackStatus!=='UPDATE_COMPLETE')fail('Update did not reach UPDATE_COMPLETE. Inspect CloudFormation events; no destructive recovery was attempted.');
 console.log('CloudFormation update complete. Verify application health, login, logs and messaging before declaring production healthy.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
