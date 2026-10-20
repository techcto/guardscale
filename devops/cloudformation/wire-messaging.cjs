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
 const topic=choose('CreateWhatsappTopic',ref('WhatsappTopic'),ref('WhatsappEventTopicArn'));
 const r=t.Resources;
 r.WhatsappTopic={Type:'AWS::SNS::Topic',Condition:'CreateWhatsappTopic'};
 r.WhatsappTopicPolicy={Type:'AWS::SNS::TopicPolicy',Condition:'CreateWhatsappTopic',Properties:{Topics:[ref('WhatsappTopic')],PolicyDocument:{Version:'2012-10-17',Statement:[{Effect:'Allow',Principal:{Service:'social-messaging.amazonaws.com'},Action:'sns:Publish',Resource:ref('WhatsappTopic'),Condition:{StringEquals:{'aws:SourceAccount':ref('AWS::AccountId')},ArnLike:{'aws:SourceArn':sub('arn:${AWS::Partition}:social-messaging:${AWS::Region}:${AWS::AccountId}:*')}}}]}}};
 r.WhatsappQueuePolicy.Properties.PolicyDocument.Statement[0].Condition={ArnEquals:{'aws:SourceArn':topic}};
 r.WhatsappSubscription.Properties.TopicArn=topic;
 r.WhatsappSubscription.DependsOn=['WhatsappQueuePolicy'];
 r.WhatsappRoutingRole={Type:'AWS::IAM::Role',Condition:'CreateWhatsappTopic',Properties:{AssumeRolePolicyDocument:{Version:'2012-10-17',Statement:[{Effect:'Allow',Principal:{Service:'lambda.amazonaws.com'},Action:'sts:AssumeRole'}]},Policies:[{PolicyName:'guardscale-waba-routing',PolicyDocument:{Version:'2012-10-17',Statement:[{Effect:'Allow',Action:['social-messaging:GetLinkedWhatsAppBusinessAccount','social-messaging:PutWhatsAppBusinessAccountEventDestinations'],Resource:wabaArn},{Effect:'Allow',Action:'social-messaging:GetLinkedWhatsAppBusinessAccountPhoneNumber',Resource:sub('arn:${AWS::Partition}:social-messaging:${AWS::Region}:${AWS::AccountId}:phone-number-id/*')}]}}]}};
 r.WhatsappRoutingFunction={Type:'AWS::Lambda::Function',Condition:'CreateWhatsappTopic',Properties:{Runtime:'python3.13',Handler:'index.handler',Role:get('WhatsappRoutingRole','Arn'),Timeout:90,Code:{ZipFile:code}}};
 r.WhatsappDestination={Type:'Custom::GuardScaleWhatsappDestination',Condition:'CreateWhatsappTopic',DependsOn:['WhatsappTopicPolicy','WhatsappSubscription'],Properties:{ServiceToken:get('WhatsappRoutingFunction','Arn'),ServiceTimeout:120,WabaId:ref('WhatsappBusinessAccountId'),SenderId:ref('WhatsappOriginationId'),TopicArn:ref('WhatsappTopic')}};
 for(const resource of Object.values(r))if(resource.Type==='AWS::ECS::TaskDefinition')for(const container of resource.Properties.ContainerDefinitions){
  const env=container.Environment??[];for(const entry of env)if(entry.Name==='GUARDSCALE_WHATSAPP_SNS_TOPIC_ARN')entry.Value=topic;
  if(!env.some(e=>e.Name==='GUARDSCALE_WHATSAPP_TEMPLATE_LANGUAGE'))env.push({Name:'GUARDSCALE_WHATSAPP_TEMPLATE_LANGUAGE',Value:ref('WhatsappTemplateLanguage')});
 }
 t.Outputs??={};
 for(const [key,value] of Object.entries({WhatsappEventTopicArn:topic,WhatsappOriginationId:ref('WhatsappOriginationId'),SesFrom:ref('SesFrom'),NotificationMode:ref('NotificationMode'),WhatsappAlertTemplate:ref('WhatsappAlertTemplate'),WhatsappTemplateLanguage:ref('WhatsappTemplateLanguage'),AwsRegion:ref('AWS::Region')}))t.Outputs[key]={Value:value};
 // Keep hand-maintained YAML layout and all unrelated infrastructure unchanged.
 let next;if(json)next=JSON.stringify(t,null,2)+'\n';else{
  next=old;for(const section of ['Parameters','Conditions','Resources','Outputs']){
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
