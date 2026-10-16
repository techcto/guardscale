const labels:Record<string,{title:string;explanation:string}>={
 UniqueURLStorm:{title:'Unusually varied website requests',explanation:'Requests touched many different URLs. This can be scanning or crawling, but does not prove an attack.'},
 PaginationEnumeration:{title:'Repeated page-number scanning',explanation:'Requests traversed many page numbers, including deep pages.'},
 QueryParameterAbuse:{title:'Repeated costly query patterns',explanation:'Many requests used query parameters configured as expensive for this server.'},
 TrafficSpike:{title:'Website traffic increased sharply',explanation:'The request rate exceeded the configured traffic baseline.'},
 HTTPFailureSpike:{title:'Gateway timeouts increased',explanation:'An unusually high proportion of requests returned HTTP 504 gateway timeouts.'},
 DirectOriginAccess:{title:'Requests bypassed origin verification',explanation:'Requests to a protected host lacked the configured origin verification.'},
 DistributedCrawler:{title:'Coordinated crawling pattern',explanation:'Multiple clients traversed many URLs with a shared user-agent pattern. This is a pattern, not proof of shared identity.'},
 PHPSaturation:{title:'PHP capacity warning',explanation:'The detector observed slow PHP activity or PHP worker saturation warnings.'},
 SlowStackStorm:{title:'Repeated slow PHP execution',explanation:'A normalized slow PHP stack repeated in the detection window.'},
};
type FindingSummary={title:string;explanation:string;severity:string;evidence:string[];metrics:Record<string,unknown>};
export function incidentSummary(payload:unknown){
 const value=payload&&typeof payload==='object'?payload as {findings?:unknown}:{};
 const findings:FindingSummary[]=(Array.isArray(value.findings)?value.findings:[]).slice(0,20).flatMap(item=>{
  if(!item||typeof item!=='object'||typeof item.name!=='string')return [];
  const known=labels[item.name];
  return [{title:known?.title??'Server activity needs review',explanation:known?.explanation??'The agent reported a detection that needs review.',severity:typeof item.severity==='string'?item.severity:'unrated',evidence:(Array.isArray(item.evidence)?item.evidence:[]).filter((v:unknown):v is string=>typeof v==='string').slice(0,5),metrics:item.metrics&&typeof item.metrics==='object'?item.metrics as Record<string,unknown>:{}}];
 });
 const metrics=findings[0]?.metrics??{};
 const counts=[['requests','Requests observed'],['unique_urls','Different URLs'],['unique_ips','Client addresses'],['504_percent','Gateway timeouts (%)']].flatMap(([key,label])=>typeof metrics[key]==='number'&&Number.isFinite(metrics[key])?[{label,value:metrics[key] as number}]:[]);
 return{title:findings[0]?.title??'Server activity needs review',findings,counts};
}
