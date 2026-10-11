import {NextRequest,NextResponse} from 'next/server';
import {operator} from '@/lib/operator';
import {store} from '@/lib/store';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const session=await operator(req);if(!session)return NextResponse.json({error:'unauthorized'},{status:401});
 const nodes=await store.nodes(session.orgId);
 const groups=await Promise.all(nodes.map(async node=>(await store.eventsForNode(session.orgId,node.serverId,50)).map(e=>({id:`${node.serverId}:${e.id??e.at+e.type}`,serverId:node.serverId,serverName:node.displayName,at:e.at,type:e.type,message:e.metadata?.message??e.type}))));
 const entries=groups.flat().sort((a,b)=>b.at.localeCompare(a.at)).slice(0,150).reverse();
 return NextResponse.json({entries},{headers:{'Cache-Control':'private, no-store','Vary':'Cookie'}});
}
