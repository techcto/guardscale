import type {IncidentRecord} from './model';
export type IncidentWithProtection=IncidentRecord&{protection?:{status:string;expiresAt:string}};
export function withIncidentProtection(incidents:IncidentRecord[],commands:{incidentId:string;status:string;expiresAt:string;createdAt:string;kind?:string}[]):IncidentWithProtection[]{
 const latest=new Map<string,{status:string;expiresAt:string}>();
 for(const command of [...commands].filter(c=>c.kind!=='inspect_server').sort((a,b)=>b.createdAt.localeCompare(a.createdAt)))if(!latest.has(command.incidentId))latest.set(command.incidentId,{status:command.status,expiresAt:command.expiresAt});
 return incidents.map(i=>({...i,protection:latest.get(i.incidentId)}));
}
export function groupIncidents(incidents:IncidentWithProtection[]){
 const groups=new Map<string,{key:string;source:string;incidents:IncidentWithProtection[];servers:string[];active:number;latest:string}>();
 for(const incident of incidents){
  const source=(incident.payload as {source_ip?:string}|null)?.source_ip;
  // An absent source is not evidence that unrelated incidents share an attacker.
  const key=source||'unknown:'+incident.serverId+':'+incident.incidentId;
  let group=groups.get(key);if(!group){group={key,source:source||'Source not identified',incidents:[],servers:[],active:0,latest:incident.startedAt};groups.set(key,group);}
  group.incidents.push(incident);if(!group.servers.includes(incident.serverId))group.servers.push(incident.serverId);
  if(incident.state!=='resolved')group.active++;
  if(incident.startedAt>group.latest)group.latest=incident.startedAt;
 }
 for(const group of groups.values())group.incidents.sort((a,b)=>b.startedAt.localeCompare(a.startedAt)||a.incidentId.localeCompare(b.incidentId));
 return [...groups.values()].sort((a,b)=>b.latest.localeCompare(a.latest)||a.key.localeCompare(b.key));
}
