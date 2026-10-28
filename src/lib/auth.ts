import {timingSafeEqual} from 'node:crypto';
import {store} from './store';
import {agentCredential,credentialMatches} from './agent-credentials';
export type AgentIdentity={tenantId:string;agentId:string;serverId?:string};
export async function authenticate(header:string|null):Promise<AgentIdentity|null>{
  const raw=header?.replace(/^Bearer /,'')??'';
  if(raw.length>512)return null;
  const parts=raw.split('.'),tenantId=parts.shift(),token=parts.pop(),agentId=parts.join('.');
  if(!tenantId||!agentId||!token)return null;
  const org=await store.organizationById(tenantId);
  if(!org)return null;
  const credential=await agentCredential(tenantId,agentId);
  if(credential){
    if(!credentialMatches(token,credential.tokenHash))return null;
    const node=await store.nodeRecord(tenantId,credential.serverId);
    if(node?.deletedAt||node&&node.agentId!==agentId)return null;
    return {tenantId,agentId,serverId:credential.serverId};
  }
  // Compatibility during rollout only: once an agent has a private key, its
  // organization enrollment key can never authenticate or rotate that agent.
  const a=Buffer.from(token),b=Buffer.from(org.enrollmentToken);
  if(a.length!==b.length||!timingSafeEqual(a,b))return null;
  return{tenantId,agentId};
}
