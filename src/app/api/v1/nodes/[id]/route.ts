import{NextRequest,NextResponse}from'next/server';import{operator}from'@/lib/operator';import{store}from'@/lib/store';
import {destructiveAccess} from '@/lib/destructive-access';
import {commandsFor} from '@/lib/protection-commands';
import {withIncidentProtection} from '@/lib/incident-groups';
import {validateWebsiteUrls} from '@/lib/server-sites';
import {validateServerEdits} from '@/lib/server-metadata';
import {readBody} from '@/lib/read-body';
export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const session=await destructiveAccess(req);if(!session)return NextResponse.json({error:'Administrator access and same-origin request required'},{status:403});
 const {id}=await params;if(!await store.node(session.orgId,id))return NextResponse.json({error:'Server not found'},{status:404});
 let websiteUrls:string[]|undefined,changes;try{const input=JSON.parse(await readBody(req,16384));if(!input||typeof input!=='object')throw Error('Invalid server details');if(input.websiteUrls!==undefined)websiteUrls=validateWebsiteUrls(input.websiteUrls);changes=validateServerEdits(input);if(websiteUrls===undefined&&!Object.keys(changes).length)throw Error('No server details provided');}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Invalid server details'},{status:400});}
 try{if(Object.keys(changes).length)await store.setNodeMetadata(session.orgId,id,changes);if(websiteUrls!==undefined)await store.setNodeWebsites(session.orgId,id,websiteUrls);}catch{return NextResponse.json({error:'Server was removed or changed; reload and retry'},{status:409});}
 return NextResponse.json({saved:true,...(websiteUrls?{websiteUrls}:{})});
}
export async function DELETE(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const session=await destructiveAccess(req);if(!session)return NextResponse.json({error:'Administrator access and same-origin request required'},{status:403});
 const {id}=await params;const input=await req.json().catch(()=>null);
 if(input?.confirmation!==id)return NextResponse.json({error:'Server ID confirmation required'},{status:400});
 if(!await store.node(session.orgId,id))return NextResponse.json({error:'Server not found'},{status:404});
 await store.retireNode(session.orgId,id);return NextResponse.json({removed:true});
}
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){const session=await operator(req);if(!session)return NextResponse.json({error:'unauthorized'},{status:401});const {id}=await params;const node=await store.node(session.orgId,id);if(!node)return NextResponse.json({error:'not found'},{status:404});const [events,incidents,commands]=await Promise.all([store.eventsForNode(session.orgId,id),store.incidentsForNode(session.orgId,id),commandsFor(session.orgId)]);return NextResponse.json({node,events,canManage:session.role==='root'||session.role==='admin',incidents:withIncidentProtection(incidents,commands)})}
