import {NextRequest,NextResponse} from 'next/server';
import {agent,unauthorized} from '@/lib/http';
import {store} from '@/lib/store';
import {readBody} from '@/lib/read-body';
import {validateHostMetrics} from '@/lib/host-metrics';
export async function POST(req:NextRequest){
 const identity=await agent(req);if(!identity)return unauthorized();
 let v;try{v=JSON.parse(await readBody(req,4096));if(typeof v?.server_id!=='string')throw Error();}catch{return NextResponse.json({error:'Invalid metrics request'},{status:400});}
 const node=await store.node(identity.tenantId,v.server_id);if(!node||node.agentId!==identity.agentId)return NextResponse.json({error:'Server not enrolled for this agent'},{status:403});
 let metrics;try{metrics=validateHostMetrics(v.metrics);}catch{return NextResponse.json({error:'Invalid metrics sample'},{status:400});}
 try{await store.setNodeMetrics(identity.tenantId,node.serverId,metrics,identity.agentId);}catch{return NextResponse.json({error:'Server enrollment changed'},{status:409});}
 return NextResponse.json({status:'accepted'},{status:202});
}
