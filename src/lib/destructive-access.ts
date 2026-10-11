import type {NextRequest} from 'next/server';
import {operator} from './operator';
import {store} from './store';
import {requestOrigin} from './session';
export async function destructiveAccess(req:NextRequest){
  if(req.headers.get('origin')!==requestOrigin(req))return null;
  const session=await operator(req);
  if(!session?.orgId)return null;
  if(session.role==='root')return session;
  const membership=await store.membership(session.orgId,session.id);
  return membership?.status==='active'&&membership.role==='admin'?session:null;
}
