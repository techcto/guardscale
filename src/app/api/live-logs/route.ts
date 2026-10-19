import {NextResponse} from 'next/server';
import {publicActivity,watchActivity,type PublicEntry} from '@/lib/live-activity';
import {eventStream,untilAborted,wantsEventStream} from '@/lib/event-stream';
export const dynamic='force-dynamic';
type Snapshot={scope:'platform';entries:PublicEntry[]};
let cached:Snapshot|undefined,expires=0,pending:Promise<Snapshot>|undefined;
export async function GET(req:Request){
 // `Accept: text/event-stream` streams the same privacy-safe projection; one shared reader serves every viewer.
 if(wantsEventStream(req))return eventStream(req,async(send,signal)=>{const watch=await watchActivity('public',publicActivity,entries=>send('entries',{entries}));try{send('snapshot',{entries:watch.snapshot});await untilAborted(signal)}finally{watch.stop()}});
 try{
  if(!cached||Date.now()>=expires){pending??=publicActivity().then(entries=>{cached={scope:'platform',entries};expires=Date.now()+5000;return cached}).finally(()=>{pending=undefined});await pending}
  return NextResponse.json(cached,{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'Activity temporarily unavailable'},{status:503,headers:{'Cache-Control':'no-store'}})}
}
