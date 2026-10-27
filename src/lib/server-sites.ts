export function validateWebsiteUrls(input:unknown):string[]{
 if(!Array.isArray(input)||input.length>20)throw Error('Provide at most 20 website URLs');
 return [...new Set(input.map(value=>{
  if(typeof value!=='string'||value.length>2048)throw Error('Invalid website URL');
  let url:URL;try{url=new URL(value.trim());}catch{throw Error('Use a full http:// or https:// URL');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error('Website URLs must use HTTP(S), without credentials, query strings or fragments');
  return url.href;
 }))];
}
export function validateDiscoveredHosts(input:unknown):string[]{
 if(!Array.isArray(input))return [];
 return [...new Set(input.filter((v):v is string=>typeof v==='string'&&v.length<=253&&/^[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(v)).map(v=>v.toLowerCase()))].slice(0,20);
}

export function serverDisplayName(node:{displayName:string;serverId:string;discoveredHosts?:string[]}){
 return node.displayName!==node.serverId?node.displayName:validateDiscoveredHosts(node.discoveredHosts)[0]??node.displayName;
}
