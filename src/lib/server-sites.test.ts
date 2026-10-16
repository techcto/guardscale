import {test} from 'node:test';import assert from 'node:assert/strict';
import {validateWebsiteUrls,validateDiscoveredHosts} from './server-sites';
test('website links are bounded explicit HTTP(S) URLs, never credential-bearing or executable',()=>{
 assert.deepEqual(validateWebsiteUrls(['https://example.com','https://example.com/','http://localhost:8186']),['https://example.com/','http://localhost:8186/']);
 for(const value of ['javascript:alert(1)','file:///etc/passwd','https://user:secret@example.com','https://example.com/?token=secret','https://example.com/#token'])assert.throws(()=>validateWebsiteUrls([value]));
 assert.throws(()=>validateWebsiteUrls(Array(21).fill('https://example.com')));
 assert.deepEqual(validateDiscoveredHosts(['Example.com','example.com','*.example.com','${HOST}','evil.com/path']),['example.com']);
});
