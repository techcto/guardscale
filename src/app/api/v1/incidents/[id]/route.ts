import{NextRequest,NextResponse}from'next/server';import{operator}from'@/lib/operator';import{store}from'@/lib/store';
import {commandsFor} from '@/lib/protection-commands';

export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const session=await operator(req);
  if(!session)return NextResponse.json({error:'unauthorized'},{status:401});
  const {id}=await params;
  const incident=await store.incident(session.orgId,id);
  if(!incident)return NextResponse.json({error:'not found'},{status:404});
  const node=await store.node(session.orgId,incident.serverId);
  const commands=(await commandsFor(session.orgId)).filter(c=>c.incidentId===id);
  const settings=await store.settings(session.orgId);
  const membership=session.role==='root'?null:await store.membership(session.orgId,session.id);
  const admin=session.role==='root'||membership?.status==='active'&&membership.role==='admin';
  const payload=incident.payload as {candidate_id?:unknown;analysis?:{trace?:{result?:{protection_enabled?:string}}[]}};
  const age=Date.now()-Date.parse(incident.startedAt);
  const previous=commands.find(c=>c.kind!=='inspect_server');
  const agentDisabled=payload.analysis?.trace?.some(v=>v.result?.protection_enabled==='false');
  const blockedReason=!admin?'An organization administrator must approve blocking.':
   !node?'This server is no longer connected to this organization.':
   previous?'This incident already has a protection command. Review its status below.':
   typeof payload.candidate_id!=='string'||!/^[a-f0-9]{32}$/.test(payload.candidate_id)?'The agent did not identify an individual address eligible for blocking.':
   !Number.isFinite(age)||age<0||age>900000?'This alert’s 15-minute approval window has expired. Review a newer incident before blocking.':
   !settings.response.allowRemoteRequests?'Remote protection is disabled in Settings → Response.':
   settings.response.dryRun?'Protection is in dry-run mode. Turn off dry-run in Settings → Response to allow real blocks.':
   agentDisabled?'The agent reported that protection is disabled on this server. Enable its protection policy before approving a block.':null;
  return NextResponse.json({incident,node,commands,canManage:session.role!=='viewer',protection:{canApprove:!blockedReason,blockedReason,ttlSeconds:Math.min(settings.response.defaultTtlSeconds,settings.response.maxTtlSeconds,900)}});
}

export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const session=await operator(req);
  if(!session||session.role==='viewer')return NextResponse.json({error:'forbidden'},{status:403});
  const {state}=await req.json() as {state?:string};
  if(!state||!['acknowledged','resolved','watch'].includes(state))return NextResponse.json({error:'state must be acknowledged, resolved, or watch'},{status:400});
  const {id}=await params;
  const existing=await store.incident(session.orgId,id);
  if(!existing)return NextResponse.json({error:'not found'},{status:404});
  const updated={...existing,state,updatedAt:new Date().toISOString()};
  await store.putIncident(updated);
  return NextResponse.json(updated);
}
