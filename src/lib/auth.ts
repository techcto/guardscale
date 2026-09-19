import {timingSafeEqual} from 'node:crypto';
import {store} from './store';
export type AgentIdentity={tenantId:string;agentId:string};
export async function authenticate(header:string|null):Promise<AgentIdentity|null>{
  const raw=header?.replace(/^Bearer /,'')??'';
  const [tenantId,agentId,token]=raw.split('.');
  if(!tenantId||!agentId||!token)return null;
  const org=await store.organization();
  if(!org||org.id!==tenantId)return null;
  const a=Buffer.from(token),b=Buffer.from(org.enrollmentToken);
  if(a.length!==b.length||!timingSafeEqual(a,b))return null;
  return{tenantId,agentId};
}
