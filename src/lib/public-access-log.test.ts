import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicAccessLog} from './public-access-log';
test('public projection excludes private fields',()=>{
 const result=publicAccessLog('POST /private?token=secret status=403 duration_ms=8.4 user=alice@private.test ip=10.0.0.1');
 assert.deepEqual(result,{method:'POST',status:403,durationMs:8});
 assert.equal(JSON.stringify(result).includes('secret'),false);
});
test('raw and malformed log messages are not published',()=>{
 for(const value of ['10.0.0.1 GET /private','password=secret','GET /private status=999 duration_ms=8','GET /private status=200 duration_ms=secret'])assert.equal(publicAccessLog(value),null);
});
