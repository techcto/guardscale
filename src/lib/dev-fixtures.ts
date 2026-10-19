import {randomUUID} from 'node:crypto';
import {store} from './store';
import {hashPassword} from './password';
import {hourOf,usagePeriod} from './usage';
import type {MembershipRole,Node,OrgType} from './model';
// Synthetic data for `npm run dev` (in-memory store) and the local docker stack (DynamoDB local).
// AWS deployments never set GUARDSCALE_DYNAMODB_ENDPOINT, so they are never seeded.
export const devFixturePassword='guardscale-dev-fixture';
type Fixture={name:string;orgType:OrgType;contactEmail?:string;members:[string,string,MembershipRole][];servers:[string,string,Node['status'],number,number][];logMb:number;aiCalls:number};// servers: name, platform, status, websites, hours since heartbeat
const fixtures:Fixture[]=[
 {name:'Acme Retail',orgType:'business',contactEmail:'ops@example.com',members:[['ava.patel','Ava Patel','admin'],['sam.lee','Sam Lee','operator']],servers:[['web-01','amd64','healthy',3,0],['web-02','amd64','healthy',2,0],['db-01','arm64','stale',0,2]],logMb:640,aiCalls:42},
 {name:'Bluebird Media',orgType:'business',contactEmail:'it@example.com',members:[['maria.gomez','Maria Gomez','admin'],['ava.patel','Ava Patel','viewer']],servers:[['edge-01','amd64','healthy',5,0],['edge-02','amd64','offline',1,30]],logMb:1280,aiCalls:12},
 {name:'Jordan Kim Labs',orgType:'personal',members:[['jordan.kim','Jordan Kim','admin']],servers:[['lab-01','arm64','pending',0,0]],logMb:18,aiCalls:0},
];
const USAGE_HOURS=48;
function localDynamo(){try{return ['localhost','127.0.0.1','dynamodb'].includes(new URL(process.env.GUARDSCALE_DYNAMODB_ENDPOINT??'').hostname)}catch{return false}}
export const devFixturesEnabled=()=>process.env.GUARDSCALE_DEPLOYMENT_MODE==='saas'&&(process.env.GUARDSCALE_TABLE?localDynamo():process.env.NODE_ENV==='development');
export async function seedDevFixtures(){
 const g=globalThis as typeof globalThis&{guardscaleDevFixtures?:boolean};
 if(!devFixturesEnabled()||g.guardscaleDevFixtures)return false;
 g.guardscaleDevFixtures=true;
 const now=Date.now(),iso=(hoursAgo:number)=>new Date(now-hoursAgo*3600000).toISOString(),period=usagePeriod(null);
 // DynamoDB local persists across restarts: organizations, users, and servers are created once; usage is added once per billing period.
 const existing=new Map((await store.organizations()).map(o=>[o.name,o]));let seeded=false;
 for(const f of fixtures){
  let org=existing.get(f.name);
  if(!org){
   org=await store.createOrganization({name:f.name,ownerId:'root',orgType:f.orgType,contactEmail:f.contactEmail});seeded=true;
   for(const [username,displayName,role] of f.members){
    let user=await store.userByName(username);
    if(!user){user={id:randomUUID(),username,displayName,status:'active',createdAt:iso(24*30),updatedAt:iso(24*30)};await store.putUser(user,hashPassword(devFixturePassword))}
    await store.putMembership({id:randomUUID(),orgId:org.id,userId:user.id,role,status:'active',createdAt:iso(24*30),updatedAt:iso(24*30)});
   }
   for(const [name,platform,status,sites,hoursAgo] of f.servers)await store.upsertNode({tenantId:org.id,serverId:'fixture-'+name,agentId:'dev-fixture',displayName:name,platform,websiteUrls:Array.from({length:sites},(_,i)=>`https://site-${i+1}.example.com`),tags:['dev-fixture'],status,createdAt:iso(24*14),lastHeartbeat:iso(hoursAgo)});
  }
  const totals=await store.usageTotals(org.id,period.start);
  if(totals.serverHours||totals.logBytes)continue;
  const active=f.servers.filter(s=>s[2]!=='pending').length,start=Date.parse(period.start);
  for(let h=0;h<USAGE_HOURS;h++){
   const at=now-h*3600000;if(at<start)break;
   await store.addUsage(org.id,period.start,hourOf(new Date(at)),{serverHours:active,logBytes:Math.round(f.logMb*1024*1024/USAGE_HOURS),...(h<f.aiCalls?{ai:{model:'fixture-model',calls:1,inputTokens:1200,outputTokens:300}}:{})},false);
  }
  seeded=true;
 }
 if(seeded)console.log(`GuardScale dev fixtures loaded: ${fixtures.length} organizations. Fixture users sign in with password "${devFixturePassword}".`);
 return seeded;
}
