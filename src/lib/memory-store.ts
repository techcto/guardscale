import{randomUUID}from'node:crypto';
import type{GuardianEvent,GuardianUser,IncidentRecord,Node,Organization,Product,Settings,Subscription}from'./model';
import{defaultSettings}from'./model';
type State={org?:Organization;nodes:Map<string,Node>;incidents:Map<string,IncidentRecord>;events:Map<string,GuardianEvent[]>;users:Map<string,GuardianUser>;passwords:Map<string,string>;subscriptions:Map<string,Subscription>;settings:Map<string,Settings>};
const g=globalThis as typeof globalThis&{guardianState?:State};
export const state:State=g.guardianState??={nodes:new Map(),incidents:new Map(),events:new Map(),users:new Map(),passwords:new Map(),subscriptions:new Map(),settings:new Map()};
g.guardianState=state;
const key=(tenant:string,id:string)=>`${tenant}\0${id}`;
const MAX_EVENTS_PER_NODE=200;
export const memoryStore={
  async ensureOrganization(){if(!state.org)state.org={id:randomUUID(),name:'Guardian.US',enrollmentToken:randomUUID(),createdAt:new Date().toISOString()};return state.org},
  async organization(){return state.org??null},
  async upsertNode(v:Node){const existing=state.nodes.get(key(v.tenantId,v.serverId));state.nodes.set(key(v.tenantId,v.serverId),{...existing,...v,createdAt:existing?.createdAt??v.createdAt})},
  async nodes(tenant:string){return[...state.nodes.values()].filter(x=>x.tenantId===tenant)},
  async node(tenant:string,serverId:string){return state.nodes.get(key(tenant,serverId))??null},
  async putIncident(v:IncidentRecord){state.incidents.set(key(v.tenantId,v.incidentId),v)},
  async incident(tenant:string,incidentId:string){return state.incidents.get(key(tenant,incidentId))??null},
  async incidents(tenant:string){return[...state.incidents.values()].filter(x=>x.tenantId===tenant)},
  async incidentsForNode(tenant:string,serverId:string){return[...state.incidents.values()].filter(x=>x.tenantId===tenant&&x.serverId===serverId)},
  async putEvent(v:GuardianEvent){const k=key(v.tenantId,v.serverId),list=state.events.get(k)??[];list.push(v);if(list.length>MAX_EVENTS_PER_NODE)list.shift();state.events.set(k,list)},
  async eventsForNode(tenant:string,serverId:string,limit=200){return(state.events.get(key(tenant,serverId))??[]).slice(-limit).reverse()},
  async users(){return[...state.users.values()]},
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
