// Reads a Server-Sent Events response frame by frame (same parsing as AutoVision's pipeline reader).
export async function readEventStream(response:Response,onEvent:(event:string,data:unknown)=>void){
 if(!response.ok)throw Error(`Stream unavailable: ${response.status}`);
 const reader=response.body?.getReader();if(!reader)throw Error('Streaming response unavailable');
 const decoder=new TextDecoder();let buffer='';
 try{
  for(;;){const chunk=await reader.read();buffer+=decoder.decode(chunk.value??new Uint8Array(),{stream:!chunk.done});let split;
   while((split=buffer.indexOf('\n\n'))>=0){const packet=buffer.slice(0,split);buffer=buffer.slice(split+2);const lines=packet.split('\n'),event=lines.find(l=>l.startsWith('event: '))?.slice(7)??'message',data=lines.filter(l=>l.startsWith('data: ')).map(l=>l.slice(6)).join('\n');if(data)onEvent(event,JSON.parse(data))}
   if(chunk.done)break;
  }
 }finally{reader.releaseLock()}
}
