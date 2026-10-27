import{randomUUID}from'node:crypto';
import{DynamoDBClient,CreateTableCommand,UpdateTimeToLiveCommand}from'@aws-sdk/client-dynamodb';
import{DynamoDBDocumentClient,GetCommand,PutCommand,QueryCommand,DeleteCommand,UpdateCommand,TransactWriteCommand}from'@aws-sdk/lib-dynamodb';
import type{GuardScaleEvent,GuardScaleUser,IncidentRecord,Node,OrgMembership,Organization,OrgType,Product,Settings,Subscription,UsageCounts,UsageDelta,UsageHour}from'./model';
import{defaultSettings,whatsappSetupAuditId}from'./model';
import {hasPaidEntitlement} from './subscription-entitlement';
import pricing from './billing-pricing.json';

const tableName=process.env.GUARDSCALE_TABLE??'guardscale-local';
const client=DynamoDBDocumentClient.from(new DynamoDBClient({endpoint:process.env.GUARDSCALE_DYNAMODB_ENDPOINT}),{marshallOptions:{removeUndefinedValues:true}});

// Only a local DynamoDB table is ever created by the app; AWS tables and indexes stay CloudFormation-managed.
export function isLocalDynamoEndpoint(endpoint=process.env.GUARDSCALE_DYNAMODB_ENDPOINT){
  try{return ['localhost','127.0.0.1','[::1]','dynamodb','database'].includes(new URL(endpoint??'').hostname)}catch{return false}
}
let tableReady:Promise<void>|null=null;
function ensureTable(){
  if(!isLocalDynamoEndpoint())return Promise.resolve();
  if(!tableReady)tableReady=(async()=>{
    try{
      await client.send(new CreateTableCommand({
        TableName:tableName,
        BillingMode:'PAY_PER_REQUEST',
        AttributeDefinitions:[{AttributeName:'pk',AttributeType:'S'},{AttributeName:'sk',AttributeType:'S'},{AttributeName:'gsi1pk',AttributeType:'S'},{AttributeName:'gsi1sk',AttributeType:'S'}],
        KeySchema:[{AttributeName:'pk',KeyType:'HASH'},{AttributeName:'sk',KeyType:'RANGE'}],
        GlobalSecondaryIndexes:[{IndexName:'GSI1',KeySchema:[{AttributeName:'gsi1pk',KeyType:'HASH'},{AttributeName:'gsi1sk',KeyType:'RANGE'}],Projection:{ProjectionType:'ALL'}}],
      }));
      await client.send(new UpdateTimeToLiveCommand({TableName:tableName,TimeToLiveSpecification:{AttributeName:'ttl',Enabled:true}})).catch(()=>{});
    }catch(error){if(!(error instanceof Error&&error.name==='ResourceInUseException'))throw error}
  })();
  return tableReady;
}

