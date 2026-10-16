import {createHash,randomUUID} from 'node:crypto';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,PutCommand,QueryCommand,UpdateCommand,DeleteCommand} from '@aws-sdk/lib-dynamodb';
import {store} from './store';
export type ProtectionCommand={id:string;orgId:string;serverId:string;agentId:string;incidentId:string;candidateId:string;kind?:'inspect_server'|'protect';result?:Record<string,string>;expiresAt:string;approvedBy:string;createdAt:string;status:'queued'|'complete'|'applied'|'failed'|'rejected'|'expired';updatedAt:string};
const db=DynamoDBDocumentClient.from(new DynamoDBClient({endpoint:process.env.GUARDSCALE_DYNAMODB_ENDPOINT}));
const memory=new Map<string,ProtectionCommand>();
const autoLocks=new Set<string>();
export async function withAutoGuardianLock(orgId:string,work:()=>Promise<void>){
 const token=randomUUID(),key={pk:'ORG#'+orgId,sk:'AUTO_GUARDIAN_LOCK'};
 if(process.env.GUARDSCALE_TABLE){try{await db.send(new PutCommand({TableName:process.env.GUARDSCALE_TABLE,Item:{...key,token,expiresAt:Date.now()+45000},ConditionExpression:'attribute_not_exists(pk) OR expiresAt < :now',ExpressionAttributeValues:{':now':Date.now()}}));}catch(e){if(e instanceof Error&&e.name==='ConditionalCheckFailedException')return;throw e;}}
 else{if(autoLocks.has(orgId))return;autoLocks.add(orgId);}
 try{await work();}finally{
  if(process.env.GUARDSCALE_TABLE)await db.send(new DeleteCommand({TableName:process.env.GUARDSCALE_TABLE,Key:key,ConditionExpression:'#token=:token',ExpressionAttributeNames:{'#token':'token'},ExpressionAttributeValues:{':token':token}}));
  else autoLocks.delete(orgId);
 }
}
export async function protect(orgId:string,approvalCommandId:string){
 const command=(await commandsFor(orgId)).find(c=>c.id===approvalCommandId&&c.kind!=='inspect_server');
 if(!command||!command.approvedBy||Date.parse(command.expiresAt)<=Date.now())throw Error('A current scoped approval command is required');
 const settings=await store.settings(orgId);if(!settings.response.allowRemoteRequests||settings.response.dryRun)throw Error('Protection disabled');
 if(command.status!=='queued'&&command.status!=='applied')throw Error('Command is no longer executable');
 await store.putEvent({id:'dispatch-'+command.id,tenantId:orgId,serverId:command.serverId,agentId:command.agentId,type:'protection.dispatched',at:new Date().toISOString(),metadata:{command_id:command.id}});
 return {commandId:command.id,status:command.status,expiresAt:command.expiresAt};
}
export async function commandsFor(orgId:string){
 if(!process.env.GUARDSCALE_TABLE)return [...memory.values()].filter(v=>v.orgId===orgId);
 const items:ProtectionCommand[]=[];let cursor:Record<string,unknown>|undefined;
 do{const r=await db.send(new QueryCommand({TableName:process.env.GUARDSCALE_TABLE,KeyConditionExpression:'pk=:pk AND begins_with(sk,:prefix)',ExpressionAttributeValues:{':pk':'ORG#'+orgId,':prefix':'COMMAND#'},ExclusiveStartKey:cursor,ConsistentRead:true}));items.push(...r.Items as ProtectionCommand[]??[]);cursor=r.LastEvaluatedKey;}while(cursor);
 return items;
}
export async function approveProtection(orgId:string,incidentId:string,approvedBy:string,maxTtlSeconds=900){
 const incident=await store.incident(orgId,incidentId);if(!incident)throw Error('Incident not found');
 const settings=await store.settings(orgId);
 if(!settings.response.allowRemoteRequests||settings.response.dryRun)throw Error('Enable remote protection and disable dry-run in organization settings first');
 const payload=incident.payload as {candidate_id?:unknown};
 if(typeof payload.candidate_id!=='string'||!/^[a-f0-9]{32}$/.test(payload.candidate_id))throw Error('No agent-observed protection candidate');
 const age=Date.now()-Date.parse(incident.startedAt);
 if(!Number.isFinite(age)||age<0||age>15*60000)throw Error('Incident approval window expired');
 if(approvedBy==='auto-guardian-policy'&&incident.state!=='review')throw Error('Human response already received');
 const node=await store.node(orgId,incident.serverId);if(!node||node.agentId!==incident.agentId)throw Error('Server unavailable');
 const ttl=Math.min(settings.response.defaultTtlSeconds,settings.response.maxTtlSeconds,maxTtlSeconds,900);
 if(!Number.isInteger(ttl)||ttl<10)throw Error('Invalid protection TTL');
 const id=createHash('sha256').update(orgId+':'+incidentId).digest('hex');
 const previous=(await commandsFor(orgId)).find(v=>v.id===id);if(previous)return previous;
 const now=new Date().toISOString();const command:ProtectionCommand={id,orgId,serverId:incident.serverId,agentId:incident.agentId,incidentId,candidateId:payload.candidate_id,approvedBy,expiresAt:new Date(Date.parse(now)+ttl*1000).toISOString(),createdAt:now,updatedAt:now,status:'queued'};
 if(process.env.GUARDSCALE_TABLE){try{await db.send(new PutCommand({TableName:process.env.GUARDSCALE_TABLE,Item:{pk:'ORG#'+orgId,sk:'COMMAND#'+id,...command},ConditionExpression:'attribute_not_exists(pk)'}));}catch(e){if(e instanceof Error&&e.name==='ConditionalCheckFailedException')return (await commandsFor(orgId)).find(v=>v.id===id)!;throw e;}}
 else memory.set(id,command);
 await store.putEvent({id:'approval-'+id,tenantId:orgId,agentId:incident.agentId,serverId:incident.serverId,type:'protection.approved',at:now,metadata:{command_id:id,approved_by:approvedBy,expires_at:command.expiresAt}});
 return command;
}
export async function acknowledgeCommand(orgId:string,agentId:string,serverId:string,id:string,status:ProtectionCommand['status'],result:Record<string,string>={}){
 const previous=(await commandsFor(orgId)).find(v=>v.id===id&&v.agentId===agentId&&v.serverId===serverId);
 if(!previous)throw Error('Command not found');
 if(previous.status===status)return;
 if(status==='complete'&&previous.kind!=='inspect_server')throw Error('Invalid inspection result');
 if(status==='applied'&&previous.kind==='inspect_server')throw Error('Inspection cannot apply changes');
 if(previous.status!=='queued'&&!(previous.status==='applied'&&status==='expired'))throw Error('Command already terminal');
 if(status==='expired'&&Date.parse(previous.expiresAt)>Date.now())throw Error('Command not expired');
 const now=new Date().toISOString();
 if(process.env.GUARDSCALE_TABLE)await db.send(new UpdateCommand({TableName:process.env.GUARDSCALE_TABLE,Key:{pk:'ORG#'+orgId,sk:'COMMAND#'+id},UpdateExpression:'SET #status=:status,updatedAt=:now,#result=:result',ConditionExpression:'#status=:previous',ExpressionAttributeNames:{'#status':'status','#result':'result'},ExpressionAttributeValues:{':status':status,':now':now,':previous':previous.status,':result':result}}));
 else memory.set(id,{...previous,status,result,updatedAt:now});
 await store.putEvent({id:'command-'+id+'-'+status,tenantId:orgId,agentId,serverId,type:'protection.'+status,at:now,metadata:{command_id:id,expires_at:previous.expiresAt}});
}

