import {test} from 'node:test';
import assert from 'node:assert/strict';
import {logStreamSnapshot,pruneLogStream} from './log-stream-window';

test('stream bookkeeping stays bounded across 100,000 arrivals, even without animation callbacks',()=>{
 const limit=80,known=new Set<string>(),sequence=new Map<string,number>();let fresh=new Set<string>();
 let shown:{id:string}[]=[],queue:{id:string}[]=[];
 for(let i=0;i<100000;i+=limit){
  const snapshot=Array.from({length:limit},(_,j)=>({id:String(i+j)})).reverse();
  for(const row of snapshot){known.add(row.id);sequence.set(row.id,i);fresh.add(row.id)}
  fresh=pruneLogStream(known,sequence,fresh,snapshot,queue,shown);
  assert.ok(known.size<=3*limit);assert.ok(sequence.size<=3*limit);assert.ok(fresh.size<=3*limit);
  queue=shown;shown=snapshot;
 }
 fresh=pruneLogStream(known,sequence,fresh,[],[],[]);
 assert.equal(known.size,0);assert.equal(sequence.size,0);assert.equal(fresh.size,0);
});
test('pruning preserves queued and displayed IDs and their ordering metadata',()=>{
 const known=new Set(['old','shown','queued','input']),sequence=new Map([...known].map((id,i)=>[id,i]));
 const fresh=pruneLogStream(known,sequence,new Set(['old','shown']),[{id:'input'}],[{id:'queued'}],[{id:'shown'}]);
 assert.deepEqual([...known],['shown','queued','input']);assert.equal(sequence.get('queued'),2);assert.deepEqual([...fresh],['shown']);
 assert.equal(pruneLogStream(known,sequence,fresh,[{id:'input'},{id:'queued'},{id:'shown'}]),fresh);
});
test('snapshots deduplicate IDs and cap oversized batches without reversing newest-first order',()=>{
 assert.deepEqual(logStreamSnapshot([{id:'c'},{id:'c'},{id:'b'},{id:'a'}],2),[{id:'c'},{id:'b'}]);
});
