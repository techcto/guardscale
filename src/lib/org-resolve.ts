import {store} from './store';
import type {MembershipRole} from './model';

export async function defaultActiveOrgForUser(userId:string):Promise<{orgId:string;role:MembershipRole}|null>{
  const memberships=await store.orgsForUser(userId);
  if(!memberships.length)return null;
  const personal=memberships.find(m=>m.org.orgType==='personal');
  const chosen=personal??memberships[0];
  return {orgId:chosen.org.id,role:chosen.membership.role};
}

export async function defaultActiveOrgForRoot():Promise<string>{
  // A dedicated system workspace, never an arbitrary customer's first org.
  const org=await store.ensureSingleDeploymentOrg();
  if(!await store.membership(org.id,'root')){
    const now=new Date().toISOString();
    await store.putMembership({id:`root-${org.id}`,orgId:org.id,userId:'root',role:'admin',status:'active',createdAt:now,updatedAt:now});
  }
  return org.id;
}
