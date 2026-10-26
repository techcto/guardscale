import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {sessionCookie,verifySession} from './session';
import {store} from './store';
import type {GuardScaleUser,Organization} from './model';
export const saasMode=()=>process.env.GUARDSCALE_DEPLOYMENT_MODE==='saas';
// Layouts are not re-rendered on every navigation, so each admin page calls this itself.
export async function rootSession(){const s=await verifySession((await cookies()).get(sessionCookie)?.value,process.env.GUARDSCALE_SESSION_SECRET??'');if(!s)redirect('/login');if(s.role!=='root')redirect('/settings');return s}
// Deletion follows Cloud's admin console: preview what goes with the record, confirm by typing DELETE, then remove it for real.
// Anything that would silently break billing or the operator's own workspace is refused instead (HTTP 409).
export class DeletionBlocked extends Error{}
export type DeletionImpact={name:string;type:'organization'|'user';blocker:string|null;subtext:string;related:{name:string;items:string[]}[]};
async function organizationBlocker(org:Organization){
 if(org.id===await store.singleDeploymentOrgId())return 'The operator workspace cannot be deleted.';
 if((await store.subscriptions(org.id)).some(s=>s.stripeSubscriptionId&&s.status!=='canceled'))return `${org.name} has a Stripe subscription that is not canceled. Cancel it from the organization's billing page first so usage is invoiced and billing stops.`;
 return null;
}
// Members whose only organizations are being deleted lose their accounts too: without an organization they can neither
// sign in nor be found in the admin directory.
async function lastMembers(orgIds:string[],exceptUserId?:string){
 const gone=new Set(orgIds),users=new Map<string,GuardScaleUser>();
 for(const id of orgIds)for(const {user} of await store.membersOfOrg(id))if(user.id!==exceptUserId)users.set(user.id,user);
 const last:GuardScaleUser[]=[];
 for(const user of users.values())if((await store.orgsForUser(user.id)).every(m=>gone.has(m.org.id)))last.push(user);
 return last;
}
// Admin views never show logs, events or incidents, so those are counted, not listed.
export async function organizationDeletion(id:string):Promise<DeletionImpact|null>{
 const org=await store.organizationById(id);if(!org)return null;
 const [members,last,nodes,incidents,blocker]=await Promise.all([store.membersOfOrg(id),lastMembers([id]),store.nodes(id),store.incidents(id),organizationBlocker(org)]);
 return {name:org.name,type:'organization',blocker,subtext:'Members lose access immediately, and members who belong to no other organization are deleted with it. Servers, their agent enrollment, logs, events, incidents, response commands, usage records and settings are deleted too. Logs on the servers themselves and delivered notifications are not affected.',related:[{name:'Accounts deleted',items:last.map(u=>u.displayName)},{name:'Members removed (accounts kept)',items:members.filter(m=>!last.some(u=>u.id===m.user.id)).map(m=>m.user.displayName)},{name:'Servers',items:nodes.map(n=>n.displayName||n.serverId)},{name:'Also deleted',items:incidents.length?[`${incidents.length} incident${incidents.length===1?'':'s'}`]:[]}]};
}
export async function deleteOrganization(id:string){
 const org=await store.organizationById(id);if(!org)return false;
 const blocker=await organizationBlocker(org);if(blocker)throw new DeletionBlocked(blocker);
 const members=await store.membersOfOrg(id);
 const deleted=await store.deleteOrganization(id);
 for(const {user} of members)if(!(await store.orgsForUser(user.id)).length)await store.deleteUser(user.id);
 return deleted;
}
// Like Cloud: an owned organization that other active members still use passes to one of them (an admin first, then
// the longest-standing member, who becomes admin); one nobody else uses is deleted with the user.
async function userPlan(id:string){
 const user=await store.userById(id);if(!user)return null;
 const memberships=await store.orgsForUser(id),transfer:{org:Organization;to:GuardScaleUser}[]=[],remove:Organization[]=[];let blocker:string|null=null;
 for(const {org} of memberships.filter(m=>m.org.ownerId===id)){
  const heir=(await store.membersOfOrg(org.id)).filter(m=>m.user.id!==id&&m.membership.status==='active'&&m.user.status==='active').sort((a,b)=>Number(b.membership.role==='admin')-Number(a.membership.role==='admin')||a.membership.createdAt.localeCompare(b.membership.createdAt))[0];
  if(heir)transfer.push({org,to:heir.user});else{remove.push(org);blocker??=await organizationBlocker(org)}
 }
 return {user,memberships,transfer,remove,blocker};
}
export async function userDeletion(id:string):Promise<DeletionImpact|null>{
 const plan=await userPlan(id);if(!plan)return null;
 const last=await lastMembers(plan.remove.map(o=>o.id),id);
 return {name:plan.user.displayName,type:'user',blocker:plan.blocker,subtext:'Deleting this user also deletes the organizations they own that nobody else uses, with their servers, logs, incidents and usage, and the accounts of members who belong to no other organization. Shared organizations they own pass to another active member.',related:[{name:'Organizations deleted',items:plan.remove.map(o=>o.name)},{name:'Ownership transferred',items:plan.transfer.map(t=>`${t.org.name} → ${t.to.displayName}`)},{name:'Memberships removed',items:plan.memberships.filter(m=>!plan.remove.some(o=>o.id===m.org.id)).map(m=>m.org.name)},{name:'Member accounts deleted',items:last.map(u=>u.displayName)}]};
}
export async function deleteUserAccount(id:string){
 const plan=await userPlan(id);if(!plan)return false;
 if(plan.blocker)throw new DeletionBlocked(plan.blocker);
 const now=new Date().toISOString();
 for(const {org} of plan.memberships)await store.deleteMembership(org.id,id);
 for(const {org,to} of plan.transfer){
  await store.putOrganization({...org,ownerId:to.id});
  const m=await store.membership(org.id,to.id);if(m&&m.role!=='admin')await store.putMembership({...m,role:'admin',updatedAt:now});
 }
 for(const org of plan.remove)await deleteOrganization(org.id);
 return store.deleteUser(id);
}
