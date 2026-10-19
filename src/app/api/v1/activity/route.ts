import {NextRequest,NextResponse} from 'next/server';
import {operator} from '@/lib/operator';
import {organizationActivity,watchActivity} from '@/lib/live-activity';
import {eventStream,untilAborted,wantsEventStream} from '@/lib/event-stream';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const session=await operator(req);if(!session)return NextResponse.json({error:'unauthorized'},{status:401});
 // `Accept: text/event-stream` streams the same organization-scoped entries live, until the session expires.
 if(wantsEventStream(req))return eventStream(req,async(send,signal)=>{const watch=await watchActivity('org:'+session.orgId,()=>organizationActivity(session.orgId),entries=>send('entries',{entries}));try{send('snapshot',{entries:watch.snapshot});await untilAborted(signal)}finally{watch.stop()}},{maxMs:session.expiresAt-Date.now()});
 return NextResponse.json({entries:await organizationActivity(session.orgId)},{headers:{'Cache-Control':'private, no-store','Vary':'Cookie'}});
}
