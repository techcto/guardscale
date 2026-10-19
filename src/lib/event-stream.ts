// Server-Sent Events on an existing route when the client asks for `Accept: text/event-stream`
// (same framing as AutoVision's pipeline stream: id, event, JSON data, heartbeat comments).
export const wantsEventStream=(request:Request)=>request.headers.get('accept')?.includes('text/event-stream')??false;
export function eventStream(request:Request,run:(send:(event:string,data:unknown)=>void,signal:AbortSignal)=>Promise<void>,{maxMs}:{maxMs?:number}={}){
 const encoder=new TextEncoder(),abort=new AbortController();let cancelled=false,sequence=0;
 const signal=AbortSignal.any([request.signal,abort.signal,...(maxMs?[AbortSignal.timeout(Math.max(0,maxMs))]:[])]);
 const stream=new ReadableStream<Uint8Array>({
  start(controller){
   const send=(event:string,data:unknown)=>{if(cancelled||signal.aborted)return;controller.enqueue(encoder.encode(`id: ${++sequence}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`))};
   const heartbeat=setInterval(()=>{if(!cancelled&&!signal.aborted)controller.enqueue(encoder.encode(': heartbeat\n\n'))},5000);
   void run(send,signal).catch(()=>{if(!cancelled&&!signal.aborted)send('stream.failed',{error:'Activity temporarily unavailable'})}).finally(()=>{clearInterval(heartbeat);if(!cancelled)try{controller.close()}catch{}});
  },
  cancel(){cancelled=true;abort.abort()}
 });
 return new Response(stream,{headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-store','X-Accel-Buffering':'no'}});
}
// Waits until the client disconnects (or the stream reaches its limit).
export const untilAborted=(signal:AbortSignal)=>new Promise<void>(resolve=>{if(signal.aborted)resolve();else signal.addEventListener('abort',()=>resolve(),{once:true})});
