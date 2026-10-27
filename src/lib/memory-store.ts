import{randomUUID}from'node:crypto';
import type{GuardScaleEvent,GuardScaleUser,IncidentRecord,Node,OrgMembership,Organization,OrgType,Product,Settings,Subscription,UsageCounts,UsageDelta,UsageHour}from'./model';
import{defaultSettings}from'./model';
import {hasPaidEntitlement} from './subscription-entitlement';
import pricing from './billing-pricing.json';
type State={orgs:Map<string,Organization>;singletonOrgId?:string;memberships:Map<string,OrgMembership>;nodes:Map<string,Node>;incidents:Map<string,IncidentRecord>;events:Map<string,GuardScaleEvent[]>;users:Map<string,GuardScaleUser>;passwords:Map<string,string>;emails?:Map<string,string>;subscriptions:Map<string,Subscription>;settings:Map<string,Settings>;usage:Map<string,UsageHour>;claims:Set<string>};
const g=globalThis as typeof globalThis&{guardscaleState?:State};
export const state:State=g.guardscaleState??={orgs:new Map(),memberships:new Map(),nodes:new Map(),incidents:new Map(),events:new Map(),users:new Map(),passwords:new Map(),subscriptions:new Map(),settings:new Map(),usage:new Map(),claims:new Set()};
g.guardscaleState=state;
const key=(tenant:string,id:string)=>`${tenant}\0${id}`;
const membershipKey=(orgId:string,userId:string)=>`${orgId}\0${userId}`;
const MAX_EVENTS_PER_NODE=200;
function slugify(name:string){return name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')||randomUUID().slice(0,8)}
export const memoryStore={
  async createOrganization(v:{name:string;ownerId:string;orgType:OrgType;contactEmail?:string;contactPhone?:string}):Promise<Organization>{
    const org:Organization={id:randomUUID(),name:v.name,slug:`${slugify(v.name)}-${randomUUID().slice(0,6)}`,ownerId:v.ownerId,orgType:v.orgType,contactEmail:v.contactEmail,contactPhone:v.contactPhone,enrollmentToken:randomUUID(),createdAt:new Date().toISOString()};
    state.orgs.set(org.id,org);
    return org;
  },
  async ensureSingleDeploymentOrg():Promise<Organization>{
    if(state.singletonOrgId){const org=state.orgs.get(state.singletonOrgId);if(org)return org}
    const org:Organization={id:randomUUID(),name:'GuardScale',slug:'guardscale',ownerId:'',orgType:'business',enrollmentToken:randomUUID(),createdAt:new Date().toISOString()};
    state.orgs.set(org.id,org);
    state.singletonOrgId=org.id;
    return org;
  },
  async singleDeploymentOrgId():Promise<string|null>{return state.singletonOrgId&&state.orgs.has(state.singletonOrgId)?state.singletonOrgId:null},
  async organizationById(id:string){return state.orgs.get(id)??null},
  async organizations(){return[...state.orgs.values()]},
  async putOrganization(v:Organization){state.orgs.set(v.id,v)},
  async deleteOrganization(id:string){
    for(const[k,m]of state.memberships)if(m.orgId===id)state.memberships.delete(k);
    for(const map of[state.nodes,state.incidents,state.events,state.usage])for(const k of map.keys())if(k.startsWith(id+'\0'))map.delete(k);
    for(const k of state.claims)if(k.startsWith(id+'\0'))state.claims.delete(k);
    for(const[k,v]of state.subscriptions)if(v.orgId===id)state.subscriptions.delete(k);
    state.settings.delete(id);
    return state.orgs.delete(id);
  },
  async putMembership(v:OrgMembership){state.memberships.set(membershipKey(v.orgId,v.userId),v)},
  async membership(orgId:string,userId:string){return state.memberships.get(membershipKey(orgId,userId))??null},
  async membersOfOrg(orgId:string){
    const rows=[...state.memberships.values()].filter(m=>m.orgId===orgId);
    return rows.map(membership=>({membership,user:state.users.get(membership.userId)})).filter((r):r is{membership:OrgMembership;user:GuardScaleUser}=>!!r.user);
  },
  async orgsForUser(userId:string){
    const rows=[...state.memberships.values()].filter(m=>m.userId===userId);
    return rows.map(membership=>({membership,org:state.orgs.get(membership.orgId)})).filter((r):r is{membership:OrgMembership;org:Organization}=>!!r.org);
  },
  async deleteMembership(orgId:string,userId:string){return state.memberships.delete(membershipKey(orgId,userId))},
  async upsertNode(v:Node){const existing=state.nodes.get(key(v.tenantId,v.serverId));if(existing?.deletedAt)throw new Error('Server removed');state.nodes.set(key(v.tenantId,v.serverId),{...existing,...v,createdAt:existing?.createdAt??v.createdAt})},
  async nodes(tenant:string){return[...state.nodes.values()].filter(x=>x.tenantId===tenant&&!x.deletedAt)},
  async nodeRecord(tenant:string,serverId:string){return state.nodes.get(key(tenant,serverId))??null},
  async setNodeWebsites(tenant:string,serverId:string,websiteUrls:string[]){const node=state.nodes.get(key(tenant,serverId));if(!node||node.deletedAt)throw Error('Server removed');state.nodes.set(key(tenant,serverId),{...node,websiteUrls})},
  async node(tenant:string,serverId:string){const node=state.nodes.get(key(tenant,serverId));return node&&!node.deletedAt?node:null},
  async retireNode(tenant:string,serverId:string){const node=state.nodes.get(key(tenant,serverId));if(!node)return false;state.nodes.set(key(tenant,serverId),{...node,deletedAt:new Date().toISOString(),status:'offline'});return true},
  async purgeCollectedData(tenant:string){let events=0,incidents=0;for(const [k,list]of state.events){if(k.startsWith(tenant+'\0')){events+=list.length;state.events.delete(k)}}for(const [k,v]of state.incidents){if(v.tenantId===tenant){incidents++;state.incidents.delete(k)}}return{events,incidents}},
  async putIncident(v:IncidentRecord){state.incidents.set(key(v.tenantId,v.incidentId),v)},
  async incident(tenant:string,incidentId:string){return state.incidents.get(key(tenant,incidentId))??null},
  async incidents(tenant:string){return[...state.incidents.values()].filter(x=>x.tenantId===tenant)},
  async incidentsForNode(tenant:string,serverId:string){return[...state.incidents.values()].filter(x=>x.tenantId===tenant&&x.serverId===serverId)},
  async putEvent(v:GuardScaleEvent){const k=key(v.tenantId,v.serverId),list=state.events.get(k)??[];if(v.id&&list.some(e=>e.id===v.id))return false;list.push(v);if(list.length>MAX_EVENTS_PER_NODE)list.shift();state.events.set(k,list);return true},
  async eventsForNode(tenant:string,serverId:string,limit=200){return(state.events.get(key(tenant,serverId))??[]).slice(-limit).reverse()},
  async userByName(username:string){return[...state.users.values()].find(x=>x.username.toLowerCase()===username.toLowerCase())??null},
  async userById(id:string){return state.users.get(id)??null},
  async reserveVerificationEmail(id:string,email:string,sentAt:string,cutoff:string){const user=state.users.get(id);if(!user||user.email!==email||user.emailVerified!==false||user.verificationSentAt&&user.verificationSentAt>cutoff)return false;state.users.set(id,{...user,verificationSentAt:sentAt});return true;},
  async releaseVerificationEmail(id:string,sentAt:string){const user=state.users.get(id);if(user?.verificationSentAt===sentAt){const next={...user};delete next.verificationSentAt;state.users.set(id,next);}},
  async verifyUserEmail(id:string,email:string){const user=state.users.get(id);if(!user||user.email!==email||user.emailVerified!==false||user.status!=='active')return false;state.users.set(id,{...user,emailVerified:true,updatedAt:new Date().toISOString()});return true;},
  async putUser(v:GuardScaleUser,passwordHash?:string){state.users.set(v.id,v);if(passwordHash)state.passwords.set(v.id,passwordHash)},
  async password(id:string){return state.passwords.get(id)??null},
  async createUser(v:GuardScaleUser,passwordHash:string){const emails=state.emails??=new Map(),email=v.email?.toLowerCase();if(state.users.has(v.id)||(email&&emails.has(email)))return false;if(email)emails.set(email,v.id);state.users.set(v.id,v);state.passwords.set(v.id,passwordHash);return true},
  async deleteUser(id:string){const email=state.users.get(id)?.email?.toLowerCase();if(email&&state.emails?.get(email)===id)state.emails.delete(email);state.passwords.delete(id);return state.users.delete(id)},
  async settings(tenant:string){return state.settings.get(tenant)??defaultSettings(tenant)},
  async putSettings(tenant:string,v:Settings){state.settings.set(tenant,v)},
  async products():Promise<Product[]>{return[{id:'dev',name:pricing.planNames.dev,description:'Free tier for a single personal workspace.',stripePriceId:'',monthlyPrice:0,serverLimit:pricing.includedServers.dev,logMbIncluded:1000,aiCreditsIncluded:pricing.includedAiCredits.dev,active:true},{id:'starter',name:pricing.planNames.starter,description:'Detection and alerting for a small server fleet.',stripePriceId:process.env.STRIPE_STARTER_PRICE_ID??'',monthlyPrice:49,serverLimit:pricing.includedServers.starter,logMbIncluded:10000,aiCreditsIncluded:pricing.includedAiCredits.starter,active:true},{id:'scale',name:pricing.planNames.scale,description:'Response automation and expanded infrastructure coverage.',stripePriceId:process.env.STRIPE_SCALE_PRICE_ID??'',monthlyPrice:199,serverLimit:pricing.includedServers.scale,logMbIncluded:100000,aiCreditsIncluded:pricing.includedAiCredits.scale,active:true}]},
  async subscriptions(orgId:string){return[...state.subscriptions.values()].filter(x=>x.orgId===orgId)},
  async activeSubscriptionForOrg(orgId:string){const rows=[...state.subscriptions.values()].filter(x=>x.orgId===orgId&&hasPaidEntitlement(x));return rows.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0]??null},
  async putSubscription(v:Subscription){state.subscriptions.set(v.id,v)},
  async addUsage(orgId:string,periodStart:string,hour:string,delta:UsageDelta,billable:boolean,claim?:string){if(claim){if(state.claims.has(key(orgId,'CLAIM#'+claim)))return false;state.claims.add(key(orgId,'CLAIM#'+claim))}for(const k of [key(orgId,'H#'+hour+'#'+periodStart),key(orgId,'P#'+periodStart)]){const v=state.usage.get(k)??{hour,periodStart,billable:false,exported:{},serverHours:0,logBytes:0,ai:{}};v.serverHours+=delta.serverHours??0;v.logBytes+=delta.logBytes??0;if(delta.ai){const m=v.ai[delta.ai.model]??={calls:0,inputTokens:0,outputTokens:0,unknownCalls:0};m.calls+=delta.ai.calls??0;m.inputTokens+=delta.ai.inputTokens??0;m.outputTokens+=delta.ai.outputTokens??0;m.unknownCalls+=delta.ai.unknownCalls??0}if(billable&&k.includes('\0H#'))v.billable=true;state.usage.set(k,v)}return true},
  async usageTotals(orgId:string,periodStart:string):Promise<UsageCounts>{const v=state.usage.get(key(orgId,'P#'+periodStart));return structuredClone({serverHours:v?.serverHours??0,logBytes:v?.logBytes??0,ai:v?.ai??{}})},
  async usageHours(orgId:string,fromHour:string){return[...state.usage.entries()].filter(([k,v])=>k.startsWith(key(orgId,'H#'))&&v.hour>=fromHour).map(([,v])=>structuredClone(v)).sort((a,b)=>a.hour.localeCompare(b.hour))},
  async markUsageHour(orgId:string,hour:string,periodStart:string,fields:{exported?:Record<string,number>;exportAttempts?:number;lastExportError?:string}){const k=key(orgId,'H#'+hour+'#'+periodStart),v=state.usage.get(k);if(v)state.usage.set(k,{...v,...fields,exported:{...v.exported,...fields.exported}})},
  async claimOnce(orgId:string,claim:string,_ttlDays:number){const k=key(orgId,'CLAIM#'+claim);if(state.claims.has(k))return false;state.claims.add(k);return true},
};
export type Store=typeof memoryStore;
