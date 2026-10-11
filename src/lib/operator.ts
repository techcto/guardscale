import{NextRequest}from'next/server';import{sessionCookie,verifySession}from'./session';
import {defaultActiveOrgForRoot} from './org-resolve';
import {store} from './store';
export async function operator(req:NextRequest){const session=await verifySession(req.cookies.get(sessionCookie)?.value,process.env.GUARDSCALE_SESSION_SECRET??'');if(session?.role==='root'&&(!session.orgId||!await store.organizationById(session.orgId)))return {...session,orgId:await defaultActiveOrgForRoot()};return session}
