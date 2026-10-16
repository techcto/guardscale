import{NextRequest,NextResponse}from'next/server';import{operator}from'@/lib/operator';import{store}from'@/lib/store';
import {destructiveAccess} from '@/lib/destructive-access';
import {validateWebsiteUrls} from '@/lib/server-sites';
export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const session=await destructiveAccess(req);if(!session)return NextResponse.json({error:'Administrator access and same-origin request required'},{status:403});
 const {id}=await params;if(!await store.node(session.orgId,id))return NextResponse.json({error:'Server not found'},{status:404});
 let websiteUrls:string[];try{websiteUrls=validateWebsiteUrls((await req.json()).websiteUrls);}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Invalid websites'},{status:400});}
 try{await store.setNodeWebsites(session.orgId,id,websiteUrls);}catch{return NextResponse.json({error:'Server was removed or changed; reload and retry'},{status:409});}
 return NextResponse.json({websiteUrls});
}
export async function DELETE(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const session=await destructiveAccess(req);if(!session)return NextResponse.json({error:'Administrator access and same-origin request required'},{status:403});
 const {id}=await params;const input=await req.json().catch(()=>null);
 if(input?.confirmation!==id)return NextResponse.json({error:'Server ID confirmation required'},{status:400});
 if(!await store.node(session.orgId,id))return NextResponse.json({error:'Server not found'},{status:404});
 await store.retireNode(session.orgId,id);return NextResponse.json({removed:true});
}
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){const session=await operator(req);if(!session)return NextResponse.json({error:'unauthorized'},{status:401});const {id}=await params;const node=await store.node(session.orgId,id);if(!node)return NextResponse.json({error:'not found'},{status:404});const [events,incidents]=await Promise.all([store.eventsForNode(session.orgId,id),store.incidentsForNode(session.orgId,id)]);return NextResponse.json({node,events,incidents})}