// Usage counters are flat attributes so one UpdateItem can ADD to them: serverHours, logBytes, ai#<model>#<field>, exported#<meter>.
const aiFields=['calls','inputTokens','outputTokens','unknownCalls'] as const;
function usageAdds(delta:UsageDelta){
  const adds:[string,number][]=[];
  if(delta.serverHours)adds.push(['serverHours',delta.serverHours]);
  if(delta.logBytes)adds.push(['logBytes',delta.logBytes]);
  if(delta.ai)for(const f of aiFields)if(delta.ai[f])adds.push([`ai#${delta.ai.model}#${f}`,delta.ai[f]!]);
  return{expression:'ADD '+adds.map((_,i)=>`#a${i} :a${i}`).join(', '),names:Object.fromEntries(adds.map(([n],i)=>[`#a${i}`,n])),values:Object.fromEntries(adds.map(([,v],i)=>[`:a${i}`,v]))};
}
function usageCounts(item:Record<string,unknown>|undefined):UsageCounts{
  const counts:UsageCounts={serverHours:Number(item?.serverHours??0),logBytes:Number(item?.logBytes??0),ai:{}};
  for(const [name,value] of Object.entries(item??{})){const m=/^ai#(.+)#(calls|inputTokens|outputTokens|unknownCalls)$/.exec(name);if(m)(counts.ai[m[1]]??={calls:0,inputTokens:0,outputTokens:0,unknownCalls:0})[m[2] as typeof aiFields[number]]=Number(value)}
  return counts;
}

function slugify(name:string){return name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')||randomUUID().slice(0,8)}
const SINGLETON_PK='SINGLETON',SINGLETON_SK='SINGLETON';

export const dynamoStore={
  async createOrganization(v:{name:string;ownerId:string;orgType:OrgType;contactEmail?:string;contactPhone?:string}):Promise<Organization>{
    await ensureTable();
    const org:Organization={id:randomUUID(),name:v.name,slug:`${slugify(v.name)}-${randomUUID().slice(0,6)}`,ownerId:v.ownerId,orgType:v.orgType,contactEmail:v.contactEmail,contactPhone:v.contactPhone,enrollmentToken:randomUUID(),createdAt:new Date().toISOString()};
    await client.send(new PutCommand({TableName:tableName,Item:{pk:`ORG#${org.id}`,sk:`ORG#${org.id}`,gsi1pk:'ORG',gsi1sk:`${org.createdAt}#${org.id}`,...org}}));
    return org;
  },
  async ensureSingleDeploymentOrg():Promise<Organization>{
    await ensureTable();
    const pointer=await client.send(new GetCommand({TableName:tableName,Key:{pk:SINGLETON_PK,sk:SINGLETON_SK}}));
    if(pointer.Item?.orgId){const org=await dynamoStore.organizationById(pointer.Item.orgId as string);if(org)return org}
    const org=await dynamoStore.createOrganization({name:'GuardScale',ownerId:'',orgType:'business'});
    await client.send(new PutCommand({TableName:tableName,Item:{pk:SINGLETON_PK,sk:SINGLETON_SK,orgId:org.id},ConditionExpression:'attribute_not_exists(pk)'})).catch(async(error)=>{if(!(error instanceof Error&&error.name==='ConditionalCheckFailedException'))throw error});
    const final=await client.send(new GetCommand({TableName:tableName,Key:{pk:SINGLETON_PK,sk:SINGLETON_SK}}));
    const finalOrg=await dynamoStore.organizationById(final.Item?.orgId as string);
    return finalOrg??org;
  },
  async singleDeploymentOrgId():Promise<string|null>{
    await ensureTable();
    const pointer=await client.send(new GetCommand({TableName:tableName,Key:{pk:SINGLETON_PK,sk:SINGLETON_SK},ConsistentRead:true}));
    return typeof pointer.Item?.orgId==='string'?pointer.Item.orgId:null;
  },
  async organizationById(id:string):Promise<Organization|null>{
    await ensureTable();
    const r=await client.send(new GetCommand({TableName:tableName,Key:{pk:`ORG#${id}`,sk:`ORG#${id}`}}));
    return (r.Item as Organization)??null;
  },
  async organizations():Promise<Organization[]>{
    await ensureTable();
    const rows:Organization[]=[];let cursor:Record<string,unknown>|undefined;
    do{const r=await client.send(new QueryCommand({TableName:tableName,IndexName:'GSI1',KeyConditionExpression:'gsi1pk=:pk',ExpressionAttributeValues:{':pk':'ORG'},ExclusiveStartKey:cursor}));rows.push(...(r.Items??[]) as Organization[]);cursor=r.LastEvaluatedKey}while(cursor);
    return rows;
  },
  async putOrganization(v:Organization){
    await ensureTable();
    await client.send(new PutCommand({TableName:tableName,Item:{pk:`ORG#${v.id}`,sk:`ORG#${v.id}`,gsi1pk:'ORG',gsi1sk:`${v.createdAt}#${v.id}`,...v}}));
  },
  // Sweeps the whole ORG# partition, so record types added later are covered too. Memberships go first to cut access
  // immediately; the organization row goes last so an interrupted run stays listed and can be retried.
  async deleteOrganization(id:string):Promise<boolean>{
    await ensureTable();
    const sweep=async(pk:string)=>{
      const items:Record<string,string>[]=[];let start:Record<string,unknown>|undefined;
      do{const r=await client.send(new QueryCommand({TableName:tableName,KeyConditionExpression:'pk=:pk',ExpressionAttributeValues:{':pk':pk},ProjectionExpression:'pk,sk,serverId',ExclusiveStartKey:start,ConsistentRead:true}));items.push(...(r.Items??[]) as Record<string,string>[]);start=r.LastEvaluatedKey}while(start);
      return items;
    };
    const rank=(sk:string)=>sk.startsWith('MEMBER#')?0:sk===`ORG#${id}`?2:1;
    const items=(await sweep(`ORG#${id}`)).sort((a,b)=>rank(a.sk)-rank(b.sk));
    if(!items.some(v=>v.sk===`ORG#${id}`))return false;
    // The WhatsApp setup audit is stored as events of a pseudo-server without a NODE# record.
    for(const event of await sweep(`ORG#${id}#NODE#${whatsappSetupAuditId}`))await client.send(new DeleteCommand({TableName:tableName,Key:{pk:event.pk,sk:event.sk}}));
    for(const item of items){
      if(item.sk.startsWith('NODE#'))for(const event of await sweep(`ORG#${id}#NODE#${item.serverId}`))await client.send(new DeleteCommand({TableName:tableName,Key:{pk:event.pk,sk:event.sk}}));
      await client.send(new DeleteCommand({TableName:tableName,Key:{pk:item.pk,sk:item.sk}}));
    }
    return true;
  },
  async putMembership(v:OrgMembership){
    await ensureTable();
    await client.send(new PutCommand({TableName:tableName,Item:{pk:`ORG#${v.orgId}`,sk:`MEMBER#${v.userId}`,gsi1pk:`USER#${v.userId}`,gsi1sk:`MEMBERSHIP#${v.orgId}`,...v}}));
  },
  async membership(orgId:string,userId:string):Promise<OrgMembership|null>{
    await ensureTable();
    const r=await client.send(new GetCommand({TableName:tableName,Key:{pk:`ORG#${orgId}`,sk:`MEMBER#${userId}`}}));
    return (r.Item as OrgMembership)??null;
  },
  async membersOfOrg(orgId:string):Promise<{membership:OrgMembership;user:GuardScaleUser}[]>{
    await ensureTable();
    const r=await client.send(new QueryCommand({TableName:tableName,KeyConditionExpression:'pk=:pk AND begins_with(sk,:prefix)',ExpressionAttributeValues:{':pk':`ORG#${orgId}`,':prefix':'MEMBER#'}}));
    const memberships=(r.Items??[]) as OrgMembership[];
    const users=await Promise.all(memberships.map(m=>dynamoStore.userById(m.userId)));
    return memberships.map((membership,i)=>({membership,user:users[i]})).filter((x):x is{membership:OrgMembership;user:GuardScaleUser}=>!!x.user);
  },
  async orgsForUser(userId:string):Promise<{membership:OrgMembership;org:Organization}[]>{
    await ensureTable();
    const r=await client.send(new QueryCommand({TableName:tableName,IndexName:'GSI1',KeyConditionExpression:'gsi1pk=:pk AND begins_with(gsi1sk,:prefix)',ExpressionAttributeValues:{':pk':`USER#${userId}`,':prefix':'MEMBERSHIP#'}}));
    const memberships=(r.Items??[]) as OrgMembership[];
    const orgs=await Promise.all(memberships.map(m=>dynamoStore.organizationById(m.orgId)));
    return memberships.map((membership,i)=>({membership,org:orgs[i]})).filter((x):x is{membership:OrgMembership;org:Organization}=>!!x.org);
  },
  async deleteMembership(orgId:string,userId:string){
    await ensureTable();
    await client.send(new DeleteCommand({TableName:tableName,Key:{pk:`ORG#${orgId}`,sk:`MEMBER#${userId}`}}));
    return true;
  },
  async upsertNode(v:Node){
    await ensureTable();
    const fields=Object.entries(v).filter(([name,value])=>name!=='websiteUrls'&&value!==undefined);
    await client.send(new UpdateCommand({TableName:tableName,Key:{pk:`ORG#${v.tenantId}`,sk:`NODE#${v.serverId}`},UpdateExpression:'SET '+fields.map((_,i)=>`#f${i}=:v${i}`).join(', '),ExpressionAttributeNames:Object.fromEntries(fields.map(([name],i)=>[`#f${i}`,name])),ExpressionAttributeValues:Object.fromEntries(fields.map(([,value],i)=>[`:v${i}`,value])),ConditionExpression:'attribute_not_exists(deletedAt)'}));
  },
  async setNodeWebsites(tenant:string,serverId:string,websiteUrls:string[]){
    await ensureTable();await client.send(new UpdateCommand({TableName:tableName,Key:{pk:`ORG#${tenant}`,sk:`NODE#${serverId}`},UpdateExpression:'SET websiteUrls=:urls',ExpressionAttributeValues:{':urls':websiteUrls},ConditionExpression:'attribute_exists(pk) AND attribute_not_exists(deletedAt)'}));
  },
  async nodes(tenant:string):Promise<Node[]>{
    await ensureTable();
    const rows:Node[]=[];let cursor:Record<string,unknown>|undefined;
    do{const r=await client.send(new QueryCommand({TableName:tableName,KeyConditionExpression:'pk=:pk AND begins_with(sk,:prefix)',ExpressionAttributeValues:{':pk':`ORG#${tenant}`,':prefix':'NODE#'},ExclusiveStartKey:cursor}));rows.push(...((r.Items??[]) as Node[]).filter(n=>!n.deletedAt));cursor=r.LastEvaluatedKey}while(cursor);
    return rows;
  },
  async nodeRecord(tenant:string,serverId:string):Promise<Node|null>{
    await ensureTable();
    const r=await client.send(new GetCommand({TableName:tableName,Key:{pk:`ORG#${tenant}`,sk:`NODE#${serverId}`},ConsistentRead:true}));
    return (r.Item as Node)??null;
  },
  async node(tenant:string,serverId:string):Promise<Node|null>{const node=await dynamoStore.nodeRecord(tenant,serverId);return node&&!node.deletedAt?node:null},
  async retireNode(tenant:string,serverId:string){await ensureTable();await client.send(new UpdateCommand({TableName:tableName,Key:{pk:`ORG#${tenant}`,sk:`NODE#${serverId}`},UpdateExpression:'SET deletedAt=:at, #status=:status',ExpressionAttributeNames:{'#status':'status'},ExpressionAttributeValues:{':at':new Date().toISOString(),':status':'offline'},ConditionExpression:'attribute_exists(pk)'}));return true},
  async purgeCollectedData(tenant:string){
    await ensureTable();const cutoff=new Date().toISOString();let events=0,incidents=0;
    let cursor:Record<string,unknown>|undefined;
    do{
      const page=await client.send(new QueryCommand({TableName:tableName,KeyConditionExpression:'pk=:pk',ExpressionAttributeValues:{':pk':`ORG#${tenant}`},ExclusiveStartKey:cursor,ConsistentRead:true}));
      for(const row of page.Items??[]){
        if(String(row.sk).startsWith('INCIDENT#')&&String(row.updatedAt)<=cutoff){await client.send(new DeleteCommand({TableName:tableName,Key:{pk:row.pk,sk:row.sk},ConditionExpression:'updatedAt=:at',ExpressionAttributeValues:{':at':row.updatedAt}})).then(()=>incidents++).catch(error=>{if(error.name!=='ConditionalCheckFailedException')throw error})}
        if(String(row.sk).startsWith('NODE#')){
          let eventCursor:Record<string,unknown>|undefined;
          do{const batch=await client.send(new QueryCommand({TableName:tableName,KeyConditionExpression:'pk=:pk AND sk BETWEEN :start AND :end',ExpressionAttributeValues:{':pk':`ORG#${tenant}#NODE#${row.serverId}`,':start':'EVENT#',':end':`EVENT#${cutoff}#\uffff`},ExclusiveStartKey:eventCursor,ConsistentRead:true}));for(const event of batch.Items??[]){await client.send(new DeleteCommand({TableName:tableName,Key:{pk:event.pk,sk:event.sk}}));events++}eventCursor=batch.LastEvaluatedKey}while(eventCursor);
        }
      }
      cursor=page.LastEvaluatedKey;
    }while(cursor);
    // Setup verification has no enrolled node record, but privacy purge must include its audit.
    let auditCursor:Record<string,unknown>|undefined;
    do{
      const batch=await client.send(new QueryCommand({TableName:tableName,KeyConditionExpression:'pk=:pk AND sk BETWEEN :start AND :end',ExpressionAttributeValues:{':pk':`ORG#${tenant}#NODE#${whatsappSetupAuditId}`,':start':'EVENT#',':end':`EVENT#${cutoff}#\uffff`},ExclusiveStartKey:auditCursor,ConsistentRead:true}));
      for(const event of batch.Items??[]){await client.send(new DeleteCommand({TableName:tableName,Key:{pk:event.pk,sk:event.sk}}));events++}
      auditCursor=batch.LastEvaluatedKey;
    }while(auditCursor);
    return{events,incidents};
  },
  async putIncident(v:IncidentRecord){
    await ensureTable();
    await client.send(new PutCommand({TableName:tableName,Item:{pk:`ORG#${v.tenantId}`,sk:`INCIDENT#${v.incidentId}`,...v}}));
  },
  async incident(tenant:string,incidentId:string):Promise<IncidentRecord|null>{
    await ensureTable();
    const r=await client.send(new GetCommand({TableName:tableName,Key:{pk:`ORG#${tenant}`,sk:`INCIDENT#${incidentId}`}}));
    return (r.Item as IncidentRecord)??null;
  },
  async incidents(tenant:string):Promise<IncidentRecord[]>{
    await ensureTable();const items:IncidentRecord[]=[];let cursor:Record<string,unknown>|undefined;
    do{const r=await client.send(new QueryCommand({TableName:tableName,KeyConditionExpression:'pk=:pk AND begins_with(sk,:prefix)',ExpressionAttributeValues:{':pk':`ORG#${tenant}`,':prefix':'INCIDENT#'},ExclusiveStartKey:cursor}));items.push(...(r.Items??[]) as IncidentRecord[]);cursor=r.LastEvaluatedKey;}while(cursor);
    return items.sort((a,b)=>b.startedAt.localeCompare(a.startedAt)||a.incidentId.localeCompare(b.incidentId));
  },
  async incidentsForNode(tenant:string,serverId:string):Promise<IncidentRecord[]>{
    return (await this.incidents(tenant)).filter(i=>i.serverId===serverId);
  },
  // Returns false when an event with the same ID was already stored, so agent retries are not counted twice.
  async putEvent(v:GuardScaleEvent){
    await ensureTable();
    const ttl=Math.floor(Date.now()/1000)+7*24*60*60;
    try{await client.send(new PutCommand({TableName:tableName,Item:{pk:`ORG#${v.tenantId}#NODE#${v.serverId}`,sk:`EVENT#${v.at}#${v.id??randomUUID()}`,ttl,...v},...(v.id?{ConditionExpression:'attribute_not_exists(sk)'}:{})}));return true}
    catch(error){if(error instanceof Error&&error.name==='ConditionalCheckFailedException')return false;throw error}
  },
  async eventsForNode(tenant:string,serverId:string,limit=200):Promise<GuardScaleEvent[]>{
    await ensureTable();
    const r=await client.send(new QueryCommand({TableName:tableName,KeyConditionExpression:'pk=:pk AND begins_with(sk,:prefix)',ExpressionAttributeValues:{':pk':`ORG#${tenant}#NODE#${serverId}`,':prefix':'EVENT#'},ScanIndexForward:false,Limit:limit}));
    return (r.Items??[]) as GuardScaleEvent[];
  },
  async userByName(username:string):Promise<GuardScaleUser|null>{
    await ensureTable();
    const r=await client.send(new QueryCommand({TableName:tableName,IndexName:'GSI1',KeyConditionExpression:'gsi1pk=:pk',ExpressionAttributeValues:{':pk':`USERNAME#${username.toLowerCase()}`}}));
    return (r.Items?.[0] as GuardScaleUser)??null;
  },
  // The EMAIL# claim and the user are written in one transaction, so two signups racing for an address cannot both win.
  async createUser(v:GuardScaleUser,passwordHash:string):Promise<boolean>{
    await ensureTable();
    const email=v.email?.toLowerCase();
    try{
      await client.send(new TransactWriteCommand({TransactItems:[
        {Put:{TableName:tableName,Item:{pk:`USER#${v.id}`,sk:`USER#${v.id}`,gsi1pk:`USERNAME#${v.username.toLowerCase()}`,gsi1sk:`USERNAME#${v.username.toLowerCase()}`,...v},ConditionExpression:'attribute_not_exists(pk)'}},
        {Put:{TableName:tableName,Item:{pk:`USER#${v.id}`,sk:'PASSWORD',hash:passwordHash}}},
        ...(email?[{Put:{TableName:tableName,Item:{pk:`EMAIL#${email}`,sk:`EMAIL#${email}`,userId:v.id},ConditionExpression:'attribute_not_exists(pk)'}}]:[]),
      ]}));
      return true;
    }catch(e){if(e instanceof Error&&e.name==='TransactionCanceledException'&&/ConditionalCheckFailed/.test(e.message))return false;throw e}
  },
  async userById(id:string):Promise<GuardScaleUser|null>{
    await ensureTable();
    const r=await client.send(new GetCommand({TableName:tableName,Key:{pk:`USER#${id}`,sk:`USER#${id}`}}));
    return (r.Item as GuardScaleUser)??null;
  },
  async reserveVerificationEmail(id:string,email:string,sentAt:string,cutoff:string){await ensureTable();try{await client.send(new UpdateCommand({TableName:tableName,Key:{pk:`USER#${id}`,sk:`USER#${id}`},UpdateExpression:'SET verificationSentAt=:sent',ConditionExpression:'email=:email AND emailVerified=:no AND (attribute_not_exists(verificationSentAt) OR verificationSentAt<=:cutoff)',ExpressionAttributeValues:{':email':email,':no':false,':sent':sentAt,':cutoff':cutoff}}));return true;}catch(e){if(e instanceof Error&&e.name==='ConditionalCheckFailedException')return false;throw e;}},
  async releaseVerificationEmail(id:string,sentAt:string){await ensureTable();try{await client.send(new UpdateCommand({TableName:tableName,Key:{pk:`USER#${id}`,sk:`USER#${id}`},UpdateExpression:'REMOVE verificationSentAt',ConditionExpression:'verificationSentAt=:sent',ExpressionAttributeValues:{':sent':sentAt}}));}catch(e){if(!(e instanceof Error&&e.name==='ConditionalCheckFailedException'))throw e;}},
  async verifyUserEmail(id:string,email:string){await ensureTable();try{await client.send(new UpdateCommand({TableName:tableName,Key:{pk:`USER#${id}`,sk:`USER#${id}`},UpdateExpression:'SET emailVerified=:yes, updatedAt=:now',ConditionExpression:'email=:email AND emailVerified=:no AND #status=:active',ExpressionAttributeNames:{'#status':'status'},ExpressionAttributeValues:{':email':email,':no':false,':yes':true,':active':'active',':now':new Date().toISOString()}}));return true;}catch(e){if(e instanceof Error&&e.name==='ConditionalCheckFailedException')return false;throw e;}},
  async putUser(v:GuardScaleUser,passwordHash?:string){
    await ensureTable();
    await client.send(new PutCommand({TableName:tableName,Item:{pk:`USER#${v.id}`,sk:`USER#${v.id}`,gsi1pk:`USERNAME#${v.username.toLowerCase()}`,gsi1sk:`USERNAME#${v.username.toLowerCase()}`,...v}}));
    if(passwordHash)await client.send(new PutCommand({TableName:tableName,Item:{pk:`USER#${v.id}`,sk:'PASSWORD',hash:passwordHash}}));
  },
  async password(id:string):Promise<string|null>{
    await ensureTable();
    const r=await client.send(new GetCommand({TableName:tableName,Key:{pk:`USER#${id}`,sk:'PASSWORD'}}));
    return (r.Item?.hash as string)??null;
  },
  async deleteUser(id:string):Promise<boolean>{
    await ensureTable();
    const existing=await client.send(new GetCommand({TableName:tableName,Key:{pk:`USER#${id}`,sk:`USER#${id}`}}));
    if(!existing.Item)return false;
    await client.send(new DeleteCommand({TableName:tableName,Key:{pk:`USER#${id}`,sk:`USER#${id}`}}));
    await client.send(new DeleteCommand({TableName:tableName,Key:{pk:`USER#${id}`,sk:'PASSWORD'}}));
    // Release the address only if this user still holds it.
    const email=(existing.Item.email as string|undefined)?.toLowerCase();
    if(email)await client.send(new DeleteCommand({TableName:tableName,Key:{pk:`EMAIL#${email}`,sk:`EMAIL#${email}`},ConditionExpression:'userId=:id',ExpressionAttributeValues:{':id':id}})).catch(e=>{if(!(e instanceof Error&&e.name==='ConditionalCheckFailedException'))throw e});
    return true;
  },
  async settings(tenant:string):Promise<Settings>{
    await ensureTable();
    const r=await client.send(new GetCommand({TableName:tableName,Key:{pk:`ORG#${tenant}`,sk:'SETTINGS'}}));
    return (r.Item as Settings)??defaultSettings(tenant);
  },
  async putSettings(tenant:string,v:Settings){
    await ensureTable();
    await client.send(new PutCommand({TableName:tableName,Item:{pk:`ORG#${tenant}`,sk:'SETTINGS',...v}}));
  },
  async products():Promise<Product[]>{
    return[{id:'dev',name:pricing.planNames.dev,description:'Free tier for a single personal workspace.',stripePriceId:'',monthlyPrice:0,serverLimit:pricing.includedServers.dev,logMbIncluded:1000,aiCreditsIncluded:pricing.includedAiCredits.dev,active:true},{id:'starter',name:pricing.planNames.starter,description:'Detection and alerting for a small server fleet.',stripePriceId:process.env.STRIPE_STARTER_PRICE_ID??'',monthlyPrice:49,serverLimit:pricing.includedServers.starter,logMbIncluded:10000,aiCreditsIncluded:pricing.includedAiCredits.starter,active:true},{id:'scale',name:pricing.planNames.scale,description:'Response automation and expanded infrastructure coverage.',stripePriceId:process.env.STRIPE_SCALE_PRICE_ID??'',monthlyPrice:199,serverLimit:pricing.includedServers.scale,logMbIncluded:100000,aiCreditsIncluded:pricing.includedAiCredits.scale,active:true}];
  },
  async subscriptions(orgId:string):Promise<Subscription[]>{
    await ensureTable();
    const r=await client.send(new QueryCommand({TableName:tableName,KeyConditionExpression:'pk=:pk AND begins_with(sk,:prefix)',ExpressionAttributeValues:{':pk':`ORG#${orgId}`,':prefix':'SUBSCRIPTION#'}}));
    return (r.Items??[]) as Subscription[];
  },
  async activeSubscriptionForOrg(orgId:string):Promise<Subscription|null>{
    const rows=await dynamoStore.subscriptions(orgId);
    const active=rows.filter(hasPaidEntitlement);
    return active.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0]??null;
  },
  async putSubscription(v:Subscription){
    await ensureTable();
    await client.send(new PutCommand({TableName:tableName,Item:{pk:`ORG#${v.orgId}`,sk:`SUBSCRIPTION#${v.id}`,...v}}));
  },
  // The hour and billing-period counters change in one transaction, so quota checks and Stripe export always agree.
  // With a claim key, the change applies only once per key (e.g. one server-hour per server); returns false when already claimed.
  async addUsage(orgId:string,periodStart:string,hour:string,delta:UsageDelta,billable:boolean,claim?:string){
    await ensureTable();
    const add=usageAdds(delta),pk=`ORG#${orgId}`;if(add.expression==='ADD ')return false;
    const hourSet={names:{'#period':'periodStart',...(billable?{'#billable':'billable'}:{})},values:{':period':periodStart,...(billable?{':true':true}:{})}};
    try{await client.send(new TransactWriteCommand({TransactItems:[
      ...(claim?[{Put:{TableName:tableName,Item:{pk,sk:`CLAIM#${claim}`,createdAt:new Date().toISOString(),ttl:Math.floor(Date.now()/1000)+40*86400},ConditionExpression:'attribute_not_exists(sk)'}}]:[]),
      {Update:{TableName:tableName,Key:{pk,sk:`USAGE#H#${hour}#${periodStart}`},UpdateExpression:'SET #period=:period'+(billable?', #billable=:true ':' ')+add.expression,ExpressionAttributeNames:{...add.names,...hourSet.names},ExpressionAttributeValues:{...add.values,...hourSet.values}}},
      {Update:{TableName:tableName,Key:{pk,sk:`USAGE#P#${periodStart}`},UpdateExpression:add.expression,ExpressionAttributeNames:add.names,ExpressionAttributeValues:add.values}},
    ]}));return true}
    catch(error){if(claim&&error instanceof Error&&error.name==='TransactionCanceledException'&&/ConditionalCheckFailed/.test(error.message))return false;throw error}
  },
  async usageTotals(orgId:string,periodStart:string):Promise<UsageCounts>{
    await ensureTable();
    return usageCounts((await client.send(new GetCommand({TableName:tableName,Key:{pk:`ORG#${orgId}`,sk:`USAGE#P#${periodStart}`}}))).Item);
  },
  async usageHours(orgId:string,fromHour:string):Promise<UsageHour[]>{
    await ensureTable();
    const items:Record<string,unknown>[]=[];let start:Record<string,unknown>|undefined;
    do{const r=await client.send(new QueryCommand({TableName:tableName,KeyConditionExpression:'pk=:pk AND sk BETWEEN :from AND :to',ExpressionAttributeValues:{':pk':`ORG#${orgId}`,':from':`USAGE#H#${fromHour}`,':to':'USAGE#H#~'},ExclusiveStartKey:start}));items.push(...(r.Items??[]));start=r.LastEvaluatedKey}while(start);
    return items.map(item=>({...usageCounts(item),hour:String(item.sk).slice('USAGE#H#'.length,'USAGE#H#'.length+13),periodStart:String(item.periodStart),billable:item.billable===true,exported:Object.fromEntries(Object.entries(item).filter(([k])=>k.startsWith('exported#')).map(([k,v])=>[k.slice('exported#'.length),Number(v)])),exportAttempts:item.exportAttempts as number|undefined,lastExportError:item.lastExportError as string|undefined}));
  },
  async markUsageHour(orgId:string,hour:string,periodStart:string,fields:{exported?:Record<string,number>;exportAttempts?:number;lastExportError?:string}){
    await ensureTable();
    const sets:[string,unknown][]=[...Object.entries(fields.exported??{}).map(([m,v])=>[`exported#${m}`,v] as [string,unknown]),...(fields.exportAttempts!==undefined?[['exportAttempts',fields.exportAttempts] as [string,unknown]]:[]),...(fields.lastExportError!==undefined?[['lastExportError',fields.lastExportError] as [string,unknown]]:[])];
    if(!sets.length)return;
    await client.send(new UpdateCommand({TableName:tableName,Key:{pk:`ORG#${orgId}`,sk:`USAGE#H#${hour}#${periodStart}`},UpdateExpression:'SET '+sets.map((_,i)=>`#s${i}=:s${i}`).join(', '),ExpressionAttributeNames:Object.fromEntries(sets.map(([n],i)=>[`#s${i}`,n])),ExpressionAttributeValues:Object.fromEntries(sets.map(([,v],i)=>[`:s${i}`,v]))}));
  },
  // First caller wins (server-hour counting, usage alerts); claims expire after ttlDays.
  async claimOnce(orgId:string,key:string,ttlDays:number){
    await ensureTable();
    try{await client.send(new PutCommand({TableName:tableName,Item:{pk:`ORG#${orgId}`,sk:`CLAIM#${key}`,createdAt:new Date().toISOString(),ttl:Math.floor(Date.now()/1000)+ttlDays*86400},ConditionExpression:'attribute_not_exists(sk)'}));return true}
    catch(error){if(error instanceof Error&&error.name==='ConditionalCheckFailedException')return false;throw error}
  },
};
