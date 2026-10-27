import {test} from 'node:test';import assert from 'node:assert/strict';
import {groupIncidents} from './incident-groups';
const incident=(id:string,serverId:string,source?:string)=>({incidentId:id,tenantId:'org',serverId,agentId:'agent',state:'review',startedAt:'2026-10-27T12:00:00Z',updatedAt:'2026-10-27T12:00:00Z',payload:{source_ip:source}});
test('source grouping retains every incident and spans servers without merging unknown sources',()=>{
 const rows=[incident('one','s1','192.0.2.20'),incident('two','s2','192.0.2.20'),incident('three','s1','192.0.2.21'),incident('four','s1'),incident('five','s2')];
 const groups=groupIncidents(rows);assert.equal(groups.length,4);const source=groups.find(g=>g.source==='192.0.2.20')!;assert.equal(source.incidents.length,2);assert.equal(source.servers.length,2);assert.equal(groups.flatMap(g=>g.incidents).length,rows.length);
 assert.deepEqual(groupIncidents([...rows].reverse()).map(g=>g.key),groups.map(g=>g.key),'stable grouping across reordered responses');
});
