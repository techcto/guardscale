// Resources are embedded into the main installation templates, not a separate stack.
const fs=require('node:fs'),path=require('node:path');
module.exports=({ref,get,sub,choose})=>{
 const managed='CreateManagedEmailReplies',createSet='CreateEmailReplyRuleSet';
 const stackId={'Fn::Select':[2,{'Fn::Split':['/',ref('AWS::StackId')]}]};
 const suffix={'Fn::Select':[0,{'Fn::Split':['-',stackId]}]};
 const ruleName={'Fn::Sub':['guardscale-${Id}-commands',{Id:suffix}]};
 const ruleSet=choose(createSet,ref('EmailReplyRuleSet'),ref('EmailReplyExistingRuleSetName'));
 return {
  EmailReplyDns:{Type:'AWS::Route53::RecordSet',Condition:managed,Properties:{HostedZoneId:ref('EmailReplyHostedZoneId'),Name:ref('EmailReplyDomain'),Type:'MX',TTL:'300',ResourceRecords:[sub('10 inbound-smtp.${AWS::Region}.amazonaws.com')]}},
  EmailReplyKey:{Type:'AWS::KMS::Key',Condition:managed,Properties:{EnableKeyRotation:true,PendingWindowInDays:7,Tags:[{Key:'Application',Value:'guardscale'}],KeyPolicy:{Version:'2012-10-17',Statement:[{Effect:'Allow',Principal:{AWS:sub('arn:${AWS::Partition}:iam::${AWS::AccountId}:root')},Action:'kms:*',Resource:'*'},{Effect:'Allow',Principal:{Service:'ses.amazonaws.com'},Action:['kms:GenerateDataKey','kms:Decrypt'],Resource:'*',Condition:{StringEquals:{'aws:SourceAccount':ref('AWS::AccountId')}}}]}}},
  EmailReplyTopic:{Type:'AWS::SNS::Topic',Condition:managed,Properties:{KmsMasterKeyId:ref('EmailReplyKey'),Tags:[{Key:'Application',Value:'guardscale'}]}},
  EmailReplyTopicPolicy:{Type:'AWS::SNS::TopicPolicy',Condition:managed,Properties:{Topics:[ref('EmailReplyTopic')],PolicyDocument:{Version:'2012-10-17',Statement:[{Effect:'Allow',Principal:{Service:'ses.amazonaws.com'},Action:'sns:Publish',Resource:ref('EmailReplyTopic'),Condition:{StringEquals:{'aws:SourceAccount':ref('AWS::AccountId')},ArnEquals:{'aws:SourceArn':{'Fn::Sub':['arn:${AWS::Partition}:ses:${AWS::Region}:${AWS::AccountId}:receipt-rule-set/${RuleSet}:receipt-rule/${Rule}',{RuleSet:ruleSet,Rule:ruleName}]}}}}]}}},
  EmailReplyRuleSet:{Type:'AWS::SES::ReceiptRuleSet',Condition:createSet,Properties:{RuleSetName:{'Fn::Sub':['guardscale-${Id}',{Id:stackId}]}}},
  EmailReplyRule:{Type:'AWS::SES::ReceiptRule',Condition:managed,DependsOn:['EmailReplyTopicPolicy','EmailReplyDns'],Properties:{RuleSetName:ruleSet,Rule:{Name:ruleName,Enabled:true,ScanEnabled:true,TlsPolicy:'Require',Recipients:[ref('EmailReplyDomain')],Actions:[{SNSAction:{TopicArn:ref('EmailReplyTopic'),Encoding:'Base64'}}]}}},
  EmailReplyActivationRole:{Type:'AWS::IAM::Role',Condition:createSet,Properties:{AssumeRolePolicyDocument:{Version:'2012-10-17',Statement:[{Effect:'Allow',Principal:{Service:'lambda.amazonaws.com'},Action:'sts:AssumeRole'}]},Policies:[{PolicyName:'guarded-email-receiving-activation',PolicyDocument:{Version:'2012-10-17',Statement:[{Effect:'Allow',Action:['ses:DescribeActiveReceiptRuleSet','ses:SetActiveReceiptRuleSet'],Resource:'*'},{Effect:'Allow',Action:['logs:CreateLogStream','logs:PutLogEvents'],Resource:get('LogGroup','Arn')}]}}]}},
  EmailReplyActivationFunction:{Type:'AWS::Lambda::Function',Condition:createSet,Properties:{Runtime:'python3.13',Handler:'index.handler',Role:get('EmailReplyActivationRole','Arn'),Timeout:90,LoggingConfig:{LogGroup:ref('LogGroup'),LogFormat:'JSON'},Code:{ZipFile:fs.readFileSync(path.join(__dirname,'email-rule-activation.py'),'utf8')}}},
  ActivateEmailReplyRules:{Type:'Custom::GuardScaleEmailRuleActivation',Condition:createSet,DependsOn:'EmailReplyRule',Properties:{ServiceToken:get('EmailReplyActivationFunction','Arn'),ServiceTimeout:120,RuleSetName:ruleSet}}
 };
};
