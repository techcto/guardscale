import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const yaml=createRequire(import.meta.url)('js-yaml');
const tags=['Ref','Sub','GetAtt','Join','If','Equals','Not','And','Or','Select','Split','ImportValue','FindInMap','GetAZs','Condition'];
const schema=yaml.DEFAULT_SCHEMA.extend(tags.flatMap(tag=>['scalar','sequence'].map(kind=>new yaml.Type('!'+tag,{kind,construct:v=>({[tag==='Ref'||tag==='Condition'?tag:'Fn::'+tag]:tag==='GetAtt'&&typeof v==='string'?v.split('.'):v})}))));
for(const name of ['guardscale.yaml','guardscale-existing.yaml','guardscale-apphub-migration.yaml','guardscale-apphub-owned-data.yaml','guardscale-apphub-relaunch.yaml']){
 const template=yaml.load(readFileSync(new URL('../cloudformation/'+name,import.meta.url),'utf8'),{schema});
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
    for(const key of ['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET'])assert.ok(!container.Environment.some(value=>value.Name===key));
    if(!container.Secrets?.some(value=>value['Fn::If']?.[1]?.Name==='STRIPE_SECRET_KEY'))continue;withCredentials++;
    assert.ok(container.Secrets.some(value=>value['Fn::If']?.[1]?.Name==='STRIPE_WEBHOOK_SECRET'));
    assert.ok(container.Environment.some(value=>value.Name==='GUARDSCALE_STRIPE_CREDENTIALS_REVISION'),'credential rotation rolls tasks');
   }
  }
  assert.equal(mainContainers,3);assert.ok(withCredentials>=2);
  assert.ok(template.Rules.StripeCredentialSource);
  assert.ok(JSON.stringify(template.Resources.ExecutionRole).includes('stripe-credentials-read'));
  assert.ok(!JSON.stringify(template).includes('AUTOVISION_')&&!JSON.stringify(template).includes('SMARTDETECTOR_'));
 });
}
