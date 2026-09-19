import {timingSafeEqual} from 'node:crypto';
export type AgentIdentity={tenantId:string;agentId:string};
export function authenticate(header:string|null):AgentIdentity|null{const raw=header?.replace(/^Bearer /,'')??'';const [tenantId,agentId,token]=raw.split('.');const expected=process.env.GUARDIAN_API_TOKEN??'';if(!tenantId||!agentId||!token||!expected)return null;const a=Buffer.from(token),b=Buffer.from(expected);if(a.length!==b.length||!timingSafeEqual(a,b))return null;return{tenantId,agentId}}
