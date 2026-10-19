import {createHmac} from 'node:crypto';
import {store} from './store';
import {publicAccessLog} from './public-access-log';
// The activity snapshots behind the console and public log panels. GET returns them as JSON;
// streaming requests receive the same entries live through a shared watcher.
export type ActivityEntry={id:string;serverId:string;serverName:string;at:string;type:string;message:string};
export type PublicEntry={id:string;method:string;status:number;durationMs:number};
export async function organizationActivity(orgId:string):Promise<ActivityEntry[]>{
 const nodes=await store.nodes(orgId);
 const groups=await Promise.all(nodes.map(async node=>(await store.eventsForNode(orgId,node.serverId,50)).map(e=>({id:`${node.serverId}:${e.id??e.at+e.type}`,serverId:node.serverId,serverName:node.displayName,at:e.at,type:e.type,message:e.metadata?.message??e.type}))));
 return groups.flat().sort((a,b)=>b.at.localeCompare(a.at)||b.id.localeCompare(a.id)).slice(0,150);
}
export async function publicActivity():Promise<PublicEntry[]>{
 const rows:{at:number;entry:PublicEntry}[]=[];
 const secret=process.env.GUARDSCALE_SESSION_SECRET;
 if(!secret)return [];
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
 return rows.sort((a,b)=>b.at-a.at||b.entry.id.localeCompare(a.entry.id)).slice(0,80).map(r=>r.entry);
}
// One shared reader per feed and process, running only while someone watches. Each tick reads the
// snapshot once and hands every newly stored entry (oldest first) to all watchers.
type Watcher<E>=(entries:E[])=>void;
type Feed<E>={watchers:Set<Watcher<E>>;seen:Set<string>;latest:E[];timer?:ReturnType<typeof setInterval>;busy:boolean;ready:Promise<void>};
const feeds=new Map<string,Feed<{id:string}>>();
export const WATCH_INTERVAL_MS=1000;
export async function watchActivity<E extends {id:string}>(key:string,read:()=>Promise<E[]>,watcher:Watcher<E>){
 let feed=feeds.get(key) as Feed<E>|undefined;
 if(!feed){
  // Registered synchronously so concurrent first viewers share one initial read.
  const created:Feed<E>={watchers:new Set(),seen:new Set(),latest:[],busy:false,ready:Promise.resolve()};
  created.ready=read().then(latest=>{created.latest=latest;created.seen=new Set(latest.map(e=>e.id))},error=>{if(feeds.get(key)===(created as unknown))feeds.delete(key);throw error});
  feeds.set(key,created as unknown as Feed<{id:string}>);feed=created;
 }
 const f=feed;await f.ready;f.watchers.add(watcher);
 f.timer??=setInterval(async()=>{
  if(f.busy)return;f.busy=true;
  try{const latest=await read(),arrived=latest.filter(e=>!f.seen.has(e.id)).reverse();f.seen=new Set([...latest.map(e=>e.id),...arrived.map(e=>e.id)]);f.latest=latest;if(arrived.length)for(const w of f.watchers)w(arrived)}
  catch{/* transient store errors: the next tick retries */}
  finally{f.busy=false}
 },WATCH_INTERVAL_MS);
 return {snapshot:f.latest,stop(){f.watchers.delete(watcher);if(!f.watchers.size){clearInterval(f.timer);feeds.delete(key)}}};
}
