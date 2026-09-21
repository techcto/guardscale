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
  if(process.env.GUARDIAN_DEPLOYMENT_MODE!=='saas')return (await store.ensureSingleDeploymentOrg()).id;
  const orgs=await store.organizations();
  return orgs[0]?.id??'';
}
