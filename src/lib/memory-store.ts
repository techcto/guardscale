import{randomUUID}from'node:crypto';
import type{GuardianEvent,GuardianUser,IncidentRecord,Node,OrgMembership,Organization,OrgType,Product,Settings,Subscription}from'./model';
import{defaultSettings}from'./model';
type State={orgs:Map<string,Organization>;singletonOrgId?:string;memberships:Map<string,OrgMembership>;nodes:Map<string,Node>;incidents:Map<string,IncidentRecord>;events:Map<string,GuardianEvent[]>;users:Map<string,GuardianUser>;passwords:Map<string,string>;subscriptions:Map<string,Subscription>;settings:Map<string,Settings>};
const g=globalThis as typeof globalThis&{guardianState?:State};
export const state:State=g.guardianState??={orgs:new Map(),memberships:new Map(),nodes:new Map(),incidents:new Map(),events:new Map(),users:new Map(),passwords:new Map(),subscriptions:new Map(),settings:new Map()};
g.guardianState=state;
const key=(tenant:string,id:string)=>`${tenant}\0${id}`;
const membershipKey=(orgId:string,userId:string)=>`${orgId}\0${userId}`;
const MAX_EVENTS_PER_NODE=200;
function slugify(name:string){return name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')||randomUUID().slice(0,8)}
export const memoryStore={
  async createOrganization(v:{name:string;ownerId:string;orgType:OrgType}):Promise<Organization>{
    const org:Organization={id:randomUUID(),name:v.name,slug:`${slugify(v.name)}-${randomUUID().slice(0,6)}`,ownerId:v.ownerId,orgType:v.orgType,enrollmentToken:randomUUID(),createdAt:new Date().toISOString()};
    state.orgs.set(org.id,org);
    return org;
  },
  async ensureSingleDeploymentOrg():Promise<Organization>{
    if(state.singletonOrgId){const org=state.orgs.get(state.singletonOrgId);if(org)return org}
    const org:Organization={id:randomUUID(),name:'Guardian.US',slug:'guardian-us',ownerId:'',orgType:'business',enrollmentToken:randomUUID(),createdAt:new Date().toISOString()};
    state.orgs.set(org.id,org);
    state.singletonOrgId=org.id;
    return org;
  },
  async organizationById(id:string){return state.orgs.get(id)??null},
  async organizations(){return[...state.orgs.values()]},
  async putMembership(v:OrgMembership){state.memberships.set(membershipKey(v.orgId,v.userId),v)},
  async membership(orgId:string,userId:string){return state.memberships.get(membershipKey(orgId,userId))??null},
  async membersOfOrg(orgId:string){
    const rows=[...state.memberships.values()].filter(m=>m.orgId===orgId);
    return rows.map(membership=>({membership,user:state.users.get(membership.userId)})).filter((r):r is{membership:OrgMembership;user:GuardianUser}=>!!r.user);
  },
  async orgsForUser(userId:string){
    const rows=[...state.memberships.values()].filter(m=>m.userId===userId);
    return rows.map(membership=>({membership,org:state.orgs.get(membership.orgId)})).filter((r):r is{membership:OrgMembership;org:Organization}=>!!r.org);
  },
  async deleteMembership(orgId:string,userId:string){return state.memberships.delete(membershipKey(orgId,userId))},
  async upsertNode(v:Node){const existing=state.nodes.get(key(v.tenantId,v.serverId));state.nodes.set(key(v.tenantId,v.serverId),{...existing,...v,createdAt:existing?.createdAt??v.createdAt})},
  async nodes(tenant:string){return[...state.nodes.values()].filter(x=>x.tenantId===tenant)},
  async node(tenant:string,serverId:string){return state.nodes.get(key(tenant,serverId))??null},
  async putIncident(v:IncidentRecord){state.incidents.set(key(v.tenantId,v.incidentId),v)},
  async incident(tenant:string,incidentId:string){return state.incidents.get(key(tenant,incidentId))??null},
  async incidents(tenant:string){return[...state.incidents.values()].filter(x=>x.tenantId===tenant)},
  async incidentsForNode(tenant:string,serverId:string){return[...state.incidents.values()].filter(x=>x.tenantId===tenant&&x.serverId===serverId)},
  async putEvent(v:GuardianEvent){const k=key(v.tenantId,v.serverId),list=state.events.get(k)??[];list.push(v);if(list.length>MAX_EVENTS_PER_NODE)list.shift();state.events.set(k,list)},
  async eventsForNode(tenant:string,serverId:string,limit=200){return(state.events.get(key(tenant,serverId))??[]).slice(-limit).reverse()},
  async userByName(username:string){return[...state.users.values()].find(x=>x.username.toLowerCase()===username.toLowerCase())??null},
  async userById(id:string){return state.users.get(id)??null},
  async putUser(v:GuardianUser,passwordHash?:string){state.users.set(v.id,v);if(passwordHash)state.passwords.set(v.id,passwordHash)},
  async password(id:string){return state.passwords.get(id)??null},
  async deleteUser(id:string){state.passwords.delete(id);return state.users.delete(id)},
  async settings(tenant:string){return state.settings.get(tenant)??defaultSettings(tenant)},
  async putSettings(tenant:string,v:Settings){state.settings.set(tenant,v)},
  async products():Promise<Product[]>{return[{id:'starter',name:'Starter',description:'Detection and alerting for a small server fleet.',stripePriceId:process.env.STRIPE_STARTER_PRICE_ID??'',monthlyPrice:49,serverLimit:5,active:true},{id:'scale',name:'Scale',description:'Response automation and expanded infrastructure coverage.',stripePriceId:process.env.STRIPE_SCALE_PRICE_ID??'',monthlyPrice:199,serverLimit:50,active:true}]},
  async subscriptions(userId:string){return[...state.subscriptions.values()].filter(x=>x.userId===userId)},
  async putSubscription(v:Subscription){state.subscriptions.set(v.id,v)},
};
export type Store=typeof memoryStore;
