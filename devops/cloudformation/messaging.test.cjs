const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),yaml=require('js-yaml');
const tags=['Ref','Sub','GetAtt','Join','If','Equals','Not','And','Or','Select','Split','ImportValue','FindInMap','GetAZs','Condition'];
const schema=yaml.DEFAULT_SCHEMA.extend(tags.flatMap(tag=>['scalar','sequence'].map(kind=>new yaml.Type('!'+tag,{kind,construct:v=>({[tag==='Ref'||tag==='Condition'?tag:'Fn::'+tag]:tag==='GetAtt'&&typeof v==='string'?v.split('.'):v})}))));
for(const name of ['guardscale.yaml','guardscale-existing.yaml','guardscale-apphub-migration.yaml','guardscale-apphub-owned-data.yaml','guardscale-apphub-relaunch.yaml']){
 const t=yaml.load(fs.readFileSync(path.join(__dirname,name),'utf8'),{schema});
 test(name+': every explicit resource reference resolves',()=>{
  const visit=value=>{
   if(!value||typeof value!=='object')return;
   if(typeof value.Ref==='string')assert.ok(value.Ref.startsWith('AWS::')||t.Parameters[value.Ref]||t.Resources[value.Ref],'Unresolved Ref '+value.Ref);
   if(Array.isArray(value['Fn::GetAtt']))assert.ok(t.Resources[value['Fn::GetAtt'][0]],'Unresolved GetAtt '+value['Fn::GetAtt'][0]);
   Object.values(value).forEach(visit);
  };
  visit(t.Resources);visit(t.Outputs);
 });
 test(name+': managed, existing and disabled routing preserve trust boundaries',()=>{
  const r=t.Resources,evaluate=(value,params)=>{
   if(typeof value!=='object'||value===null)return value;
   if(value.Ref)return params[value.Ref]??value.Ref;
   if(value.Condition)return evaluate(t.Conditions[value.Condition],params);
   if(value['Fn::Equals'])return evaluate(value['Fn::Equals'][0],params)===evaluate(value['Fn::Equals'][1],params);
   if(value['Fn::Not'])return !evaluate(value['Fn::Not'][0],params);
   if(value['Fn::And'])return value['Fn::And'].every(v=>evaluate(v,params));
   if(value['Fn::Or'])return value['Fn::Or'].some(v=>evaluate(v,params));
   if(value['Fn::If']){const [c,a,b]=value['Fn::If'];return evaluate(evaluate(t.Conditions[c],params)?a:b,params)}
   throw Error('Unexpected intrinsic');
  };
  for(const [waba,topic,enabled,managed] of [['','',false,false],['waba-test','',true,true],['','existing-topic',true,false],['waba-test','existing-topic',true,false]]){
   const p={WhatsappBusinessAccountId:waba,WhatsappEventTopicArn:topic};
   assert.equal(evaluate(t.Conditions.HasWhatsappTopic,p),enabled);
   assert.equal(evaluate(t.Conditions.CreateWhatsappTopic,p),managed);
   assert.equal(evaluate(r.WhatsappSubscription.Properties.TopicArn,p),managed?'WhatsappTopic':topic);
  }
  assert.equal(r.WhatsappSubscription.Properties.RawMessageDelivery,false,'worker requires trusted SNS envelope');
  assert.deepEqual(r.WhatsappSubscription.Properties.TopicArn,r.WhatsappQueuePolicy.Properties.PolicyDocument.Statement[0]['Fn::If'][1].Condition.ArnEquals['aws:SourceArn']);
  assert.equal(r.WhatsappQueuePolicy.Condition,'HasMessagingTopic');
  assert.deepEqual(r.WhatsappQueuePolicy.Properties.PolicyDocument.Statement[1]['Fn::If'][1].Condition.ArnEquals['aws:SourceArn'],r.EmailReplySubscription.Properties.TopicArn);
  assert.equal(r.EmailReplySubscription.Properties.RawMessageDelivery,false);
  assert.equal(r.EmailReplySubscription.Condition,'HasEmailReplies');
  const policy=r.WhatsappTopicPolicy.Properties.PolicyDocument.Statement[0];
  assert.deepEqual(policy.Principal,{Service:'social-messaging.amazonaws.com'});
  assert.deepEqual(policy.Condition.StringEquals['aws:SourceAccount'],{Ref:'AWS::AccountId'});
  assert.ok(policy.Condition.ArnLike['aws:SourceArn']);
  assert.equal(r.WhatsappDestination.Condition,'CreateWhatsappTopic');
  assert.ok(r.WhatsappDestination.DependsOn.includes('WhatsappSubscription'));
  assert.equal(r.WhatsappRoutingFunction.Properties.Code.ZipFile,fs.readFileSync(path.join(__dirname,'whatsapp-destination.py'),'utf8'));
  for(const task of Object.values(r).filter(x=>x.Type==='AWS::ECS::TaskDefinition'))for(const c of task.Properties.ContainerDefinitions){
   const env=Object.fromEntries(c.Environment.map(e=>[e.Name,e.Value]));
   assert.deepEqual(env.GUARDSCALE_WHATSAPP_SNS_TOPIC_ARN,r.WhatsappSubscription.Properties.TopicArn);
   assert.deepEqual(env.GUARDSCALE_SES_FROM,{Ref:'SesFrom'});
   assert.deepEqual(env.GUARDSCALE_WHATSAPP_ORIGINATION_ID,{Ref:'WhatsappOriginationId'});
   assert.deepEqual(env.GUARDSCALE_WHATSAPP_TEMPLATE_LANGUAGE,{Ref:'WhatsappTemplateLanguage'});
   assert.deepEqual(env.GUARDSCALE_EMAIL_REPLY_DOMAIN,{Ref:'EmailReplyDomain'});
   assert.deepEqual(env.GUARDSCALE_EMAIL_REPLY_TOPIC_ARN,r.EmailReplySubscription.Properties.TopicArn);
  }
  assert.deepEqual(t.Outputs.SesFrom.Value,{Ref:'SesFrom'});
  assert.equal(t.Parameters.WhatsappBusinessAccountId.Default,'','legacy stacks opt in explicitly');
  assert.ok(!t.Description.includes('social-messaging:'),'IAM statements must not be folded into template description');
 });
}
for(const file of ['guardscale.yaml','guardscale-existing.yaml','guardscale-apphub-migration.yaml','guardscale-apphub-owned-data.yaml','guardscale-apphub-relaunch.yaml'])test(file+': email replies belong to the main stack and reuse a verified identity',()=>{
 const t=yaml.load(fs.readFileSync(path.join(__dirname,file),'utf8'),{schema}),r=t.Resources;
 assert.equal(t.Parameters.EmailRepliesEnabled.Default,'false','existing installations opt in');
 assert.equal(Object.values(r).some(x=>x.Type==='AWS::SES::EmailIdentity'),false,'never create another sender identity');
 assert.equal(r.EmailReplyTopic.Properties.KmsMasterKeyId.Ref,'EmailReplyKey');
 assert.equal(r.EmailReplyRule.Properties.Rule.TlsPolicy,'Require');
 assert.equal(r.EmailReplyRule.Properties.Rule.ScanEnabled,true);
 assert.equal(r.EmailReplyRule.Properties.Rule.Actions[0].SNSAction.Encoding,'Base64');
 assert.equal(r.ActivateEmailReplyRules.Condition,'CreateEmailReplyRuleSet');
 assert.equal(r.EmailReplyActivationFunction.Properties.Code.ZipFile,fs.readFileSync(path.join(__dirname,'email-rule-activation.py'),'utf8'));
 assert.equal(r.EmailReplyDns.Properties.Type,'MX');
 assert.deepEqual(r.EmailReplyDns.Properties.Name,{Ref:'EmailReplyDomain'});
});
