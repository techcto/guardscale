import {NextRequest,NextResponse} from 'next/server';
import {destructiveAccess} from '@/lib/destructive-access';
import {readBody} from '@/lib/read-body';
import {uptimeStore} from '@/lib/uptime-store';
import {validateMonitor} from '@/lib/uptime';

export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const session=await destructiveAccess(req);if(!session)return NextResponse.json({error:'Administrator access and same-origin request required'},{status:403});
 const {id}=await params,current=await uptimeStore.get(session.orgId,id);if(!current||current.deletedAt)return NextResponse.json({error:'Check not found'},{status:404});
 let config;try{config=await validateMonitor(session.orgId,JSON.parse(await readBody(req,8192)))}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Invalid check'},{status:400})}
 const now=new Date().toISOString(),targetChanged=config.url!==current.url;
 if(targetChanged&&(await uptimeStore.list(session.orgId)).some(m=>m.id!==id&&m.url===config.url))return NextResponse.json({error:'This website already has an uptime check'},{status:409});
 const next={...current,...config,updatedAt:now,nextCheckAt:now,...(targetChanged?{state:'unknown' as const,stateSince:undefined,failures:0,successes:0,samples:[],notices:[],outages:[],activeIncidentId:undefined}:{} )};
 if(targetChanged&&current.activeIncidentId)return NextResponse.json({error:'Resolve the active outage before changing its URL; pause it or create a separate check instead'},{status:409});
 if(!await uptimeStore.save(next,current.revision))return NextResponse.json({error:'Check changed while saving; refresh and retry'},{status:409});
 return NextResponse.json({saved:true});
}
export async function DELETE(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const session=await destructiveAccess(req);if(!session)return NextResponse.json({error:'Administrator access and same-origin request required'},{status:403});
 const {id}=await params,current=await uptimeStore.get(session.orgId,id);if(!current||current.deletedAt)return NextResponse.json({error:'Check not found'},{status:404});
 const body=await req.json().catch(()=>null);if(body?.confirmation!==current.name)return NextResponse.json({error:'Type the check name to confirm deletion'},{status:400});
 const at=new Date().toISOString();
 if(!await uptimeStore.save({...current,paused:true,deletedAt:at,updatedAt:at,samples:[],notices:[],outages:[],activeIncidentId:undefined},current.revision))return NextResponse.json({error:'Check changed; refresh and retry'},{status:409});
 return NextResponse.json({deleted:true});
}
