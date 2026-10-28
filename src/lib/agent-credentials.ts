import {createHash,timingSafeEqual} from 'node:crypto';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,GetCommand,PutCommand} from '@aws-sdk/lib-dynamodb';

export type AgentCredential={tenantId:string;agentId:string;serverId:string;tokenHash:string;createdAt:string;updatedAt:string};
const db=DynamoDBDocumentClient.from(new DynamoDBClient({endpoint:process.env.GUARDSCALE_DYNAMODB_ENDPOINT}));
const memory=new Map<string,AgentCredential>();
const key=(tenantId:string,agentId:string)=>({pk:'ORG#'+tenantId,sk:'AGENT_CREDENTIAL#'+agentId});
export const credentialHash=(secret:string)=>createHash('sha256').update(secret).digest('hex');
export function credentialMatches(secret:string,hash:string){const actual=credentialHash(secret);return /^[a-f0-9]{64}$/.test(hash)&&timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(hash,'hex'));}
export async function agentCredential(tenantId:string,agentId:string):Promise<AgentCredential|null>{
 if(!process.env.GUARDSCALE_TABLE)return memory.get(tenantId+'\0'+agentId)??null;
 return (await db.send(new GetCommand({TableName:process.env.GUARDSCALE_TABLE,Key:key(tenantId,agentId),ConsistentRead:true}))).Item as AgentCredential??null;
}
// Conditional creation/rotation prevents concurrent enrollments from replacing another key.
export async function saveAgentCredential(value:AgentCredential,previousHash?:string){
 if(process.env.GUARDSCALE_TABLE){
  try{await db.send(new PutCommand({TableName:process.env.GUARDSCALE_TABLE,Item:{...key(value.tenantId,value.agentId),...value},...(previousHash?{ConditionExpression:'tokenHash=:previous',ExpressionAttributeValues:{':previous':previousHash}}:{ConditionExpression:'attribute_not_exists(pk)'})}));return true;}
  catch(e){if(e instanceof Error&&e.name==='ConditionalCheckFailedException')return false;throw e;}
 }
 const id=value.tenantId+'\0'+value.agentId,previous=memory.get(id);
 if(previousHash?previous?.tokenHash!==previousHash:!!previous)return false;
 memory.set(id,value);return true;
}
