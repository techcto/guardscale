import type {Node} from './model';
export type ServerEdits={manualDisplayName?:string;manualTags?:string[]};
export function mergeServerTags(agent:string[],manual:string[]){
 const keys=new Set(manual.filter(t=>t.includes('=')).map(t=>t.split('=')[0]));
 return [...new Set([...agent.filter(t=>!t.includes('=')||!keys.has(t.split('=')[0])),...manual])].slice(0,40);
}
export function validateServerEdits(input:Record<string,unknown>):ServerEdits{
 const changes:ServerEdits={};
 if(input.manualDisplayName!==undefined){if(typeof input.manualDisplayName!=='string'||input.manualDisplayName.length>100)throw Error('Server name must be 100 characters or fewer');changes.manualDisplayName=input.manualDisplayName.trim();}
 if(input.manualTags!==undefined){if(!Array.isArray(input.manualTags)||input.manualTags.length>20||input.manualTags.some(t=>typeof t!=='string'||t.length>100||/[\r\n\x00]/.test(t)))throw Error('Use up to 20 groups/tags, each 100 characters or fewer');changes.manualTags=[...new Set((input.manualTags as string[]).map(t=>t.trim()).filter(Boolean))];}
 return changes;
}
export function serverGroup(n:Pick<Node,'tags'|'manualTags'>){
 const tags=mergeServerTags(n.tags??[],n.manualTags??[]);
 for(const prefix of ['Group=','aws:cloudformation:stack-name=','Stack=','Application=']){const tag=tags.find(t=>t.startsWith(prefix));if(tag)return tag.slice(prefix.length);}
 return '';
}
export function effectiveServerEdits(node:Node,changes:ServerEdits){
 const manualDisplayName=changes.manualDisplayName??node.manualDisplayName??'',manualTags=changes.manualTags??node.manualTags??[];
 const agentDisplayName=node.agentDisplayName??node.displayName,agentTags=node.agentTags??node.tags??[];
 return {agentDisplayName,agentTags,manualDisplayName,manualTags,displayName:manualDisplayName||agentDisplayName,tags:mergeServerTags(agentTags,manualTags)};
}
