import {NextRequest,NextResponse} from 'next/server';
import {agent,unauthorized} from '@/lib/http';
import {store} from '@/lib/store';
const sources=new Set(['apache_access','apache_error','php_error','php_slow']);
export async function POST(req:NextRequest){
 const identity=await agent(req);if(!identity)return unauthorized();
 const text=await req.text();if(text.length>100_000)return NextResponse.json({error:'Batch too large'},{status:413});
 let input;try{input=JSON.parse(text)}catch{return NextResponse.json({error:'Invalid JSON'},{status:400})}
 const {server_id,entries}=input;
 if(typeof server_id!=='string'||!Array.isArray(entries)||entries.length<1||entries.length>50)return NextResponse.json({error:'Invalid batch'},{status:400});
 const node=await store.node(identity.tenantId,server_id);if(!node||node.agentId!==identity.agentId)return NextResponse.json({error:'Server enrollment mismatch'},{status:403});
 if(entries.some(e=>!e||typeof e.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(e.id)||!sources.has(e.source)||typeof e.message!=='string'||e.message.length>1500||typeof e.at!=='string'||!Number.isFinite(Date.parse(e.at))))return NextResponse.json({error:'Invalid entry'},{status:400});
 for(const e of entries)await store.putEvent({id:e.id,tenantId:identity.tenantId,agentId:identity.agentId,serverId:server_id,type:'log.'+e.source,at:e.at,metadata:{message:e.message,source:e.source}});
 return NextResponse.json({accepted:entries.length},{status:202});
}
