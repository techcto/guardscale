import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WATCH_INTERVAL_MS,watchActivity} from './live-activity';
import {eventStream,untilAborted} from './event-stream';
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
test('viewers of a feed share one reader and receive each newly stored entry once, oldest first',async()=>{
 let rows=[{id:'b'},{id:'a'}],reads=0;const read=async()=>{reads++;return rows};
 const one:string[][]=[],two:string[][]=[];
 const w1=await watchActivity('test-feed',read,e=>one.push(e.map(x=>x.id))),w2=await watchActivity('test-feed',read,e=>two.push(e.map(x=>x.id)));
 assert.deepEqual(w1.snapshot.map(e=>e.id),['b','a']);assert.deepEqual(w2.snapshot.map(e=>e.id),['b','a']);
 rows=[{id:'d'},{id:'c'},{id:'b'},{id:'a'}];
 await wait(WATCH_INTERVAL_MS*1.6);
 assert.deepEqual(one,[['c','d']],'new entries arrive oldest first');assert.deepEqual(two,[['c','d']]);
 const before=reads;await wait(WATCH_INTERVAL_MS*1.3);
 assert.ok(reads-before<=2,'one shared reader per tick, not one per viewer');
 assert.deepEqual(one,[['c','d']],'already delivered entries are not repeated');
 w1.stop();w2.stop();const stopped=reads;await wait(WATCH_INTERVAL_MS*1.3);
 assert.equal(reads,stopped,'reader stops when the last viewer leaves');
});
test('event streams use id/event/data frames and stop when the client disconnects',async()=>{
 const client=new AbortController();
 const response=eventStream(new Request('http://localhost/api/v1/activity',{signal:client.signal}),async(send,signal)=>{send('snapshot',{entries:[{id:'a'}]});send('entries',{entries:[{id:'b'}]});await untilAborted(signal)});
 assert.equal(response.headers.get('content-type'),'text/event-stream; charset=utf-8');assert.equal(response.headers.get('x-accel-buffering'),'no');
 const reader=response.body!.getReader(),decoder=new TextDecoder();let text='';
 while(!text.includes('event: entries')){const {value}=await reader.read();text+=decoder.decode(value)}
 assert.match(text,/^id: 1\nevent: snapshot\ndata: \{"entries":\[\{"id":"a"\}\]\}\n\n/);assert.match(text,/id: 2\nevent: entries\ndata: \{"entries":\[\{"id":"b"\}\]\}\n\n/);
 client.abort();for(;;){const {done}=await reader.read();if(done)break}
});
