import {test} from 'node:test';import assert from 'node:assert/strict';import {incidentSummary} from './incident-summary';
test('incident summary explains actual findings without manufacturing evidence or attack certainty',()=>{
 const summary=incidentSummary({findings:[{name:'UniqueURLStorm',severity:'warning',evidence:['60 unique URLs'],metrics:{requests:60,unique_urls:60,unique_ips:1}}]});
 assert.equal(summary.title,'Unusually varied website requests');assert.equal(summary.counts[0].value,60);
 assert.match(summary.findings[0].explanation,/does not prove an attack/);
 assert.deepEqual(incidentSummary({analysis:{status:'not_configured'}}).findings,[]);
 assert.deepEqual(incidentSummary({findings:[null,{},'bad']}).counts,[]);
});
