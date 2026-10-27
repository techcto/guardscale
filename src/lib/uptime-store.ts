import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,GetCommand,PutCommand,QueryCommand,DeleteCommand,UpdateCommand} from '@aws-sdk/lib-dynamodb';
import type {UptimeMonitor} from './uptime-model';
const globalState=globalThis as typeof globalThis&{guardscaleUptime?:Map<string,UptimeMonitor>};
const memory=globalState.guardscaleUptime??=new Map<string,UptimeMonitor>();
const db=DynamoDBDocumentClient.from(new DynamoDBClient({endpoint:process.env.GUARDSCALE_DYNAMODB_ENDPOINT}),{marshallOptions:{removeUndefinedValues:true}});
const table=process.env.GUARDSCALE_TABLE;
const key=(orgId:string,id:string)=>({pk:'ORG#'+orgId,sk:'UPTIME#'+id});
export const uptimeStore={
 async list(orgId:string):Promise<UptimeMonitor[]>{
  if(!table)return [...memory.values()].filter(m=>m.orgId===orgId).map(m=>structuredClone(m));
  const items:UptimeMonitor[]=[];let cursor:Record<string,unknown>|undefined;
  do{const r=await db.send(new QueryCommand({TableName:table,KeyConditionExpression:'pk=:pk AND begins_with(sk,:sk)',ExpressionAttributeValues:{':pk':'ORG#'+orgId,':sk':'UPTIME#'},ExclusiveStartKey:cursor,ConsistentRead:true}));items.push(...(r.Items??[]) as UptimeMonitor[]);cursor=r.LastEvaluatedKey;}while(cursor);
  return items;
 },
 async get(orgId:string,id:string):Promise<UptimeMonitor|null>{
  if(!table)return structuredClone(memory.get(orgId+'#'+id)??null);
  return (await db.send(new GetCommand({TableName:table,Key:key(orgId,id),ConsistentRead:true}))).Item as UptimeMonitor??null;
 },
 async save(m:UptimeMonitor,expected?:number,owner?:string){
  const next={...m,revision:(expected??0)+1};delete next.leaseOwner;delete next.leaseUntil;
  if(!table){const current=memory.get(m.orgId+'#'+m.id);if(expected===undefined?!!current:current?.revision!==expected||!!owner&&current?.leaseOwner!==owner)return false;memory.set(m.orgId+'#'+m.id,structuredClone(next));return true;}
  try{await db.send(new PutCommand({TableName:table,Item:{...key(m.orgId,m.id),...next},ConditionExpression:expected===undefined?'attribute_not_exists(pk)':'revision=:revision'+(owner?' AND leaseOwner=:owner':''),...(expected===undefined?{}:{ExpressionAttributeValues:{':revision':expected,...(owner?{':owner':owner}:{})}})}));return true;}catch(e){if(e instanceof Error&&e.name==='ConditionalCheckFailedException')return false;throw e;}
 },
 async remove(orgId:string,id:string){if(!table){memory.delete(orgId+'#'+id);return;}await db.send(new DeleteCommand({TableName:table,Key:key(orgId,id)}));},
 async claim(m:UptimeMonitor,owner:string,now:number){
  if(!table){const v=memory.get(m.orgId+'#'+m.id);if(!v||v.revision!==m.revision||v.paused||(v.leaseUntil??0)>now)return false;v.leaseOwner=owner;v.leaseUntil=now+60000;return true;}
  try{await db.send(new UpdateCommand({TableName:table,Key:key(m.orgId,m.id),UpdateExpression:'SET leaseOwner=:owner,leaseUntil=:until',ConditionExpression:'revision=:revision AND paused=:false AND (attribute_not_exists(leaseUntil) OR leaseUntil<:now)',ExpressionAttributeValues:{':owner':owner,':until':now+60000,':revision':m.revision,':false':false,':now':now}}));return true;}catch(e){if(e instanceof Error&&e.name==='ConditionalCheckFailedException')return false;throw e;}
 },
};

export async function purgeUptimeHistory(orgId:string){
 for(const row of await uptimeStore.list(orgId)){
  let saved=false;
  for(let attempt=0;attempt<3&&!saved;attempt++){
   const current=await uptimeStore.get(orgId,row.id);if(!current){saved=true;break;}
   const at=new Date().toISOString();
   saved=await uptimeStore.save({...current,state:'unknown',stateSince:undefined,activeIncidentId:undefined,failures:0,successes:0,samples:[],notices:[],outages:[],updatedAt:at,nextCheckAt:at},current.revision);
  }
  if(!saved)throw Error('An uptime check changed during purge; retry');
 }
}
