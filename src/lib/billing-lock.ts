import {randomUUID} from 'node:crypto';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,PutCommand,DeleteCommand} from '@aws-sdk/lib-dynamodb';
const table=process.env.GUARDSCALE_TABLE;
const db=DynamoDBDocumentClient.from(new DynamoDBClient({endpoint:process.env.GUARDSCALE_DYNAMODB_ENDPOINT}));
const locks=new Set<string>();
// Shared by checkout and worker: serialize financial changes across replicas.
export async function withBillingLock<T>(org:string,work:()=>Promise<T>):Promise<T|null>{
 const owner=randomUUID(),key={pk:'ORG#'+org,sk:'BILLING_LOCK'},now=Date.now();
 if(table){try{await db.send(new PutCommand({TableName:table,Item:{...key,owner,expiresAt:now+180000,ttl:Math.floor(now/1000)+3600},ConditionExpression:'attribute_not_exists(pk) OR expiresAt<:now',ExpressionAttributeValues:{':now':now}}));}catch(error){if(error instanceof Error&&error.name==='ConditionalCheckFailedException')return null;throw error;}}
 else{if(locks.has(org))return null;locks.add(org);}
 try{return await work();}finally{
  if(table)await db.send(new DeleteCommand({TableName:table,Key:key,ConditionExpression:'#owner=:owner',ExpressionAttributeNames:{'#owner':'owner'},ExpressionAttributeValues:{':owner':owner}})).catch(error=>{if(!(error instanceof Error&&error.name==='ConditionalCheckFailedException'))throw error;});
  else locks.delete(org);
 }
}
