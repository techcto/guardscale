import {createHmac} from 'node:crypto';
import {NextResponse} from 'next/server';
import {store} from '@/lib/store';
import {publicAccessLog} from '@/lib/public-access-log';
export const dynamic='force-dynamic';
type Entry={id:string;method:string;status:number;durationMs:number};
type Snapshot={scope:'platform';entries:Entry[]};
let cached:Snapshot|undefined,expires=0,pending:Promise<Snapshot>|undefined;
async function aggregate():Promise<Snapshot>{
 const rows:{at:number;entry:Entry}[]=[];
 const secret=process.env.GUARDSCALE_SESSION_SECRET;
 if(!secret)return {scope:'platform',entries:[]};
 const now=Date.now(),cutoff=now-15*60_000;
 for(const org of await store.organizations()){
  for(const node of await store.nodes(org.id)){
   for(const e of await store.eventsForNode(org.id,node.serverId,200)){
    const at=Date.parse(e.at);if(e.type!=='log.apache_access'||!Number.isFinite(at)||at<cutoff||at>now)continue;
    const safe=publicAccessLog(e.metadata?.message??'');if(!safe)continue;
    const id=createHmac('sha256',secret).update(JSON.stringify([org.id,node.serverId,e.id,e.at,e.metadata?.message])).digest('hex');
    rows.push({at,entry:{id,...safe}});
   }
  }
 }
 return {scope:'platform',entries:rows.sort((a,b)=>b.at-a.at).slice(0,80).reverse().map(r=>r.entry)};
}
export async function GET(){
 try{
  if(!cached||Date.now()>=expires){pending??=aggregate().then(value=>{cached=value;expires=Date.now()+5000;return value}).finally(()=>{pending=undefined});await pending}
  return NextResponse.json(cached,{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'Activity temporarily unavailable'},{status:503,headers:{'Cache-Control':'no-store'}})}
}
