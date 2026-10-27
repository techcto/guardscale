// Regenerate inline CloudFormation messaging resources after editing the handler.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const yaml=require('js-yaml');
const tags=['Ref','Sub','GetAtt','Join','If','Equals','Not','And','Or','Select','Split','ImportValue','FindInMap','GetAZs','Condition'];
const types=tags.flatMap(tag=>['scalar','sequence'].map(kind=>new yaml.Type('!'+tag,{kind,construct:v=>({[tag==='Ref'||tag==='Condition'?tag:'Fn::'+tag]:tag==='GetAtt'&&typeof v==='string'?v.split('.'):v})})));
const schema=yaml.DEFAULT_SCHEMA.extend(types),ref=x=>({Ref:x}),get=(a,b)=>({'Fn::GetAtt':[a,b]}),sub=x=>({'Fn::Sub':x}),not=x=>({'Fn::Not':[x]}),eq=(a,b)=>({'Fn::Equals':[a,b]}),choose=(c,a,b)=>({'Fn::If':[c,a,b]});
const directory=__dirname,code=fs.readFileSync(path.join(directory,'whatsapp-destination.py'),'utf8');
const wabaArn={'Fn::Sub':['arn:${AWS::Partition}:social-messaging:${AWS::Region}:${AWS::AccountId}:waba/${WabaKey}',{WabaKey:{'Fn::Select':[1,{'Fn::Split':['waba-',ref('WhatsappBusinessAccountId')]}]}}]};
for(const name of ['guardscale.yaml','guardscale-existing.yaml','guardscale-apphub-migration.yaml','guardscale-apphub-owned-data.yaml','guardscale-apphub-relaunch.yaml']){
 const file=path.join(directory,name),old=fs.readFileSync(file,'utf8'),json=old.trimStart().startsWith('{'),t=json?JSON.parse(old):yaml.load(old,{schema});
 t.Parameters.WhatsappBusinessAccountId={Type:'String',Default:'',AllowedPattern:'^$|^waba-[a-zA-Z0-9]+$',Description:'Registered WABA ID. With no existing topic ARN, creates and connects a stack-owned SNS topic. Never replaces a different WABA destination.'};
 t.Parameters.WhatsappTemplateLanguage={Type:'String',Default:'en_US',AllowedPattern:'[a-z]{2,3}(_[A-Z]{2})?',Description:'Language of the approved WhatsApp alert template.'};
 t.Conditions.HasExistingWhatsappTopic=not(eq(ref('WhatsappEventTopicArn'),''));
 t.Conditions.CreateWhatsappTopic={'Fn::And':[not(eq(ref('WhatsappBusinessAccountId'),'')),eq(ref('WhatsappEventTopicArn'),'')]};
 t.Conditions.HasWhatsappTopic={'Fn::Or':[{Condition:'HasExistingWhatsappTopic'},{Condition:'CreateWhatsappTopic'}]};
 t.Parameters.EmailReplyTopicArn={Type:'String',Default:'',AllowedPattern:'^$|^arn:aws[a-z-]*:sns:[a-z0-9-]+:[0-9]{12}:[A-Za-z0-9_-]+$',Description:'Optional existing encrypted SES receiving topic. Leave blank for main-stack-managed receiving or disabled replies.'};
 t.Parameters.EmailReplyDomain={Type:'String',Default:'',AllowedPattern:'^$|^[a-z0-9.-]+\\.[a-z]{2,}$',Description:'Dedicated receiving subdomain configured by this installation or its existing receiving topic.'};
 t.Parameters.EmailRepliesEnabled={Type:'String',Default:'false',AllowedValues:['true','false'],Description:'Create SES reply routing in this application stack using the existing verified sender identity. Does not create another SES identity.'};
 t.Parameters.EmailReplyHostedZoneId={Type:'String',Default:'',AllowedPattern:'^$|^Z[A-Z0-9]+$',Description:'Route 53 hosted zone for the dedicated reply subdomain. Required for managed email replies.'};
 t.Parameters.EmailReplyExistingRuleSetName={Type:'String',Default:'',AllowedPattern:'^$|^[A-Za-z0-9._-]{1,64}$',Description:'Existing active SES rule set to extend. Blank creates a guarded stack-owned rule set only when no other rule set is active.'};
 t.Conditions.CreateManagedEmailReplies=eq(ref('EmailRepliesEnabled'),'true');
 t.Conditions.CreateEmailReplyRuleSet={'Fn::And':[{Condition:'CreateManagedEmailReplies'},eq(ref('EmailReplyExistingRuleSetName'),'')]};
 t.Conditions.HasEmailReplies={'Fn::Or':[{Condition:'CreateManagedEmailReplies'},not(eq(ref('EmailReplyTopicArn'),''))]};
 t.Conditions.HasMessagingTopic={'Fn::Or':[{Condition:'HasWhatsappTopic'},{Condition:'HasEmailReplies'}]};
 t.Rules??={};t.Rules.EmailReplyConfiguration={Assertions:[{Assert:{'Fn::Or':[{'Fn::And':[eq(ref('EmailRepliesEnabled'),'false'),eq(ref('EmailReplyTopicArn'),''),eq(ref('EmailReplyDomain'),'')]},{'Fn::And':[eq(ref('EmailRepliesEnabled'),'false'),not(eq(ref('EmailReplyTopicArn'),'')),not(eq(ref('EmailReplyDomain'),''))]},{'Fn::And':[eq(ref('EmailRepliesEnabled'),'true'),eq(ref('EmailReplyTopicArn'),''),not(eq(ref('EmailReplyDomain'),'')),not(eq(ref('EmailReplyHostedZoneId'),'')),not(eq(ref('SesFrom'),''))]}]},AssertDescription:'Managed replies require a dedicated domain, hosted zone and verified SES From address with no external topic. Otherwise configure both external topic/domain, or leave replies disabled.'}]};
 const topic=choose('CreateWhatsappTopic',ref('WhatsappTopic'),ref('WhatsappEventTopicArn'));
 const r=t.Resources;
 // Optional stack-owned live/sandbox pair. Import mode NEVER writes secret values.
 t.Parameters.StripeOwnedPairPrefix={Type:'String',Default:'',AllowedPattern:'^$|^[a-zA-Z0-9/_-]+$',Description:'Optional main-stack-owned Stripe live/sandbox pair prefix. Blank keeps the existing single-secret/external-secret flow.'};
 t.Parameters.StripeOwnedPairImport={Type:'String',Default:'false',AllowedValues:['true','false'],Description:'For retained-resource import only. Keep true after import to avoid writing credential values.'};
 t.Conditions.HasStripeOwnedPair=not(eq(ref('StripeOwnedPairPrefix'),''));
 t.Conditions.InitializeStripeOwnedPair=eq(ref('StripeOwnedPairImport'),'false');
 for(const [id,mode] of [['LiveCredentials','live'],['SandboxCredentials','sandbox']]){
  r[id]={Type:'AWS::SecretsManager::Secret',Condition:'HasStripeOwnedPair',DeletionPolicy:'Retain',UpdateReplacePolicy:'Retain',Properties:{Name:sub('${StripeOwnedPairPrefix}/'+mode),Description:mode==='live'?'GuardScale live Stripe credentials. Populate both fields before enabling billing.':'GuardScale Stripe sandbox credentials. Never use live keys here.',SecretString:choose('InitializeStripeOwnedPair','{"secret_key":"","webhook_secret":""}',ref('AWS::NoValue')),Tags:[{Key:'Application',Value:'guardscale'},{Key:'BillingEnvironment',Value:mode}]}};
 }
 t.Outputs??={};
 t.Outputs.OwnedLiveStripeCredentialsArn={Condition:'HasStripeOwnedPair',Value:ref('LiveCredentials')};
 t.Outputs.OwnedSandboxStripeCredentialsArn={Condition:'HasStripeOwnedPair',Value:ref('SandboxCredentials')};
 Object.assign(r,require('./email-resources.cjs')({ref,get,sub,choose,logGroup:r.LogGroup?'LogGroup':'WorkerLogGroup'}));
 const emailTopic=choose('CreateManagedEmailReplies',ref('EmailReplyTopic'),ref('EmailReplyTopicArn'));
 r.WhatsappTopic={Type:'AWS::SNS::Topic',Condition:'CreateWhatsappTopic'};
 r.WhatsappTopicPolicy={Type:'AWS::SNS::TopicPolicy',Condition:'CreateWhatsappTopic',Properties:{Topics:[ref('WhatsappTopic')],PolicyDocument:{Version:'2012-10-17',Statement:[{Effect:'Allow',Principal:{Service:'social-messaging.amazonaws.com'},Action:'sns:Publish',Resource:ref('WhatsappTopic'),Condition:{StringEquals:{'aws:SourceAccount':ref('AWS::AccountId')},ArnLike:{'aws:SourceArn':sub('arn:${AWS::Partition}:social-messaging:${AWS::Region}:${AWS::AccountId}:*')}}}]}}};
 const queueUrl=r.Queue?ref('Queue'):ref('ExistingQueue'),queueArn=r.Queue?get('Queue','Arn'):ref('ExistingQueueArn');
 const publishStatement=source=>({Effect:'Allow',Principal:{Service:'sns.amazonaws.com'},Action:'sqs:SendMessage',Resource:queueArn,Condition:{ArnEquals:{'aws:SourceArn':source}}});
 r.WhatsappQueuePolicy={Type:'AWS::SQS::QueuePolicy',Condition:'HasMessagingTopic',Properties:{Queues:[queueUrl],PolicyDocument:{Version:'2012-10-17',Statement:[choose('HasWhatsappTopic',publishStatement(topic),ref('AWS::NoValue')),choose('HasEmailReplies',publishStatement(emailTopic),ref('AWS::NoValue'))]}}};
 r.EmailReplySubscription={Type:'AWS::SNS::Subscription',Condition:'HasEmailReplies',DependsOn:['WhatsappQueuePolicy'],Properties:{TopicArn:emailTopic,Protocol:'sqs',Endpoint:queueArn,RawMessageDelivery:false}};
 r.WhatsappSubscription.Properties.TopicArn=topic;
 r.WhatsappSubscription.DependsOn=['WhatsappQueuePolicy'];
 r.WhatsappRoutingRole={Type:'AWS::IAM::Role',Condition:'CreateWhatsappTopic',Properties:{AssumeRolePolicyDocument:{Version:'2012-10-17',Statement:[{Effect:'Allow',Principal:{Service:'lambda.amazonaws.com'},Action:'sts:AssumeRole'}]},Policies:[{PolicyName:'guardscale-waba-routing',PolicyDocument:{Version:'2012-10-17',Statement:[{Effect:'Allow',Action:['social-messaging:GetLinkedWhatsAppBusinessAccount','social-messaging:PutWhatsAppBusinessAccountEventDestinations'],Resource:wabaArn},{Effect:'Allow',Action:'social-messaging:GetLinkedWhatsAppBusinessAccountPhoneNumber',Resource:sub('arn:${AWS::Partition}:social-messaging:${AWS::Region}:${AWS::AccountId}:phone-number-id/*')}]}}]}};
 r.WhatsappRoutingFunction={Type:'AWS::Lambda::Function',Condition:'CreateWhatsappTopic',Properties:{Runtime:'python3.13',Handler:'index.handler',Role:get('WhatsappRoutingRole','Arn'),Timeout:90,Code:{ZipFile:code}}};
 r.WhatsappDestination={Type:'Custom::GuardScaleWhatsappDestination',Condition:'CreateWhatsappTopic',DependsOn:['WhatsappTopicPolicy','WhatsappSubscription'],Properties:{ServiceToken:get('WhatsappRoutingFunction','Arn'),ServiceTimeout:120,WabaId:ref('WhatsappBusinessAccountId'),SenderId:ref('WhatsappOriginationId'),TopicArn:ref('WhatsappTopic')}};
 for(const resource of Object.values(r))if(resource.Type==='AWS::ECS::TaskDefinition')for(const container of resource.Properties.ContainerDefinitions){
  const env=container.Environment??[];for(const entry of env)if(entry.Name==='GUARDSCALE_WHATSAPP_SNS_TOPIC_ARN')entry.Value=topic;
  if(!env.some(e=>e.Name==='GUARDSCALE_WHATSAPP_TEMPLATE_LANGUAGE'))env.push({Name:'GUARDSCALE_WHATSAPP_TEMPLATE_LANGUAGE',Value:ref('WhatsappTemplateLanguage')});
  for(const [Name,Value] of [['GUARDSCALE_EMAIL_REPLY_DOMAIN',ref('EmailReplyDomain')],['GUARDSCALE_EMAIL_REPLY_TOPIC_ARN',emailTopic]]){const existing=env.find(e=>e.Name===Name);if(existing)existing.Value=Value;else env.push({Name,Value});}
 }
 t.Outputs??={};
 for(const [key,value] of Object.entries({EmailReplyTopicArn:emailTopic,EmailReplyDomain:ref('EmailReplyDomain'),WhatsappEventTopicArn:topic,WhatsappOriginationId:ref('WhatsappOriginationId'),SesFrom:ref('SesFrom'),NotificationMode:ref('NotificationMode'),WhatsappAlertTemplate:ref('WhatsappAlertTemplate'),WhatsappTemplateLanguage:ref('WhatsappTemplateLanguage'),AwsRegion:ref('AWS::Region')}))t.Outputs[key]={Value:value};
 // Keep hand-maintained YAML layout and all unrelated infrastructure unchanged.
 let next;if(json)next=JSON.stringify(t,null,2)+'\n';else{
  next=old;for(const section of ['Parameters','Conditions','Rules','Resources','Outputs']){
   if(!new RegExp('^'+section+':','m').test(next)){next+='\n'+section+':\n'+yaml.dump(t[section],{lineWidth:120,noRefs:true}).trimEnd().split('\n').map(l=>'  '+l).join('\n')+'\n';continue;}
   const original=yaml.load(old,{schema})[section]??{};
   for(const [key,value] of Object.entries(t[section]))if(JSON.stringify(original[key])!==JSON.stringify(value)){
    const line=yaml.dump({[key]:value},{lineWidth:120,noRefs:true}).trimEnd().split('\n').map(l=>'  '+l).join('\n')+'\n';
    // Inline Conditions is rewritten as a whole, otherwise replace/add one entry.
    if(section==='Conditions'&&/^Conditions: \{/.test(next.split('\n').find(l=>l.startsWith('Conditions:'))??'')){
     next=next.replace(/^Conditions:.*$/m,'Conditions:\n'+Object.entries(t.Conditions).map(([k,v])=>'  '+k+': '+JSON.stringify(v)).join('\n'));break;
    }
    const start=next.search(new RegExp('^'+section+':','m')),tail=next.slice(start),endMatch=tail.slice(tail.indexOf('\n')+1).search(/^[A-Za-z]/m),end=endMatch<0?next.length:start+tail.indexOf('\n')+1+endMatch;
    let block=next.slice(start,end),entry=new RegExp('^  '+key+':[^\\n]*(?:\\n(?!  [A-Za-z]|[A-Za-z])[\\s\\S]*?)?(?=^  [A-Za-z]|^[A-Za-z]|$(?![\\s\\S]))','m');
    if(Object.hasOwn(original,key)){
     const lines=block.split('\n'),first=lines.findIndex(l=>l.startsWith('  '+key+':'));
     if(first<0)throw Error('Missing template entry '+key);
     let last=first+1;while(last<lines.length&&!/^  \S/.test(lines[last]))last++;
     block=lines.slice(0,first).join('\n')+'\n'+line+lines.slice(last).join('\n');
    }else block+=line;
    next=next.slice(0,start)+block+next.slice(end);
   }
  }
 }
 next=next.replace(/[ \t]+$/gm,'');
 const parsed=json?JSON.parse(next):yaml.load(next,{schema});require('node:assert/strict').deepEqual(parsed,t,'Generated template mismatch: '+name);
 if(old!==next)execFileSync('apply_patch',[],{input:'*** Begin Patch\n*** Update File: '+file+'\n@@\n'+old.trimEnd().split('\n').map(l=>'-'+l).join('\n')+'\n'+next.trimEnd().split('\n').map(l=>'+'+l).join('\n')+'\n*** End Patch\n'});
}
