import{randomUUID}from'node:crypto';
import{DynamoDBClient,CreateTableCommand,UpdateTimeToLiveCommand}from'@aws-sdk/client-dynamodb';
import{DynamoDBDocumentClient,GetCommand,PutCommand,QueryCommand,DeleteCommand}from'@aws-sdk/lib-dynamodb';
import type{GuardianEvent,GuardianUser,IncidentRecord,Node,OrgMembership,Organization,OrgType,Product,Settings,Subscription}from'./model';
import{defaultSettings}from'./model';

const tableName=process.env.GUARDIAN_TABLE??'guardian-local';
const client=DynamoDBDocumentClient.from(new DynamoDBClient({endpoint:process.env.GUARDIAN_DYNAMODB_ENDPOINT}),{marshallOptions:{removeUndefinedValues:true}});

let tableReady:Promise<void>|null=null;
function ensureTable(){
  if(!process.env.GUARDIAN_DYNAMODB_ENDPOINT)return Promise.resolve();
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

function slugify(name:string){return name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')||randomUUID().slice(0,8)}
const SINGLETON_PK='SINGLETON',SINGLETON_SK='SINGLETON';

export const dynamoStore={
  async createOrganization(v:{name:string;ownerId:string;orgType:OrgType}):Promise<Organization>{
    await ensureTable();
    const org:Organization={id:randomUUID(),name:v.name,slug:`${slugify(v.name)}-${randomUUID().slice(0,6)}`,ownerId:v.ownerId,orgType:v.orgType,enrollmentToken:randomUUID(),createdAt:new Date().toISOString()};
    await client.send(new PutCommand({TableName:tableName,Item:{pk:`ORG#${org.id}`,sk:`ORG#${org.id}`,gsi1pk:'ORG',gsi1sk:`${org.createdAt}#${org.id}`,...org}}));
    return org;
  },
  async ensureSingleDeploymentOrg():Promise<Organization>{
    await ensureTable();
    const pointer=await client.send(new GetCommand({TableName:tableName,Key:{pk:SINGLETON_PK,sk:SINGLETON_SK}}));
    if(pointer.Item?.orgId){const org=await dynamoStore.organizationById(pointer.Item.orgId as string);if(org)return org}
    const org=await dynamoStore.createOrganization({name:'Guardian.US',ownerId:'',orgType:'business'});
    await client.send(new PutCommand({TableName:tableName,Item:{pk:SINGLETON_PK,sk:SINGLETON_SK,orgId:org.id},ConditionExpression:'attribute_not_exists(pk)'})).catch(async(error)=>{if(!(error instanceof Error&&error.name==='ConditionalCheckFailedException'))throw error});
    const final=await client.send(new GetCommand({TableName:tableName,Key:{pk:SINGLETON_PK,sk:SINGLETON_SK}}));
    const finalOrg=await dynamoStore.organizationById(final.Item?.orgId as string);
    return finalOrg??org;
  },
  async organizationById(id:string):Promise<Organization|null>{
    await ensureTable();
    const r=await client.send(new GetCommand({TableName:tableName,Key:{pk:`ORG#${id}`,sk:`ORG#${id}`}}));
    return (r.Item as Organization)??null;
  },
  async organizations():Promise<Organization[]>{
    await ensureTable();
    const r=await client.send(new QueryCommand({TableName:tableName,IndexName:'GSI1',KeyConditionExpression:'gsi1pk=:pk',ExpressionAttributeValues:{':pk':'ORG'}}));
    return (r.Items??[]) as Organization[];
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
  async membersOfOrg(orgId:string):Promise<{membership:OrgMembership;user:GuardianUser}[]>{
    await ensureTable();
    const r=await client.send(new QueryCommand({TableName:tableName,KeyConditionExpression:'pk=:pk AND begins_with(sk,:prefix)',ExpressionAttributeValues:{':pk':`ORG#${orgId}`,':prefix':'MEMBER#'}}));
    const memberships=(r.Items??[]) as OrgMembership[];
    const users=await Promise.all(memberships.map(m=>dynamoStore.userById(m.userId)));
    return memberships.map((membership,i)=>({membership,user:users[i]})).filter((x):x is{membership:OrgMembership;user:GuardianUser}=>!!x.user);
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
    await client.send(new PutCommand({TableName:tableName,Item:{pk:`ORG#${v.tenantId}`,sk:`NODE#${v.serverId}`,...v}}));
  },
  async nodes(tenant:string):Promise<Node[]>{
    await ensureTable();
    const r=await client.send(new QueryCommand({TableName:tableName,KeyConditionExpression:'pk=:pk AND begins_with(sk,:prefix)',ExpressionAttributeValues:{':pk':`ORG#${tenant}`,':prefix':'NODE#'}}));
    return (r.Items??[]) as Node[];
  },
  async node(tenant:string,serverId:string):Promise<Node|null>{
    await ensureTable();
    const r=await client.send(new GetCommand({TableName:tableName,Key:{pk:`ORG#${tenant}`,sk:`NODE#${serverId}`}}));
    return (r.Item as Node)??null;
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
    await ensureTable();
    const r=await client.send(new QueryCommand({TableName:tableName,KeyConditionExpression:'pk=:pk AND begins_with(sk,:prefix)',ExpressionAttributeValues:{':pk':`ORG#${tenant}`,':prefix':'INCIDENT#'}}));
    return (r.Items??[]) as IncidentRecord[];
  },
  async incidentsForNode(tenant:string,serverId:string):Promise<IncidentRecord[]>{
    await ensureTable();
    const r=await client.send(new QueryCommand({TableName:tableName,KeyConditionExpression:'pk=:pk AND begins_with(sk,:prefix)',FilterExpression:'serverId=:sid',ExpressionAttributeValues:{':pk':`ORG#${tenant}`,':prefix':'INCIDENT#',':sid':serverId}}));
    return (r.Items??[]) as IncidentRecord[];
  },
  async putEvent(v:GuardianEvent){
    await ensureTable();
    const ttl=Math.floor(Date.now()/1000)+7*24*60*60;
    await client.send(new PutCommand({TableName:tableName,Item:{pk:`NODE#${v.serverId}`,sk:`EVENT#${v.at}#${randomUUID()}`,ttl,...v}}));
  },
  async eventsForNode(_tenant:string,serverId:string,limit=200):Promise<GuardianEvent[]>{
    await ensureTable();
    const r=await client.send(new QueryCommand({TableName:tableName,KeyConditionExpression:'pk=:pk AND begins_with(sk,:prefix)',ExpressionAttributeValues:{':pk':`NODE#${serverId}`,':prefix':'EVENT#'},ScanIndexForward:false,Limit:limit}));
    return (r.Items??[]) as GuardianEvent[];
  },
  async userByName(username:string):Promise<GuardianUser|null>{
    await ensureTable();
    const r=await client.send(new QueryCommand({TableName:tableName,IndexName:'GSI1',KeyConditionExpression:'gsi1pk=:pk',ExpressionAttributeValues:{':pk':`USERNAME#${username.toLowerCase()}`}}));
    return (r.Items?.[0] as GuardianUser)??null;
  },
  async userById(id:string):Promise<GuardianUser|null>{
    await ensureTable();
    const r=await client.send(new GetCommand({TableName:tableName,Key:{pk:`USER#${id}`,sk:`USER#${id}`}}));
    return (r.Item as GuardianUser)??null;
  },
  async putUser(v:GuardianUser,passwordHash?:string){
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
    return[{id:'starter',name:'Starter',description:'Detection and alerting for a small server fleet.',stripePriceId:process.env.STRIPE_STARTER_PRICE_ID??'',monthlyPrice:49,serverLimit:5,active:true},{id:'scale',name:'Scale',description:'Response automation and expanded infrastructure coverage.',stripePriceId:process.env.STRIPE_SCALE_PRICE_ID??'',monthlyPrice:199,serverLimit:50,active:true}];
  },
  async subscriptions(userId:string):Promise<Subscription[]>{
    await ensureTable();
    const r=await client.send(new QueryCommand({TableName:tableName,KeyConditionExpression:'pk=:pk AND begins_with(sk,:prefix)',ExpressionAttributeValues:{':pk':`USER#${userId}`,':prefix':'SUBSCRIPTION#'}}));
    return (r.Items??[]) as Subscription[];
  },
  async putSubscription(v:Subscription){
    await ensureTable();
    await client.send(new PutCommand({TableName:tableName,Item:{pk:`USER#${v.userId}`,sk:`SUBSCRIPTION#${v.id}`,...v}}));
  },
};
