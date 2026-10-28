import {NextRequest,NextResponse} from 'next/server';
import {authenticate} from '@/lib/auth';import {store} from '@/lib/store';import {readBody} from '@/lib/read-body';
import {agentCredential,credentialHash,saveAgentCredential} from '@/lib/agent-credentials';
export async function POST(req:NextRequest){
 const identity=await authenticate(req.headers.get('authorization'));if(!identity)return NextResponse.json({error:'Unauthorized'},{status:401});
 let input;try{input=JSON.parse(await readBody(req,4096));}catch{return NextResponse.json({error:'Invalid credential request'},{status:400});}
 if(!input||typeof input!=='object'||Array.isArray(input)||typeof input.server_id!=='string'||!/^[a-zA-Z0-9._:-]{1,100}$/.test(input.server_id)||typeof input.secret!=='string'||!/^[a-f0-9]{64}$/.test(input.secret))return NextResponse.json({error:'Invalid credential request'},{status:400});
 if(identity.serverId&&identity.serverId!==input.server_id)return NextResponse.json({error:'Enrollment mismatch'},{status:403});
 const node=await store.nodeRecord(identity.tenantId,input.server_id);
 if(node?.deletedAt||node&&node.agentId!==identity.agentId)return NextResponse.json({error:'Server removed or enrollment mismatch'},{status:403});
 const previous=await agentCredential(identity.tenantId,identity.agentId),tokenHash=credentialHash(input.secret);
 if(previous&&(previous.serverId!==input.server_id||!identity.serverId))return NextResponse.json({error:'Existing agent credentials are required'},{status:403});
 if(previous?.tokenHash!==tokenHash){const now=new Date().toISOString();if(!await saveAgentCredential({tenantId:identity.tenantId,agentId:identity.agentId,serverId:input.server_id,tokenHash,createdAt:previous?.createdAt??now,updatedAt:now},previous?.tokenHash))return NextResponse.json({error:'Credentials changed; retry with the saved agent key'},{status:409});}
 return NextResponse.json({registered:true,tenantId:identity.tenantId,agentId:identity.agentId,serverId:input.server_id},{headers:{'Cache-Control':'no-store'}});
}
