import{NextRequest,NextResponse}from'next/server';import{operator}from'@/lib/operator';import{store}from'@/lib/store';
import {commandsFor,cancelIncidentProtection} from '@/lib/protection-commands';
import {requestOrigin} from '@/lib/session';
import {randomUUID} from 'node:crypto';
import {destructiveAccess} from '@/lib/destructive-access';

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
  const payload=incident.payload as {candidate_id?:unknown;protection_blocked_reason?:unknown;analysis?:{trace?:{result?:{protection_enabled?:string}}[]}};
  const age=Date.now()-Date.parse(incident.startedAt);
  const previous=commands.find(c=>c.kind!=='inspect_server');
  const agentDisabled=payload.analysis?.trace?.some(v=>v.result?.protection_enabled==='false');
  const blockedReason=!admin?'An organization administrator must approve blocking.':
   !node?'This server is no longer connected to this organization.':
   previous?'This incident already has a protection command. Review its status below.':
   payload.protection_blocked_reason==='proxied_source_requires_edge_or_http_filter'?'This source is behind a proxy or CDN. Configure edge/WAF or trusted HTTP filtering; origin network blocking does not apply.':
   typeof payload.candidate_id!=='string'||!/^[a-f0-9]{32}$/.test(payload.candidate_id)?'The agent did not identify an individual address eligible for blocking.':
   !Number.isFinite(age)||age<0||age>900000?'This alert’s 15-minute approval window has expired. Review a newer incident before blocking.':
   !settings.response.allowRemoteRequests?'Remote protection is disabled in Settings → Response.':
   settings.response.dryRun?'Protection is in dry-run mode. Turn off dry-run in Settings → Response to allow real blocks.':
   agentDisabled?'The agent reported that protection is disabled on this server. Enable its protection policy before approving a block.':null;
  const commandIds=new Set(commands.map(c=>c.id));
  const activity=(await store.eventsForNode(session.orgId,incident.serverId,100)).filter(e=>e.metadata?.incident_id===id||commandIds.has(e.metadata?.command_id??'')).map(e=>({type:e.type,at:e.at,option:e.metadata?.option,channel:e.metadata?.channel}));
  return NextResponse.json({incident,node,commands,activity,canManage:session.role!=='viewer',protection:{canApprove:!blockedReason,blockedReason,ttlSeconds:Math.min(settings.response.defaultTtlSeconds,settings.response.maxTtlSeconds,900)}});
}

export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  if(req.headers.get('origin')!==requestOrigin(req))return NextResponse.json({error:'Same-origin request required'},{status:403});
  const session=await operator(req);
  if(!session||session.role==='viewer')return NextResponse.json({error:'forbidden'},{status:403});
  const {state}=await req.json() as {state?:string};
  if(!state||!['acknowledged','resolved','watch'].includes(state))return NextResponse.json({error:'state must be acknowledged, resolved, or watch'},{status:400});
  const {id}=await params;
  const existing=await store.incident(session.orgId,id);
  if(!existing)return NextResponse.json({error:'not found'},{status:404});
  if(state==='resolved'&&(await commandsFor(session.orgId)).some(c=>c.incidentId===id&&['queued','applied'].includes(c.status)&&c.kind!=='inspect_server')&&!await destructiveAccess(req))return NextResponse.json({error:'Administrator approval required to remove active protection'},{status:403});
  const updated={...existing,state,updatedAt:new Date().toISOString()};
  await store.putIncident(updated);
  if(state==='resolved')await cancelIncidentProtection(session.orgId,id);
  await store.putEvent({id:randomUUID(),tenantId:session.orgId,serverId:existing.serverId,agentId:existing.agentId,type:'response.received',at:updated.updatedAt,metadata:{incident_id:id,channel:'console',option:state==='resolved'?'dismiss':state==='watch'?'watch':'investigating'}});
  return NextResponse.json(updated);
}
