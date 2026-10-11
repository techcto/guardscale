import{NextRequest,NextResponse}from'next/server';import{agent,body,unauthorized}from'@/lib/http';import{store}from'@/lib/store';
export async function POST(req:NextRequest){
 const id=await agent(req);if(!id)return unauthorized();
 const v=await body(req) as {server_id?:string;platform?:string;tags?:string[];display_name?:string};
 if(!v.server_id)return NextResponse.json({error:'server_id required'},{status:400});
 const existing=await store.nodeRecord(id.tenantId,v.server_id);
 if(existing?.deletedAt||existing&&existing.agentId!==id.agentId)return NextResponse.json({error:'Server removed or enrollment mismatch'},{status:403});
 try{await store.upsertNode({tenantId:id.tenantId,agentId:id.agentId,serverId:v.server_id,displayName:v.display_name??existing?.displayName??v.server_id,platform:v.platform??existing?.platform,tags:v.tags??existing?.tags??[],status:'healthy',createdAt:existing?.createdAt??new Date().toISOString(),lastHeartbeat:new Date().toISOString()})}
 catch(error){if(error instanceof Error&&(error.name==='ConditionalCheckFailedException'||error.message==='Server removed'))return NextResponse.json({error:'Server removed'},{status:403});throw error}
 return NextResponse.json({status:'accepted'},{status:202});
}
