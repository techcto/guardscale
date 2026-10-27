import {NextRequest,NextResponse} from 'next/server';
import {agent,unauthorized} from '@/lib/http';
import {store} from '@/lib/store';
import {acknowledgeCommand,acknowledgeRenewal,commandsFor,type ProtectionCommand} from '@/lib/protection-commands';
import {enqueueProtectionOutcome,notifyProtectionOutcome} from '@/lib/incident-workflow';
export async function GET(req:NextRequest){
 const identity=await agent(req);if(!identity)return unauthorized();
 const serverId=req.nextUrl.searchParams.get('server_id')??'';
 const node=await store.node(identity.tenantId,serverId);if(!node||node.agentId!==identity.agentId)return unauthorized();
 const settings=await store.settings(identity.tenantId);
 const renewal=settings.response.renewal,enabled=!!renewal?.enabled&&settings.response.allowRemoteRequests&&!settings.response.dryRun;
 const incidents=new Map((await store.incidentsForNode(identity.tenantId,serverId)).map(i=>[i.incidentId,i.state]));
 const commands=(await commandsFor(identity.tenantId)).filter(c=>c.serverId===serverId&&c.agentId===identity.agentId&&(c.status==='cancel_requested'||c.status==='applied'||c.status==='queued'&&(c.kind==='inspect_server'||settings.response.allowRemoteRequests&&!settings.response.dryRun))).slice(0,20);
 return NextResponse.json({commands:commands.map(({id,candidateId,expiresAt,kind,status,createdAt,result,incidentId})=>({id,candidateId,expiresAt,kind:status==='cancel_requested'?'revoke':kind??'protect',status,renewalEnabled:enabled&&incidents.get(incidentId)!=='resolved',renewalUntil:enabled?new Date(Date.parse(createdAt)+Math.min(renewal!.maxTotalSeconds,900)*1000).toISOString():expiresAt,renewalSeconds:Math.min(settings.response.defaultTtlSeconds,settings.response.maxTtlSeconds,900),blockedPackets:Number(result?.blocked_packets??0)}))},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(req:NextRequest){
 const identity=await agent(req);if(!identity)return unauthorized();
 const value=await req.json().catch(()=>null);
 if(!value||!['complete','applied','failed','rejected','expired','renewed','cancelled'].includes(value.status)||typeof value.id!=='string'||typeof value.server_id!=='string')return NextResponse.json({error:'Invalid result'},{status:400});
 if(value.status==='renewed'){
  const node=await store.node(identity.tenantId,value.server_id);if(!node||node.agentId!==identity.agentId)return unauthorized();
  try{const renewed=await acknowledgeRenewal(identity.tenantId,identity.agentId,value.server_id,value.id,value.expires_at,value.blocked_packets);if(renewed)await notifyProtectionOutcome(identity.tenantId,value.id,true);return NextResponse.json({accepted:true});}catch{return NextResponse.json({error:'Renewal rejected'},{status:409});}
 }
 const result=value.result??{};
 if(typeof result!=='object'||Array.isArray(result)||Object.keys(result).length>8||Object.entries(result).some(([key,v])=>!['apache_access','apache_error','php_error','php_slow','recent_requests','protection_enabled'].includes(key)||typeof v!=='string'||v.length>30))return NextResponse.json({error:'Invalid diagnostic fields'},{status:400});
 const node=await store.node(identity.tenantId,value.server_id);if(!node||node.agentId!==identity.agentId)return unauthorized();
 try{await acknowledgeCommand(identity.tenantId,identity.agentId,value.server_id,value.id,value.status as ProtectionCommand['status'],result);if(value.status!=='complete')await enqueueProtectionOutcome(identity.tenantId,value.id);return NextResponse.json({accepted:true});}catch{return NextResponse.json({error:'Result rejected'},{status:409});}
}
