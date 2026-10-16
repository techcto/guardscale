import {NextRequest,NextResponse} from 'next/server';
import {agent,unauthorized} from '@/lib/http';
import {store} from '@/lib/store';
import {acknowledgeCommand,commandsFor,type ProtectionCommand} from '@/lib/protection-commands';
import {enqueueProtectionOutcome} from '@/lib/incident-workflow';
export async function GET(req:NextRequest){
 const identity=await agent(req);if(!identity)return unauthorized();
 const serverId=req.nextUrl.searchParams.get('server_id')??'';
 const node=await store.node(identity.tenantId,serverId);if(!node||node.agentId!==identity.agentId)return unauthorized();
 const settings=await store.settings(identity.tenantId);
 const commands=(await commandsFor(identity.tenantId)).filter(c=>c.serverId===serverId&&c.agentId===identity.agentId&&((c.status==='queued'&&(c.kind==='inspect_server'||settings.response.allowRemoteRequests&&!settings.response.dryRun))||(c.status==='applied'&&Date.parse(c.expiresAt)<=Date.now()))).slice(0,20);
 return NextResponse.json({commands:commands.map(({id,candidateId,expiresAt,kind})=>({id,candidateId,expiresAt,kind:kind??'protect'}))},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(req:NextRequest){
 const identity=await agent(req);if(!identity)return unauthorized();
 const value=await req.json().catch(()=>null);
 if(!value||!['complete','applied','failed','rejected','expired'].includes(value.status)||typeof value.id!=='string'||typeof value.server_id!=='string')return NextResponse.json({error:'Invalid result'},{status:400});
 const result=value.result??{};
 if(typeof result!=='object'||Array.isArray(result)||Object.keys(result).length>8||Object.entries(result).some(([key,v])=>!['apache_access','apache_error','php_error','php_slow','recent_requests','protection_enabled'].includes(key)||typeof v!=='string'||v.length>30))return NextResponse.json({error:'Invalid diagnostic fields'},{status:400});
 const node=await store.node(identity.tenantId,value.server_id);if(!node||node.agentId!==identity.agentId)return unauthorized();
 try{await acknowledgeCommand(identity.tenantId,identity.agentId,value.server_id,value.id,value.status as ProtectionCommand['status'],result);if(value.status!=='complete')await enqueueProtectionOutcome(identity.tenantId,value.id);return NextResponse.json({accepted:true});}catch{return NextResponse.json({error:'Result rejected'},{status:409});}
}
