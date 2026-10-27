import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const yaml=createRequire(import.meta.url)('js-yaml');
const tags=['Ref','Sub','GetAtt','Join','If','Equals','Not','And','Or','Select','Split','ImportValue','FindInMap','GetAZs','Condition'];
const schema=yaml.DEFAULT_SCHEMA.extend(tags.flatMap(tag=>['scalar','sequence'].map(kind=>new yaml.Type('!'+tag,{kind,construct:v=>({[tag==='Ref'||tag==='Condition'?tag:'Fn::'+tag]:tag==='GetAtt'&&typeof v==='string'?v.split('.'):v})}))));
for(const name of ['guardscale.yaml','guardscale-existing.yaml','guardscale-apphub-migration.yaml','guardscale-apphub-owned-data.yaml','guardscale-apphub-relaunch.yaml']){
 const template=yaml.load(readFileSync(new URL('../cloudformation/'+name,import.meta.url),'utf8'),{schema});
 test(name+': main-stack pair import preserves existing credential values',()=>{
  for(const [id,mode] of [['LiveCredentials','live'],['SandboxCredentials','sandbox']]){
   const secret=template.Resources[id];assert.equal(secret.Type,'AWS::SecretsManager::Secret');
   assert.equal(secret.Condition,'HasStripeOwnedPair');assert.equal(secret.DeletionPolicy,'Retain');assert.equal(secret.UpdateReplacePolicy,'Retain');
   assert.ok(secret.Properties.Name['Fn::Sub'].endsWith('/'+mode));
   const value=secret.Properties.SecretString['Fn::If'];assert.equal(value[0],'InitializeStripeOwnedPair');
   assert.deepEqual(JSON.parse(value[1]),{secret_key:'',webhook_secret:''});
   assert.deepEqual(value[2],{Ref:'AWS::NoValue'},'import must not create a secret version');
   assert.equal(secret.Properties.GenerateSecretString,undefined);
  }
 });
 test(name+': Stripe credentials are retained, encrypted and never plain task environment values',()=>{
  assert.equal(template.Parameters.StripeMode.Default,'live');
  assert.deepEqual(template.Parameters.StripeMode.AllowedValues,['live','sandbox']);
  for(const key of ['StripeSecretKey','StripeWebhookSecret'])assert.equal(template.Parameters[key].NoEcho,true);
  const resource=template.Resources.StripeCredentials;assert.equal(resource.Type,'AWS::SecretsManager::Secret');
  assert.equal(resource.DeletionPolicy,'RetainExceptOnCreate');assert.equal(resource.UpdateReplacePolicy,'Retain');
  assert.ok(resource.Properties.KmsKeyId);assert.ok(!resource.Properties.GenerateSecretString);
  let mainContainers=0,withCredentials=0;
  for(const task of Object.values(template.Resources)){
   if(task.Type!=='AWS::ECS::TaskDefinition')continue;
   for(const container of task.Properties.ContainerDefinitions){
    if(!container.Environment)continue;mainContainers++;
    assert.ok(container.Environment.some(value=>value.Name==='GUARDSCALE_STRIPE_MODE'&&value.Value.Ref==='StripeMode'));
    for(const [env,param] of Object.entries({GUARDSCALE_USAGE_EXPORT:'UsageExport',STRIPE_SERVER_OVERAGE_PRICE_ID:'StripeServerOveragePriceId',STRIPE_LOG_OVERAGE_PRICE_ID:'StripeLogOveragePriceId',STRIPE_AI_OVERAGE_PRICE_ID:'StripeAIOveragePriceId',GUARDSCALE_AI_CREDIT_WEIGHTS_JSON:'AICreditWeights'})){
     assert.ok(template.Parameters[param],name+': missing '+param);
     assert.ok(container.Environment.some(value=>value.Name===env&&value.Value.Ref===param),name+': missing '+env);
    }
    for(const key of ['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET'])assert.ok(!container.Environment.some(value=>value.Name===key));
    if(!container.Secrets?.some(value=>value['Fn::If']?.[1]?.Name==='STRIPE_SECRET_KEY'))continue;withCredentials++;
    assert.ok(container.Secrets.some(value=>value['Fn::If']?.[1]?.Name==='STRIPE_WEBHOOK_SECRET'));
    assert.ok(container.Environment.some(value=>value.Name==='GUARDSCALE_STRIPE_CREDENTIALS_REVISION'),'credential rotation rolls tasks');
   }
  }
  assert.equal(mainContainers,3);assert.ok(withCredentials>=2);
  assert.ok(template.Rules.StripeCredentialSource);
  assert.equal(template.Parameters.BlockedSignupDomains.Default,'');
  for(const task of Object.values(template.Resources)){
   if(task.Type!=='AWS::ECS::TaskDefinition')continue;
   for(const container of task.Properties.ContainerDefinitions){
    if(!['web','api'].includes(container.Name))continue;
    assert.ok(container.Environment.some(e=>e.Name==='GUARDSCALE_BLOCKED_SIGNUP_DOMAINS'&&e.Value.Ref==='BlockedSignupDomains'),name+': auth domain policy must reach '+container.Name);
   }
  }
  assert.ok(JSON.stringify(template.Resources.ExecutionRole).includes('stripe-credentials-read'));
  assert.ok(!JSON.stringify(template).includes('AUTOVISION_')&&!JSON.stringify(template).includes('SMARTDETECTOR_'));
 });
}
test('all local Compose services pin sandbox regardless of the host Stripe mode',()=>{
 for(const filename of ['../../docker-compose.yml','../local/compose.yml']){
  const template=yaml.load(readFileSync(new URL(filename,import.meta.url),'utf8'));
  for(const service of Object.values(template.services)){
   if(!service.environment?.STRIPE_SECRET_KEY)continue;
   assert.equal(service.environment.GUARDSCALE_STRIPE_MODE,'sandbox');
  }
 }
});
