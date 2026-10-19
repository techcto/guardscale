'use client';
import {useEffect,useState} from 'react';
import {readEventStream} from './read-event-stream';
// Streams a log feed from its existing endpoint (`Accept: text/event-stream`): a snapshot first, then each
// newly stored entry as it lands. Pausing disconnects; resuming reconnects and the snapshot fills the gap.
export function useLiveFeed<T extends {id:string}>(url:string,{paused,limit}:{paused:boolean;limit:number}){
 const [entries,setEntries]=useState<T[]>([]),[error,setError]=useState(false);
 useEffect(()=>{
  if(paused)return;const controller=new AbortController();let retry:ReturnType<typeof setTimeout>;
  async function connect(){
   try{const r=await fetch(url,{headers:{Accept:'text/event-stream'},cache:'no-store',signal:controller.signal});
    await readEventStream(r,(event,data)=>{const rows=(data as {entries?:T[]}).entries??[];setError(false);
     if(event==='snapshot')setEntries(rows);
     else if(event==='entries')setEntries(prev=>{const ids=new Set(prev.map(e=>e.id));return [...rows.filter(e=>!ids.has(e.id)).reverse(),...prev].slice(0,limit)});// arrivals are oldest first; the feed is newest first
     else if(event==='stream.failed')setError(true)})}
   catch{/* reconnect below */}
   finally{if(!controller.signal.aborted){setError(true);retry=setTimeout(connect,3000)}}
  }
  void connect();return()=>{controller.abort();clearTimeout(retry)};
 },[url,paused,limit]);
 return {entries,error};
}
