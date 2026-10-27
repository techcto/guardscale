import {NextRequest,NextResponse} from 'next/server';
import {operator} from '@/lib/operator';
import {destructiveAccess} from '@/lib/destructive-access';
import {readBody} from '@/lib/read-body';
import {uptimeStore} from '@/lib/uptime-store';
import {uptimeLimits,uptimeSummary,type UptimeMonitor} from '@/lib/uptime-model';
import {validateMonitor,uptimeRecipients,uptimeWhatsAppRecipients,uptimeURLId} from '@/lib/uptime';
import {store} from '@/lib/store';

export async function GET(req:NextRequest){
 const session=await operator(req);if(!session?.orgId)return NextResponse.json({error:'Unauthorized'},{status:401});
 const membership=session.role==='root'?null:await store.membership(session.orgId,session.id);
 const canManage=session.role==='root'||membership?.status==='active'&&membership.role==='admin';
 const rows=await uptimeStore.list(session.orgId);
 return NextResponse.json({monitors:rows.map(m=>({id:m.id,name:m.name,url:m.url,autoEnrolled:m.autoEnrolled,sourceServerId:m.sourceServerId,intervalSeconds:m.intervalSeconds,recipientIds:m.recipientIds,whatsapp:m.whatsapp,tags:m.tags,paused:m.paused,state:m.state,stateSince:m.stateSince,failures:m.failures,updatedAt:m.updatedAt,nextCheckAt:m.nextCheckAt,
  samples:m.samples.filter((_,i)=>i%Math.max(1,Math.ceil(m.samples.length/120))===0||i===m.samples.length-1),outages:m.outages.slice(-20),summary:uptimeSummary(m)})),
  recipients:await uptimeRecipients(session.orgId),whatsappRecipients:await uptimeWhatsAppRecipients(session.orgId),canManage,region:process.env.AWS_REGION??'deployment region',limit:uptimeLimits.monitors},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(req:NextRequest){
 const session=await destructiveAccess(req);if(!session)return NextResponse.json({error:'Administrator access and same-origin request required'},{status:403});
 let config;try{config=await validateMonitor(session.orgId,JSON.parse(await readBody(req,8192)))}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Invalid check'},{status:400})}
 const existing=await uptimeStore.list(session.orgId);
 if(existing.some(m=>m.url===config.url))return NextResponse.json({error:'This website already has an uptime check'},{status:409});
 if(existing.length>=uptimeLimits.monitors)return NextResponse.json({error:'This workspace supports up to 50 uptime checks'},{status:409});
 const now=new Date().toISOString(),id=uptimeURLId(config.url),previous=await uptimeStore.get(session.orgId,id);
 if(previous&&!previous.deletedAt)return NextResponse.json({error:'An existing check uses this identifier; edit that check instead'},{status:409});
 const monitor:UptimeMonitor={...config,id,orgId:session.orgId,revision:0,createdAt:now,updatedAt:now,nextCheckAt:now,state:'unknown',failures:0,successes:0,samples:[],notices:[],outages:[]};
 if(!await uptimeStore.save(monitor,previous?.revision))return NextResponse.json({error:'This website was just enrolled; refresh the check list'},{status:409});
 return NextResponse.json({id:monitor.id},{status:201});
}
