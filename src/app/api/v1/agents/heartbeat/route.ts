import {validateDiscoveredHosts} from '@/lib/server-sites';
import {mergeServerTags} from '@/lib/server-metadata';
import{NextRequest,NextResponse}from'next/server';import{agent,body,unauthorized}from'@/lib/http';import{store}from'@/lib/store';import{recordServerHour,serverLimitFor}from'@/lib/usage';
export async function POST(req:NextRequest){
 const id=await agent(req);if(!id)return unauthorized();
 const v=await body(req) as {server_id?:string;platform?:string;agent_version?:unknown;tags?:string[];display_name?:string;discovered_hosts?:unknown};
 if(!v.server_id)return NextResponse.json({error:'server_id required'},{status:400});
 if(v.agent_version!==undefined&&(typeof v.agent_version!=='string'||v.agent_version.length>32||!/^([0-9]+\.[0-9]+\.[0-9]+|dev)$/.test(v.agent_version)))return NextResponse.json({error:'Invalid agent version'},{status:400});
 const existing=await store.nodeRecord(id.tenantId,v.server_id);
 if(v.tags!==undefined&&(!Array.isArray(v.tags)||v.tags.length>40||v.tags.some(t=>typeof t!=='string'||t.length>300)))return NextResponse.json({error:'Invalid server tags'},{status:400});
 const agentDisplayName=v.display_name??existing?.agentDisplayName??existing?.displayName??v.server_id,agentTags=v.tags??existing?.agentTags??existing?.tags??[];
 if(existing?.deletedAt||existing&&existing.agentId!==id.agentId)return NextResponse.json({error:'Server removed or enrollment mismatch'},{status:403});
 // SaaS: a new server registers only within the plan's servers (or the opted-in cap); every reporting server counts server-hours.
 const saas=process.env.GUARDSCALE_DEPLOYMENT_MODE==='saas';
 if(saas&&!existing&&(await store.nodes(id.tenantId)).length>=await serverLimitFor(id.tenantId))return NextResponse.json({error:'Server limit reached for this plan'},{status:402});
 try{await store.upsertNode({tenantId:id.tenantId,agentId:id.agentId,serverId:v.server_id,displayName:existing?.manualDisplayName||agentDisplayName,agentDisplayName,agentTags,platform:v.platform??existing?.platform,agentVersion:typeof v.agent_version==='string'?v.agent_version:existing?.agentVersion,discoveredHosts:v.discovered_hosts===undefined?existing?.discoveredHosts:validateDiscoveredHosts(v.discovered_hosts),tags:mergeServerTags(agentTags,existing?.manualTags??[]),status:'healthy',createdAt:existing?.createdAt??new Date().toISOString(),lastHeartbeat:new Date().toISOString()})}
 catch(error){if(error instanceof Error&&(error.name==='ConditionalCheckFailedException'||error.message==='Server removed'))return NextResponse.json({error:'Server removed'},{status:403});throw error}
 if(saas)await recordServerHour(id.tenantId,v.server_id);
 return NextResponse.json({status:'accepted'},{status:202});
}