export async function inspectServer(orgId:string,incidentId:string){
 const incident=await store.incident(orgId,incidentId);if(!incident)throw Error('Incident not found');
 const node=await store.node(orgId,incident.serverId);if(!node||node.agentId!==incident.agentId)throw Error('Server unavailable');
 const id=createHash('sha256').update('inspect:'+orgId+':'+incidentId).digest('hex');
 let command=(await commandsFor(orgId)).find(v=>v.id===id);
 if(!command){const now=new Date().toISOString();command={id,orgId,serverId:incident.serverId,agentId:incident.agentId,incidentId,candidateId:'',kind:'inspect_server',expiresAt:new Date(Date.parse(now)+20000).toISOString(),approvedBy:'guardian-read-only',createdAt:now,updatedAt:now,status:'queued'};
  if(process.env.GUARDSCALE_TABLE){try{await db.send(new PutCommand({TableName:process.env.GUARDSCALE_TABLE,Item:{pk:'ORG#'+orgId,sk:'COMMAND#'+id,...command},ConditionExpression:'attribute_not_exists(pk)'}));}catch(e){if(!(e instanceof Error&&e.name==='ConditionalCheckFailedException'))throw e;}}
  else memory.set(id,command);
 }
 const deadline=Date.now()+15000;
 while(Date.now()<deadline){const value=(await commandsFor(orgId)).find(v=>v.id===id);if(value?.status==='complete')return value.result??{};if(value&&value.status!=='queued')throw Error('Agent inspection failed');await new Promise(resolve=>setTimeout(resolve,1000));}
 throw Error('Agent inspection timed out');
}
